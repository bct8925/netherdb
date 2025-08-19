/**
 * Abstract interface for vector database operations
 * This interface allows easy switching between different vector database providers
 */

import { VectorData, Metadata, SearchResult, SearchFilters, DatabaseStats, IndexInfo } from '../../types/Common';

export interface IndexConfig {
  name: string;
  vectorColumn: string;
  metricType: 'cosine' | 'euclidean' | 'dot';
  indexType?: string;
  parameters?: Record<string, unknown>;
}

export interface VectorDatabase {
  /**
   * Initialize the database connection
   */
  initialize(): Promise<void>;

  /**
   * Close the database connection
   */
  close(): Promise<void>;

  /**
   * Insert vectors with metadata into the database
   * @param vectors Array of vector data to insert
   * @returns Array of inserted record IDs
   */
  insert(vectors: VectorData[]): Promise<string[]>;

  /**
   * Insert or update vectors (upsert operation)
   * @param vectors Array of vector data to upsert
   * @returns Array of upserted record IDs
   */
  upsert(vectors: VectorData[]): Promise<string[]>;

  /**
   * Search for similar vectors
   * @param query Query vector for similarity search
   * @param filters Optional filters to apply
   * @param limit Maximum number of results to return
   * @returns Array of search results with similarity scores
   */
  search(query: number[], filters?: SearchFilters, limit?: number): Promise<SearchResult[]>;

  /**
   * Update an existing vector record
   * @param id Record ID to update
   * @param vector New vector data (optional)
   * @param metadata New metadata (optional)
   */
  update(id: string, vector?: number[], metadata?: Partial<Metadata>): Promise<void>;

  /**
   * Delete a vector record
   * @param id Record ID to delete
   */
  delete(id: string | string[]): Promise<void>;

  /**
   * Get database statistics and health information
   * @returns Database statistics
   */
  getStats(): Promise<DatabaseStats>;

  /**
   * Create a new index on the vector table
   * @param config Index configuration
   */
  createIndex(config: IndexConfig): Promise<void>;

  /**
   * List all available indices
   * @returns Array of index information
   */
  listIndices(): Promise<IndexInfo[]>;

  /**
   * Batch insert operation for better performance
   * @param items Array of vector data to insert
   * @returns Array of inserted record IDs
   */
  batchInsert(items: VectorData[]): Promise<string[]>;

  /**
   * Batch delete operation
   * @param ids Array of record IDs to delete
   */
  batchDelete(ids: string[]): Promise<void>;

  /**
   * Check if a record exists
   * @param id Record ID to check
   * @returns True if record exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Get a specific record by ID
   * @param id Record ID to retrieve
   * @returns Vector data or null if not found
   */
  getById(id: string): Promise<VectorData | null>;

  /**
   * Query records with text and optional filters
   * @param queryText Text query (can be empty for metadata-only queries)
   * @param options Query options
   * @returns Query results
   */
  query(queryText: string, options?: { limit?: number; includeMetadata?: boolean }): Promise<{ results: SearchResult[] }>;

  /**
   * Count total number of vectors in the database
   * @returns Total count of vectors
   */
  count(): Promise<number>;

  /**
   * Check if the database/table exists without creating it
   * @returns True if database exists
   */
  databaseExists(): Promise<boolean>;
}