import type { VectorDatabase } from '../database/interfaces/VectorDatabase';
import type { TransformersEmbedding } from '../embeddings/TransformersEmbedding';
import type { SearchResult } from '../types/Common';
import type { Logger } from '../utils/Logger';
import { calculateRelevanceScore } from '../utils/RelevanceCalculator';

export interface SearchFilters {
  tags?: string[] | undefined;
  fileTypes?: string[] | undefined;
  sections?: string[] | undefined;
  threshold?: number | undefined;
}

export interface FormattedSearchResult {
  id: string;
  content: string;
  metadata: {
    filePath: string;
    title: string;
    tags: string[];
    lastModified: string;
    chunkIndex?: number;
    totalChunks?: number;
    category?: string;
    source?: string;
  };
  score: number;
  distance: number;
  filePath: string;
  preview: string;
  relevanceScore: number;
}

export interface SearchOptions {
  limit?: number | undefined;
  threshold?: number | undefined;
  filters?: SearchFilters | undefined;
}

export type SearchType = 'semantic' | 'keyword' | 'hybrid';

export class SearchService {
  constructor(
    private db: VectorDatabase,
    private embedding: TransformersEmbedding,
    private logger: Logger
  ) {}

  /**
   * Perform a search with the specified type and options
   */
  async search(
    query: string,
    searchType: SearchType = 'hybrid',
    options: SearchOptions = {}
  ): Promise<FormattedSearchResult[]> {
    const { limit = 10, threshold = 0.7, filters } = options;

    this.logger.info(
      `Performing ${searchType} search for: "${query}" (limit: ${limit}, threshold: ${threshold})`
    );

    let results: SearchResult[] = [];

    try {
      if (searchType === 'semantic' || searchType === 'hybrid') {
        try {
          // Generate embedding for the query
          const queryEmbedding = await this.embedding.embed(query);

          // Build search filters
          const searchFilters: Record<string, unknown> = {};
          if (threshold) searchFilters.threshold = threshold;
          if (filters?.tags && filters.tags.length > 0) searchFilters.tags = filters.tags;
          if (filters?.fileTypes && filters.fileTypes.length > 0)
            searchFilters.fileTypes = filters.fileTypes;
          if (filters?.sections && filters.sections.length > 0)
            searchFilters.sections = filters.sections;

          // Perform vector search
          const vectorResults = await this.db.search(queryEmbedding, searchFilters, limit);
          results = vectorResults;

          this.logger.info(`Semantic search completed: ${results.length} results found`);
        } catch (embeddingError) {
          this.logger.error('Embedding generation failed:', embeddingError);
          if (searchType === 'semantic') {
            throw new Error(
              `Embedding generation failed: ${embeddingError instanceof Error ? embeddingError.message : 'Unknown error'}`
            );
          }
          // For hybrid search, continue to keyword search
        }
      }

      if (searchType === 'keyword' || (searchType === 'hybrid' && results.length === 0)) {
        try {
          // Fallback to keyword search using the database query method
          const keywordResults = await this.db.query(query, { limit });
          results = keywordResults.results;

          this.logger.info(`Keyword search completed: ${results.length} results found`);
        } catch (queryError) {
          this.logger.error('Keyword search failed:', queryError);
          throw new Error(
            `Keyword search failed: ${queryError instanceof Error ? queryError.message : 'Unknown error'}`
          );
        }
      }

      // Convert to formatted results
      return this.formatResults(results);
    } catch (searchError) {
      this.logger.error('Search operation failed:', searchError);
      throw searchError;
    }
  }

  /**
   * Browse all documents with optional limit
   */
  async browse(limit: number = 20): Promise<FormattedSearchResult[]> {
    this.logger.info(`Browsing documents (limit: ${limit})`);

    try {
      const results = await this.db.query('', {
        limit,
        includeMetadata: true,
      });

      return this.formatResults(results.results, 1.0); // No relevance scoring for browse
    } catch (error) {
      this.logger.error('Browse operation failed:', error);
      throw error;
    }
  }

  /**
   * Get a specific document by ID
   */
  async getDocumentById(id: string): Promise<SearchResult | null> {
    this.logger.info(`Getting document by ID: ${id}`);

    try {
      const result = await this.db.getById(id);
      if (!result) return null;

      // Convert VectorData to SearchResult format
      return {
        id: result.id,
        content: result.content,
        metadata: result.metadata,
        score: 1.0, // No scoring for direct ID lookup
        distance: 0.0,
      };
    } catch (error) {
      this.logger.error('Failed to get document by ID:', error);
      throw error;
    }
  }

  /**
   * Search for a document by file path
   */
  async getDocumentByPath(path: string): Promise<SearchResult | null> {
    this.logger.info(`Getting document by path: ${path}`);

    try {
      // Search for document by file path in metadata
      const searchResults = await this.db.search(
        // Use a dummy embedding since we're filtering by metadata
        new Array(this.embedding.getDimension()).fill(0),
        {
          // This would need to be implemented in the database interface
          // For now, we'll use a workaround
        },
        1
      );

      // Find document with matching path
      return searchResults.find(result => result.metadata.filePath === path) || null;
    } catch (error) {
      this.logger.error('Failed to get document by path:', error);
      throw error;
    }
  }

  /**
   * Create a preview of content
   */
  createPreview(content: string, maxLength: number = 150): string {
    const cleaned = content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.substring(0, maxLength) + '...';
  }

  /**
   * Format search results into a consistent format
   */
  private formatResults(
    results: SearchResult[],
    defaultRelevance?: number
  ): FormattedSearchResult[] {
    return results.map(result => {
      try {
        const formattedResult: FormattedSearchResult = {
          id: result.id,
          content: result.content || '',
          metadata: {
            lastModified:
              result.metadata?.lastModified instanceof Date
                ? result.metadata.lastModified.toISOString()
                : result.metadata?.lastModified || new Date().toISOString(),
            filePath: result.metadata?.filePath || 'Unknown',
            title: result.metadata?.title || 'Untitled',
            tags: result.metadata?.tags || [],
            ...(result.metadata?.chunkIndex !== undefined && {
              chunkIndex: result.metadata.chunkIndex,
            }),
            ...(result.metadata?.totalChunks !== undefined && {
              totalChunks: result.metadata.totalChunks,
            }),
            ...(result.metadata?.category !== undefined && { category: result.metadata.category }),
            ...(result.metadata?.source !== undefined && { source: result.metadata.source }),
          },
          score: result.score || 0,
          distance: result.distance || 1,
          filePath: result.metadata?.filePath || 'Unknown',
          preview: this.createPreview(result.content || ''),
          relevanceScore:
            defaultRelevance ?? calculateRelevanceScore(result.score || 0, result.distance || 1),
        };
        return formattedResult;
      } catch (formatError) {
        this.logger.warn('Error formatting search result:', formatError);
        const errorResult: FormattedSearchResult = {
          id: result.id || 'unknown',
          content: 'Error processing content',
          metadata: {
            filePath: 'Unknown',
            title: 'Error processing metadata',
            tags: [],
            lastModified: new Date().toISOString(),
          },
          score: 0,
          distance: 1,
          filePath: 'Unknown',
          preview: 'Error processing content',
          relevanceScore: 0,
        };
        return errorResult;
      }
    });
  }
}
