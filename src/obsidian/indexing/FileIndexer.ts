import { VectorDatabase } from '../../database/interfaces/VectorDatabase';
import { ChunkStrategy, VectorData, SearchResult } from '../../types/Common';
import { ObsidianManager, DiscoveryOptions } from './ObsidianManager';
import { MarkdownParser } from '../parser/MarkdownParser';
import { HeaderBasedChunker } from '../chunking/HeaderBasedChunker';
import { TokenCounter } from '../chunking/TokenCounter';
import { ContentPreserver } from '../chunking/ContentPreserver';
import { Logger } from '../../utils/Logger';

/**
 * Configuration for file indexing operations
 */
export interface IndexingConfig {
  // Chunking configuration
  chunkStrategy: ChunkStrategy;
  
  // Processing options
  batchSize: number;
  maxConcurrency: number;
  skipErrorFiles: boolean;
  
  // Content processing
  preserveSpecialBlocks: boolean;
  generateEmbeddings: boolean;
  
  // Metadata options
  includeFileMetadata: boolean;
  customFields: string[];
  
  // File discovery options
  discoveryOptions?: Partial<DiscoveryOptions>;
  
  // Embedding provider
  embeddingProvider?: {
    embed(content: string): Promise<number[]>;
  };
  
  // Performance options
  progressCallback?: (progress: IndexingProgress) => void;
}

/**
 * Progress information for indexing operations
 */
export interface IndexingProgress {
  processedFiles: number;
  totalFiles: number;
  processedChunks: number;
  totalChunks: number;
  currentFile?: string;
  errors: IndexingError[];
  startTime: Date;
  estimatedTimeRemaining?: number;
}

/**
 * Error information for failed file processing
 */
export interface IndexingError {
  file: string;
  error: string;
  stage: 'parsing' | 'chunking' | 'embedding' | 'storage';
  timestamp: Date;
}

/**
 * Result of indexing operations
 */
export interface IndexingResult {
  success: boolean;
  processedFiles: number;
  totalChunks: number;
  errors: IndexingError[];
  processingTime: number;
  skippedFiles: string[];
}

/**
 * File indexer that processes Obsidian files into vector database chunks
 */
export class FileIndexer {
  private readonly vectorDb: VectorDatabase;
  private readonly obsidianManager: ObsidianManager;
  private readonly markdownParser: MarkdownParser;
  private readonly chunker: HeaderBasedChunker;
  private readonly tokenCounter: TokenCounter;
  private readonly contentPreserver: ContentPreserver;
  private readonly logger: Logger;
  private readonly config: IndexingConfig;

  constructor(
    vectorDb: VectorDatabase,
    obsidianManager: ObsidianManager,
    config: Partial<IndexingConfig> = {},
    logger?: Logger
  ) {
    this.vectorDb = vectorDb;
    this.obsidianManager = obsidianManager;
    this.logger = logger || new Logger('FileIndexer');
    
    // Set up configuration with defaults
    this.config = {
      chunkStrategy: {
        splitByHeaders: true,
        splitByParagraphs: true,
        maxTokens: 512,
        overlapTokens: 50,
        includeHeaders: true,
        preserveCodeBlocks: true,
        preserveTables: true,
        preserveCallouts: true,
      },
      batchSize: 10,
      maxConcurrency: 3,
      skipErrorFiles: true,
      preserveSpecialBlocks: true,
      generateEmbeddings: true,
      includeFileMetadata: true,
      customFields: [],
      ...config,
    };

    // Initialize components
    this.markdownParser = new MarkdownParser(this.logger.child('Parser'));
    this.chunker = new HeaderBasedChunker(this.config.chunkStrategy, this.logger.child('Chunker'));
    this.tokenCounter = new TokenCounter({
      strategy: 'gpt-estimate',
    }, this.logger.child('TokenCounter'));
    this.contentPreserver = new ContentPreserver(this.logger.child('ContentPreserver'));
  }

  /**
   * Index all files in the vault
   */
  async indexAllFiles(): Promise<IndexingResult> {
    this.logger.info('Starting full vault indexing');
    
    try {
      const files = await this.obsidianManager.discoverFiles(this.config.discoveryOptions || {});

      return await this.indexFiles(files.map(f => f.path));
    } catch (error) {
      this.logger.error('Error during full indexing:', error);
      throw error;
    }
  }

  /**
   * Index specific files
   */
  async indexFiles(filePaths: string[]): Promise<IndexingResult> {
    const startTime = Date.now();
    const errors: IndexingError[] = [];
    const skippedFiles: string[] = [];
    let processedFiles = 0;
    let totalChunks = 0;

    this.logger.info(`Starting indexing of ${filePaths.length} files`);

    // Initialize progress tracking
    const progress: IndexingProgress = {
      processedFiles: 0,
      totalFiles: filePaths.length,
      processedChunks: 0,
      totalChunks: 0,
      errors: [],
      startTime: new Date(),
    };

    try {
      // Process files in batches
      for (let i = 0; i < filePaths.length; i += this.config.batchSize) {
        const batch = filePaths.slice(i, i + this.config.batchSize);
        
        // Process batch with concurrency control
        const batchPromises = batch.map(async (filePath) => {
          try {
            progress.currentFile = filePath;
            if (this.config.progressCallback) {
              this.config.progressCallback(progress);
            }

            const result = await this.indexSingleFile(filePath);
            processedFiles++;
            totalChunks += result.chunkCount;
            
            progress.processedFiles++;
            progress.processedChunks += result.chunkCount;
            
            return { success: true, filePath, chunkCount: result.chunkCount };
          } catch (error) {
            const indexingError: IndexingError = {
              file: filePath,
              error: error instanceof Error ? error.message : String(error),
              stage: 'parsing', // Will be more specific in actual implementation
              timestamp: new Date(),
            };
            
            errors.push(indexingError);
            progress.errors.push(indexingError);

            if (!this.config.skipErrorFiles) {
              throw error;
            }

            skippedFiles.push(filePath);
            this.logger.warn(`Skipping file due to error: ${filePath}`, error);
            
            return { success: false, filePath, chunkCount: 0 };
          }
        });

        // Wait for batch to complete
        await Promise.all(batchPromises);

        // Update progress estimate
        const elapsed = Date.now() - startTime;
        const fileProgress = progress.processedFiles / progress.totalFiles;
        if (fileProgress > 0) {
          progress.estimatedTimeRemaining = Math.round(
            (elapsed / fileProgress) - elapsed
          );
        }

        if (this.config.progressCallback) {
          this.config.progressCallback(progress);
        }
      }

      const processingTime = Date.now() - startTime;
      
      const result: IndexingResult = {
        success: errors.length === 0 || this.config.skipErrorFiles,
        processedFiles,
        totalChunks,
        errors,
        processingTime,
        skippedFiles,
      };

      this.logger.info(
        `Indexing completed: ${processedFiles} files, ${totalChunks} chunks, ${errors.length} errors`
      );

      return result;

    } catch (error) {
      this.logger.error('Error during file indexing:', error);
      throw error;
    }
  }

  /**
   * Index a single file
   */
  async indexSingleFile(filePath: string): Promise<{ chunkCount: number }> {
    this.logger.debug(`Indexing file: ${filePath}`);

    try {
      // Check if file needs reindexing
      const needsReindexing = await this.obsidianManager.needsFileReindexing(filePath);
      if (!needsReindexing) {
        this.logger.debug(`File up to date, skipping: ${filePath}`);
        return { chunkCount: 0 };
      }

      // Read and parse file
      const absolutePath = this.obsidianManager.getAbsolutePath(filePath);
      const content = await this.readFileContent(absolutePath);
      
      if (!content || content.trim().length === 0) {
        this.logger.warn(`File is empty, skipping: ${filePath}`);
        return { chunkCount: 0 };
      }

      // Parse markdown
      const parsed = await this.markdownParser.parse(content, {
        generateHtml: false, // Don't need HTML for indexing
        extractPlainText: true,
        processWikiLinks: true,
        extractTags: true,
        extractHeadings: true,
        customFields: this.config.customFields,
      });

      // Skip hidden documents if configured
      if (parsed.metadata.isHidden) {
        this.logger.debug(`File is marked as hidden, skipping: ${filePath}`);
        return { chunkCount: 0 };
      }

      // Chunk the document
      const chunkingResult = await this.chunker.chunk(parsed, filePath);
      
      if (chunkingResult.chunks.length === 0) {
        this.logger.warn(`No chunks generated for file: ${filePath}`);
        return { chunkCount: 0 };
      }

      // Remove existing chunks for this file
      await this.removeExistingChunks(filePath);

      // Process chunks and store in database
      const vectorData: VectorData[] = [];
      
      for (const chunk of chunkingResult.chunks) {
        const vector = await this.generateEmbedding(chunk.content);
        
        const metadata = {
          filePath: chunk.sourceFile,
          title: chunk.metadata.title || (await this.extractTitleFromPath(filePath)),
          tags: chunk.metadata.tags,
          category: await this.extractCategoryFromPath(filePath),
          source: 'obsidian',
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunkingResult.chunks.length,
          lastModified: new Date(),
          
          // Chunk-specific metadata
          section: chunk.section,
          headers: chunk.headers,
          chunkType: chunk.metadata.type,
          tokens: chunk.tokens,
          
          // Content flags
          hasCodeBlocks: chunk.metadata.hasCodeBlocks,
          hasTables: chunk.metadata.hasTables,
          hasCallouts: chunk.metadata.hasCallouts,
          hasWikiLinks: chunk.metadata.hasWikiLinks,
          
          // Custom fields
          ...chunk.metadata.custom,
        };

        vectorData.push({
          id: chunk.id,
          vector,
          metadata,
          content: chunk.content,
        });
      }

      // Store chunks in database
      await this.vectorDb.upsert(vectorData);

      this.logger.debug(
        `Indexed file: ${filePath} (${chunkingResult.chunks.length} chunks)`
      );

      return { chunkCount: chunkingResult.chunks.length };

    } catch (error) {
      this.logger.error(`Error indexing file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Remove existing chunks for a file from the database
   */
  private async removeExistingChunks(filePath: string): Promise<void> {
    try {
      // Query for existing chunks from this file
      const existingChunks = await this.vectorDb.query('', {
        limit: 1000, // Reasonable limit for file chunks
        includeMetadata: true,
      });

      const chunksToDelete = existingChunks.results
        .filter((result: SearchResult) => result.metadata.filePath === filePath)
        .map((result: SearchResult) => result.id);

      if (chunksToDelete.length > 0) {
        await this.vectorDb.delete(chunksToDelete);
        this.logger.debug(
          `Removed ${chunksToDelete.length} existing chunks for: ${filePath}`
        );
      }
    } catch (error) {
      this.logger.warn(`Error removing existing chunks for ${filePath}:`, error);
      // Continue with indexing even if cleanup fails
    }
  }

  /**
   * Generate embedding for content
   */
  private async generateEmbedding(content: string): Promise<number[]> {
    if (!this.config.generateEmbeddings) {
      // Return empty vector if embeddings disabled
      return new Array(384).fill(0); // Default dimension for sentence transformers
    }

    try {
      // Use actual embedding service if available
      if (this.config.embeddingProvider) {
        return await this.config.embeddingProvider.embed(content);
      }
      
      // Fallback to mock embedding
      return this.generateMockEmbedding(content);
    } catch (error) {
      this.logger.warn('Error generating embedding, using mock:', error);
      return this.generateMockEmbedding(content);
    }
  }

  /**
   * Generate mock embedding for testing
   */
  private generateMockEmbedding(content: string): number[] {
    // Simple hash-based mock embedding
    const dimension = 384;
    const embedding = new Array(dimension);
    
    for (let i = 0; i < dimension; i++) {
      const hash = this.hashString(content + i);
      embedding[i] = (hash % 2000 - 1000) / 1000; // Normalize to [-1, 1]
    }
    
    return embedding;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Read file content
   */
  private async readFileContent(absolutePath: string): Promise<string> {
    const fs = await import('fs/promises');
    return await fs.readFile(absolutePath, 'utf-8');
  }

  /**
   * Extract title from file path
   */
  private async extractTitleFromPath(filePath: string): Promise<string> {
    const path = await import('path');
    return path.basename(filePath, path.extname(filePath));
  }

  /**
   * Extract category from file path
   */
  private async extractCategoryFromPath(filePath: string): Promise<string> {
    const path = await import('path');
    const dir = path.dirname(filePath);
    return dir === '.' ? 'root' : dir.split(path.sep)[0] || 'root';
  }

  /**
   * Get indexing statistics
   */
  async getIndexingStats(): Promise<{
    totalFiles: number;
    indexedFiles: number;
    totalChunks: number;
    lastIndexed?: Date;
  }> {
    try {
      const dbStats = await this.vectorDb.getStats();
      const vaultStats = await this.obsidianManager.getVaultStats();
      
      return {
        totalFiles: vaultStats.totalFiles,
        indexedFiles: vaultStats.markdownFiles, // Rough estimate
        totalChunks: dbStats.totalVectors,
        lastIndexed: dbStats.lastUpdated,
      };
    } catch (error) {
      this.logger.error('Error getting indexing stats:', error);
      throw error;
    }
  }

  /**
   * Update indexing configuration
   */
  updateConfig(newConfig: Partial<IndexingConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.info('Indexing configuration updated');
  }
}