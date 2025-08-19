import { Command } from 'commander';
import { Logger } from '../../utils/Logger.js';
import { GitUtils } from '../../utils/GitUtils.js';
import { DatabaseFactory } from '../../database/factory.js';
import { TransformersEmbedding } from '../../embeddings/TransformersEmbedding.js';
import { ObsidianManager } from '../../obsidian/indexing/ObsidianManager.js';
import { FileIndexer } from '../../obsidian/indexing/FileIndexer.js';
import { IncrementalIndexer } from '../../obsidian/indexing/IncrementalIndexer.js';
import { VersionTracker } from '../../obsidian/indexing/VersionTracker.js';
import type { DatabaseConfig } from '../../types/Config.js';
import type { VectorDatabase } from '../../database/interfaces/VectorDatabase.js';
import { readFile } from 'fs/promises';

export interface IndexOptions {
  full?: boolean;
  incremental?: boolean;
  files?: string;
  dryRun?: boolean;
  batchSize?: number;
  config?: string;
  vaultPath?: string;
  dbPath?: string;
  concurrency?: number;
}

interface IndexProgress {
  phase: string;
  current: number;
  total: number;
  file?: string;
  message?: string;
}

export class IndexCommand {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('IndexCommand');
  }

  public register(program: Command): void {
    program
      .command('index')
      .description('Index Obsidian vault into vector database')
      .option('--full', 'Perform full reindexing')
      .option('--incremental', 'Perform incremental update')
      .option('--files <files>', 'Reindex specific files (comma-separated)')
      .option('--dry-run', 'Show what would be indexed without making changes')
      .option('--batch-size <size>', 'Number of files to process in each batch', '10')
      .option('--config <path>', 'Path to configuration file', 'config/default.json')
      .option('--vault-path <path>', 'Path to Obsidian vault (default: current directory)')
      .option('--db-path <path>', 'Path to vector database directory')
      .option('--concurrency <number>', 'Number of concurrent file processors', '3')
      .action((options: IndexOptions) => this.handleIndex(options));
  }

  private async handleIndex(options: IndexOptions): Promise<void> {
    try {
      this.logger.info('Starting indexing operation', { options });

      // Load configuration
      const config = await this.loadConfig(options.config || 'config/default.json');
      
      // Override config with CLI options
      if (options.vaultPath) {
        config.obsidian.vaultPath = options.vaultPath;
      }
      if (options.dbPath) {
        config.database.connection.path = options.dbPath;
      }

      const batchSize = parseInt(String(options.batchSize || '10'));
      const concurrency = parseInt(String(options.concurrency || '3'));

      // Validate vault path
      const vaultPath = config.obsidian?.vaultPath || process.cwd();
      
      // Check if we're in a git repository for change detection
      const hasGit = await GitUtils.isGitRepository(vaultPath);
      if (!hasGit && options.incremental) {
        this.logger.warn('Not in a git repository - incremental indexing may not work optimally');
      }

      // Initialize components
      const embedding = new TransformersEmbedding({
        modelName: config.embedding.model,
        dimension: config.embedding.dimensions
      });
      const database = DatabaseFactory.create(config.database.provider, config.database);
      const obsidianManager = new ObsidianManager(vaultPath, config.database.connection.path);
      const versionTracker = new VersionTracker(vaultPath, config.database.connection.path);

      // Initialize database and embedding
      await database.initialize();
      await embedding.initialize();
      
      // Progress tracking
      let progressCallback = (progress: IndexProgress) => {
        if (progress.file) {
          console.log(`[${progress.current}/${progress.total}] ${progress.phase}: ${progress.file}`);
        } else {
          console.log(`[${progress.current}/${progress.total}] ${progress.phase}: ${progress.message || ''}`);
        }
      };

      if (options.dryRun) {
        console.log('\n🧪 DRY RUN MODE - No changes will be made\n');
      }

      // Determine indexing strategy
      if (options.files) {
        await this.indexSpecificFiles(options.files, {
          obsidianManager,
          database,
          embedding,
          versionTracker,
          batchSize,
          concurrency,
          dryRun: options.dryRun || false,
          progressCallback
        });
      } else if (options.full) {
        await this.performFullIndexing({
          obsidianManager,
          database,
          embedding,
          versionTracker,
          batchSize,
          concurrency,
          dryRun: options.dryRun || false,
          progressCallback,
          config
        });
      } else if (options.incremental) {
        await this.performIncrementalIndexing({
          obsidianManager,
          database,
          embedding,
          versionTracker,
          batchSize,
          concurrency,
          dryRun: options.dryRun || false,
          progressCallback,
          config
        });
      } else {
        // Auto-detect: use incremental if version exists, otherwise full
        const hasExistingVersion = await versionTracker.hasVersionInfo();
        if (hasExistingVersion) {
          console.log('📈 Auto-detected: Performing incremental indexing');
          await this.performIncrementalIndexing({
            obsidianManager,
            database,
            embedding,
            versionTracker,
            batchSize,
            concurrency,
            dryRun: options.dryRun || false,
            progressCallback,
            config
          });
        } else {
          console.log('🆕 Auto-detected: Performing full indexing');
          await this.performFullIndexing({
            obsidianManager,
            database,
            embedding,
            versionTracker,
            batchSize,
            concurrency,
            dryRun: options.dryRun || false,
            progressCallback,
            config
          });
        }
      }

      this.logger.info('Indexing operation completed successfully');
      
    } catch (error) {
      this.logger.error('Indexing operation failed', { error });
      console.error('❌ Indexing failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async performFullIndexing(params: {
    obsidianManager: ObsidianManager;
    database: VectorDatabase;
    embedding: TransformersEmbedding;
    versionTracker: VersionTracker;
    batchSize: number;
    concurrency: number;
    dryRun: boolean;
    progressCallback: (progress: IndexProgress) => void;
    config: DatabaseConfig;
  }): Promise<void> {
    const { obsidianManager, database, embedding, versionTracker, batchSize, concurrency, dryRun, progressCallback, config } = params;
    
    console.log('🔄 Starting full indexing...');
    
    // Discover all markdown files using config patterns
    progressCallback({ phase: 'Discovery', current: 0, total: 1, message: 'Finding markdown files...' });
    
    // Use discovery options from config (same as StatusCommand)
    const discoveryOptions = {
      includePatterns: config.obsidian?.indexing?.includePatterns,
      excludePatterns: config.obsidian?.indexing?.excludePatterns,
    };

    const markdownFilesResult = await obsidianManager.discoverFiles({
      ...discoveryOptions,
      fileExtensions: ['.md'],
      includeHidden: false,
    });
    const files = markdownFilesResult.map(file => file.path);
    console.log(`📁 Found ${files.length} markdown files`);

    if (dryRun) {
      console.log('\n📋 Files that would be indexed:');
      files.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file}`);
      });
      console.log(`\n📊 Would process ${files.length} files in batches of ${batchSize} with ${concurrency} concurrent processors`);
      return;
    }

    // Clear existing index (if needed - for now skip this step)
    progressCallback({ phase: 'Cleanup', current: 0, total: 1, message: 'Preparing index...' });
    // TODO: Implement clear operation or recreate the database

    // Initialize indexer
    const fileIndexer = new FileIndexer(database, obsidianManager, {
      batchSize,
      maxConcurrency: concurrency,
      skipErrorFiles: true,
      preserveSpecialBlocks: true,
      generateEmbeddings: true,
      includeFileMetadata: true,
      customFields: [],
      embeddingProvider: embedding,
      discoveryOptions: {
        includePatterns: config.obsidian?.indexing?.includePatterns,
        excludePatterns: config.obsidian?.indexing?.excludePatterns,
      },
      chunkStrategy: {
        maxTokens: 512,
        overlapTokens: 50,
        splitByHeaders: true,
        splitByParagraphs: true,
        includeHeaders: true,
        preserveCodeBlocks: true,
        preserveTables: true,
        preserveCallouts: false
      }
    });

    // Batch processing
    const batches = this.createBatches(files, batchSize);
    let totalProcessed = 0;
    const errors: Array<{ file: string; error: string }> = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      progressCallback({ 
        phase: 'Indexing', 
        current: totalProcessed, 
        total: files.length, 
        message: `Batch ${batchIndex + 1}/${batches.length}` 
      });

      try {
        const result = await fileIndexer.indexFiles(batch || []);

        totalProcessed += batch?.length || 0;

        // Collect any errors
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach((error) => {
            errors.push({
              file: error.file || 'Unknown file',
              error: error.error || 'Unknown error'
            });
          });
        }

      } catch (error) {
        this.logger.error(`Batch ${batchIndex + 1} failed`, { error, batch });
        if (batch) {
          batch.forEach(file => {
            errors.push({
              file,
              error: error instanceof Error ? error.message : String(error)
            });
          });
        }
      }
    }

    // Update version tracking
    progressCallback({ phase: 'Finalizing', current: files.length, total: files.length, message: 'Updating version tracking...' });
    await versionTracker.updateVersionInfo();

    // Report results
    console.log(`\n✅ Full indexing completed!`);
    console.log(`📊 Processed: ${totalProcessed - errors.length}/${files.length} files`);
    
    if (errors.length > 0) {
      console.log(`\n⚠️  ${errors.length} files had errors:`);
      errors.forEach(({ file, error }) => {
        console.log(`  ❌ ${file}: ${error}`);
      });
    }
  }

  private async performIncrementalIndexing(params: {
    obsidianManager: ObsidianManager;
    database: VectorDatabase;
    embedding: TransformersEmbedding;
    versionTracker: VersionTracker;
    batchSize: number;
    concurrency: number;
    dryRun: boolean;
    progressCallback: (progress: IndexProgress) => void;
    config: DatabaseConfig;
  }): Promise<void> {
    const { obsidianManager, database, embedding, versionTracker, batchSize, concurrency, dryRun, progressCallback, config } = params;
    
    console.log('📈 Starting incremental indexing...');
    
    // Initialize incremental indexer
    const fileIndexer = new FileIndexer(database, obsidianManager, {
      batchSize,
      maxConcurrency: concurrency,
      skipErrorFiles: true,
      preserveSpecialBlocks: true,
      generateEmbeddings: true,
      includeFileMetadata: true,
      customFields: [],
      embeddingProvider: embedding,
      discoveryOptions: {
        includePatterns: config.obsidian?.indexing?.includePatterns,
        excludePatterns: config.obsidian?.indexing?.excludePatterns,
      },
      chunkStrategy: {
        maxTokens: 512,
        overlapTokens: 50,
        splitByHeaders: true,
        splitByParagraphs: true,
        includeHeaders: true,
        preserveCodeBlocks: true,
        preserveTables: true,
        preserveCallouts: false
      }
    });
    
    const incrementalIndexer = new IncrementalIndexer(
      fileIndexer,
      obsidianManager,
      versionTracker,
      database
    );

    progressCallback({ phase: 'Analysis', current: 0, total: 1, message: 'Analyzing changes...' });
    
    // Detect changes
    const changes = await incrementalIndexer.detectChanges();
    const totalChanges = changes.added.length + changes.modified.length + changes.deleted.length;
    
    console.log(`\n📊 Change Summary:`);
    console.log(`  ➕ Added: ${changes.added.length} files`);
    console.log(`  ✏️  Modified: ${changes.modified.length} files`);
    console.log(`  🗑️  Deleted: ${changes.deleted.length} files`);
    console.log(`  📈 Total changes: ${totalChanges}`);

    if (totalChanges === 0) {
      console.log('✨ No changes detected - index is up to date!');
      return;
    }

    if (dryRun) {
      console.log('\n📋 Files that would be updated:');
      if (changes.added.length > 0) {
        console.log('\n  ➕ Added:');
        changes.added.forEach(file => console.log(`    + ${file}`));
      }
      if (changes.modified.length > 0) {
        console.log('\n  ✏️  Modified:');
        changes.modified.forEach(file => console.log(`    ~ ${file}`));
      }
      if (changes.deleted.length > 0) {
        console.log('\n  🗑️  Deleted:');
        changes.deleted.forEach(file => console.log(`    - ${file}`));
      }
      return;
    }

    // Process changes using the built-in incremental indexer
    progressCallback({ phase: 'Processing', current: 0, total: totalChanges, message: 'Processing changes...' });
    
    const result = await incrementalIndexer.performIncrementalIndex();

    // Report results
    console.log(`\n✅ Incremental indexing completed!`);
    console.log(`📊 Results:`);
    console.log(`  ➕ Added: ${result.changesSummary.added} files`);
    console.log(`  ✏️  Modified: ${result.changesSummary.modified} files`);
    console.log(`  🗑️  Deleted: ${result.changesSummary.deleted} files`);
    console.log(`  🔄 Renamed: ${result.changesSummary.renamed} files`);

    if (result.errors && result.errors.length > 0) {
      console.log(`\n⚠️  ${result.errors.length} errors occurred:`);
      result.errors.forEach(error => {
        console.log(`  ❌ ${error.file || 'Unknown file'}: ${error.error || 'Unknown error'}`);
      });
    }
  }

  private async indexSpecificFiles(filePattern: string, params: {
    obsidianManager: ObsidianManager;
    database: VectorDatabase;
    embedding: TransformersEmbedding;
    versionTracker: VersionTracker;
    batchSize: number;
    concurrency: number;
    dryRun: boolean;
    progressCallback: (progress: IndexProgress) => void;
  }): Promise<void> {
    const { obsidianManager, database, embedding, batchSize, concurrency, dryRun, progressCallback } = params;
    
    console.log(`🎯 Indexing specific files: ${filePattern}`);
    
    // Parse file patterns
    const patterns = filePattern.split(',').map(p => p.trim());
    const allFiles = await obsidianManager.findMarkdownFiles();
    
    // Filter files based on patterns
    const targetFiles = allFiles.filter(file => 
      patterns.some(pattern => file.includes(pattern))
    );

    console.log(`📁 Found ${targetFiles.length} matching files`);

    if (targetFiles.length === 0) {
      console.log('❌ No files matched the specified patterns');
      return;
    }

    if (dryRun) {
      console.log('\n📋 Files that would be indexed:');
      targetFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file}`);
      });
      return;
    }

    // Initialize indexer
    const fileIndexer = new FileIndexer(database, obsidianManager, {
      batchSize,
      maxConcurrency: concurrency,
      skipErrorFiles: true,
      embeddingProvider: embedding,
      generateEmbeddings: true,
      chunkStrategy: {
        maxTokens: 512,
        overlapTokens: 50,
        splitByHeaders: true,
        splitByParagraphs: true,
        includeHeaders: true,
        preserveCodeBlocks: true,
        preserveTables: true,
        preserveCallouts: false
      }
    });

    // Index the files
    progressCallback({ phase: 'Indexing', current: 0, total: targetFiles.length, message: 'Processing files...' });
    
    const result = await fileIndexer.indexFiles(targetFiles);

    // Report results
    const successful = result.processedFiles;
    const errors = result.errors || [];

    console.log(`\n✅ Specific file indexing completed!`);
    console.log(`📊 Processed: ${successful}/${targetFiles.length} files`);
    
    if (errors.length > 0) {
      console.log(`\n⚠️  ${errors.length} files had errors:`);
      errors.forEach((error) => {
        console.log(`  ❌ ${error.file || 'Unknown file'}: ${error.error || 'Unknown error'}`);
      });
    }
  }

  private async loadConfig(configPath: string): Promise<DatabaseConfig> {
    try {
      const configContent = await readFile(configPath, 'utf-8');
      return JSON.parse(configContent);
    } catch {
      // Use default config if file doesn't exist
      this.logger.warn(`Config file not found at ${configPath}, using defaults`);
      
      return {
        database: {
          provider: 'lancedb' as const,
          connection: {
            path: './vector-db'
          }
        },
        embedding: {
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384
        },
        obsidian: {
          vaultPath: process.cwd(),
          chunking: {
            maxTokens: 512,
            overlapTokens: 50,
            splitByHeaders: true,
            splitByParagraphs: true,
            includeHeaders: true,
            preserveCodeBlocks: true,
            preserveTables: true,
            preserveCallouts: false
          },
          indexing: {
            batchSize: 10,
            includePatterns: ['*.md'],
            excludePatterns: ['.git/**', 'node_modules/**', '.obsidian/**']
          }
        }
      };
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}