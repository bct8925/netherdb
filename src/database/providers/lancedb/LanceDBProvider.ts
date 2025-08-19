/**
 * LanceDB implementation of the VectorDatabase interface
 */

import { connect, Connection, Table } from '@lancedb/lancedb';
import { existsSync } from 'fs';
import { VectorDatabase, IndexConfig } from '../../interfaces/VectorDatabase';
import {
  VectorData,
  Metadata,
  SearchResult,
  SearchFilters,
  DatabaseStats,
  IndexInfo,
} from '../../../types/Common';
import { LanceDBSearchResult } from '../../../types/LanceTypes';
import { distanceToScore } from '../../../utils/RelevanceCalculator';
import {
  LanceDBConnectionConfig,
  LanceDBTableConfig,
  LanceDBIndexConfig,
  DEFAULT_LANCEDB_CONFIG,
} from './LanceDBConfig';

export class LanceDBProvider implements VectorDatabase {
  private connection: Connection | null = null;
  private table: Table | null = null;
  private readonly connectionConfig: LanceDBConnectionConfig;
  private readonly tableConfig: LanceDBTableConfig;

  constructor(
    connectionConfig: LanceDBConnectionConfig,
    tableConfig: LanceDBTableConfig = DEFAULT_LANCEDB_CONFIG
  ) {
    this.connectionConfig = connectionConfig;
    this.tableConfig = tableConfig;
  }

  async initialize(): Promise<void> {
    try {
      // Connect to LanceDB
      this.connection = await connect(this.connectionConfig.path);

      // Check if table exists, create if it doesn't
      const tableNames = await this.connection.tableNames();
      
      if (!tableNames.includes(this.tableConfig.name)) {
        // Create table with actual sample data for proper schema inference
        // This avoids the schema mismatch issues with empty/temp data
        const sampleData = [
          {
            [this.tableConfig.idColumn]: 'sample_id',
            [this.tableConfig.vectorColumn]: new Array(384).fill(0),
            [this.tableConfig.contentColumn]: 'Sample content for schema inference',
            [this.tableConfig.metadataColumn]: {
              filePath: '/sample/path.md',
              title: 'Sample Title',
              tags: ['sample'],
              category: 'sample',
              source: 'obsidian',
              chunkIndex: 0,
              totalChunks: 1,
              lastModified: new Date().toISOString(),
              section: 'Sample Section',
              headers: ['Sample Header'],
              chunkType: 'paragraph',
              tokens: 10,
              hasCodeBlocks: false,
              hasTables: false,
              hasCallouts: false,
              hasWikiLinks: false,
            },
          },
        ];

        this.table = await this.connection.createTable(this.tableConfig.name, sampleData, {
          mode: this.tableConfig.mode as 'create' | 'overwrite',
        });

        // Remove the sample record
        await this.table.delete(`${this.tableConfig.idColumn} = 'sample_id'`);
      } else {
        this.table = await this.connection.openTable(this.tableConfig.name);
      }
    } catch (error) {
      throw new Error(`Failed to initialize LanceDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async close(): Promise<void> {
    // LanceDB connections are automatically managed
    this.connection = null;
    this.table = null;
  }

  async insert(vectors: VectorData[]): Promise<string[]> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const records = vectors.map(vectorData => ({
        [this.tableConfig.idColumn]: vectorData.id,
        [this.tableConfig.vectorColumn]: vectorData.vector,
        [this.tableConfig.contentColumn]: vectorData.content,
        [this.tableConfig.metadataColumn]: {
          ...vectorData.metadata,
          lastModified: vectorData.metadata.lastModified instanceof Date 
            ? vectorData.metadata.lastModified.toISOString()
            : vectorData.metadata.lastModified,
        },
      }));

      await this.table.add(records);
      return vectors.map(v => v.id);
    } catch (error) {
      throw new Error(`Failed to insert vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async search(query: number[], filters?: SearchFilters, limit = 10): Promise<SearchResult[]> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      let queryBuilder = this.table
        .search(query)
        .limit(limit);

      const results = await queryBuilder.toArray();

      let searchResults = results.map((result: LanceDBSearchResult) => {
        const distance = result._distance || 0;
        const rawScore = result._score;
        
        // Convert distance to score if no score is provided (common with vector search)
        const score = rawScore !== undefined ? rawScore : distanceToScore(distance);
        
        return {
          id: String(result[this.tableConfig.idColumn] || result.id),
          content: String(result[this.tableConfig.contentColumn] || result.content),
          metadata: this.parseMetadataDates(result[this.tableConfig.metadataColumn] || result.metadata),
          score,
          distance,
        };
      });

      // Apply client-side filtering for JSON metadata
      if (filters) {
        if (filters.tags && filters.tags.length > 0) {
          searchResults = searchResults.filter(result => 
            filters.tags!.some(tag => result.metadata.tags.includes(tag))
          );
        }

        if (filters.dateRange) {
          const { from, to } = filters.dateRange;
          searchResults = searchResults.filter(result => {
            const lastModified = new Date(result.metadata.lastModified);
            return lastModified >= from && lastModified <= to;
          });
        }
      }

      return searchResults;
    } catch (error) {
      throw new Error(`Failed to search vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async update(id: string, vector?: number[], metadata?: Partial<Metadata>): Promise<void> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      // Get existing record first
      const existing = await this.getById(id);
      if (!existing) {
        throw new Error(`Record with id '${id}' not found`);
      }

      // Create updated record maintaining exact schema structure
      const updatedRecord = {
        [this.tableConfig.idColumn]: id,
        [this.tableConfig.vectorColumn]: vector || existing.vector,
        [this.tableConfig.contentColumn]: existing.content,
        [this.tableConfig.metadataColumn]: metadata ? {
          ...existing.metadata,
          ...metadata,
          // Ensure lastModified is always an ISO string
          lastModified: metadata.lastModified instanceof Date 
            ? metadata.lastModified.toISOString()
            : (metadata.lastModified || existing.metadata.lastModified)
        } : existing.metadata,
      };

      // Use delete + insert approach for updates to avoid mergeInsert issues
      await this.table.delete(`${this.tableConfig.idColumn} = '${id}'`);
      await this.table.add([updatedRecord]);
      
    } catch (error) {
      console.error('LanceDB update error:', error);
      throw new Error(`Failed to update vector: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async delete(id: string): Promise<void> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      await this.table.delete(`${this.tableConfig.idColumn} = '${id}'`);
    } catch (error) {
      throw new Error(`Failed to delete vector: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getStats(): Promise<DatabaseStats> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const count = await this.table.countRows();

      return {
        totalVectors: count,
        totalSize: `${count} vectors`, // LanceDB doesn't provide size info directly
        lastUpdated: new Date(), // Use current time as approximation
        indexHealth: 'healthy',
      };
    } catch {
      return {
        totalVectors: 0,
        totalSize: '0 vectors',
        lastUpdated: new Date(),
        indexHealth: 'error',
      };
    }
  }

  async createIndex(config: IndexConfig): Promise<void> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const lanceConfig: LanceDBIndexConfig = {
        vectorColumn: config.vectorColumn,
        indexType: config.indexType === 'HNSW' ? 'HNSW' : 'IVF_PQ',
        metricType: config.metricType,
        ...config.parameters,
      };

      await this.table.createIndex(lanceConfig.vectorColumn);
    } catch (error) {
      throw new Error(`Failed to create index: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listIndices(): Promise<IndexInfo[]> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    // LanceDB doesn't provide a direct way to list indices
    // Return basic information about the vector column index
    return [
      {
        name: `${this.tableConfig.vectorColumn}_index`,
        type: 'vector',
        vectorCount: await this.count(),
        createdAt: new Date(), // Approximation
      },
    ];
  }

  async upsert(vectors: VectorData[]): Promise<string[]> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const records = vectors.map(vectorData => ({
        [this.tableConfig.idColumn]: vectorData.id,
        [this.tableConfig.vectorColumn]: vectorData.vector,
        [this.tableConfig.contentColumn]: vectorData.content,
        [this.tableConfig.metadataColumn]: {
          ...vectorData.metadata,
          lastModified: vectorData.metadata.lastModified instanceof Date 
            ? vectorData.metadata.lastModified.toISOString()
            : vectorData.metadata.lastModified,
        },
      }));

      // Use mergeInsert for true upsert behavior
      await this.table
        .mergeInsert(this.tableConfig.idColumn)
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute(records);
        
      return vectors.map(v => v.id);
    } catch (error) {
      throw new Error(`Failed to upsert vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async batchInsert(items: VectorData[]): Promise<string[]> {
    // LanceDB handles batching internally, so we can use the regular insert
    return this.insert(items);
  }

  async batchDelete(ids: string[]): Promise<void> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const whereClause = ids.map(id => `'${id}'`).join(', ');
      await this.table.delete(`${this.tableConfig.idColumn} IN (${whereClause})`);
    } catch (error) {
      throw new Error(`Failed to batch delete vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async exists(id: string): Promise<boolean> {
    const record = await this.getById(id);
    return record !== null;
  }

  async getById(id: string): Promise<VectorData | null> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      // Use search with a dummy vector and where clause for ID-based lookup
      const results = await this.table
        .search(new Array(384).fill(0)) // Dummy vector for the search
        .where(`${this.tableConfig.idColumn} = '${id}'`)
        .limit(1)
        .toArray();

      if (results.length === 0) {
        return null;
      }

      const result = results[0];
      return {
        id: result[this.tableConfig.idColumn],
        vector: Array.from(result[this.tableConfig.vectorColumn] || []), // Convert Arrow Vector to plain array
        content: result[this.tableConfig.contentColumn],
        metadata: this.parseMetadataDates(result[this.tableConfig.metadataColumn]),
      };
    } catch (error) {
      throw new Error(`Failed to get vector by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async count(): Promise<number> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      return await this.table.countRows();
    } catch (error) {
      throw new Error(`Failed to count vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert ISO date strings back to Date objects and Arrow Vectors to plain arrays in metadata
   * @param metadata Metadata object with potential ISO date strings and Arrow Vectors
   * @returns Metadata with Date objects and plain arrays
   */
  private parseMetadataDates(metadata: unknown): Metadata {
    if (metadata && typeof metadata === 'object') {
      const parsed = { ...metadata } as Record<string, unknown>;
      
      // Convert ISO date strings to Date objects
      if (typeof parsed.lastModified === 'string') {
        parsed.lastModified = new Date(parsed.lastModified);
      }
      
      // Convert Arrow Vector objects to plain arrays
      if (parsed.tags && typeof parsed.tags === 'object' && parsed.tags !== null && 'length' in parsed.tags) {
        parsed.tags = Array.from(parsed.tags as ArrayLike<unknown>);
      }
      
      return parsed as Metadata;
    }
    return metadata as Metadata;
  }

  /**
   * Query records with text and optional filters
   */
  async query(queryText: string, options?: { limit?: number; includeMetadata?: boolean }): Promise<{ results: SearchResult[] }> {
    if (!this.table) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const limit = options?.limit || 10;
      
      // For empty query text, just get all records
      let results;
      if (!queryText || queryText.trim() === '') {
        // Get all records by using a zero vector search with high limit
        const mockVector = new Array(384).fill(0);
        results = await this.table.search(mockVector).limit(limit).toArray();
      } else {
        // Use a mock vector for text query (in real implementation, would embed the text)
        const mockVector = new Array(384).fill(0);
        results = await this.table.search(mockVector).limit(limit).toArray();
      }

      return {
        results: results.map((result: LanceDBSearchResult) => {
          const distance = result._distance || 0;
          const rawScore = result._score;
          
          // Convert distance to score if no score is provided
          const score = rawScore !== undefined ? rawScore : distanceToScore(distance);
          
          return {
            id: String(result.id),
            content: String(result.content),
            metadata: this.parseMetadataDates(result.metadata),
            score,
            distance,
          };
        }),
      };
    } catch (error) {
      throw new Error(`Failed to query records: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async databaseExists(): Promise<boolean> {
    // First check if the database directory exists at all
    // This prevents LanceDB from creating the directory
    if (!existsSync(this.connectionConfig.path)) {
      return false;
    }

    try {
      // Only connect if directory exists
      const connection = await connect(this.connectionConfig.path);
      
      // Check if table exists
      const tableNames = await connection.tableNames();
      return tableNames.includes(this.tableConfig.name);
    } catch {
      // If we can't connect or check, assume it doesn't exist
      return false;
    }
  }

}