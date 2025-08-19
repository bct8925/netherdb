/**
 * LanceDB-specific configuration types
 */

export interface LanceDBConnectionConfig {
  path: string;
  storageOptions?: {
    blockSize?: number;
    maxRowsPerFile?: number;
    maxRowsPerGroup?: number;
    maxBytesPerFile?: number;
  };
}

export interface LanceDBTableConfig {
  name: string;
  vectorColumn: string;
  idColumn: string;
  contentColumn: string;
  metadataColumn: string;
  mode?: 'create' | 'overwrite' | 'append';
}

export interface LanceDBIndexConfig {
  vectorColumn: string;
  indexType: 'IVF_PQ' | 'HNSW' | 'BTREE';
  metricType: 'cosine' | 'euclidean' | 'dot';
  numPartitions?: number;
  numSubVectors?: number;
  maxIterations?: number;
}

export const DEFAULT_LANCEDB_CONFIG: LanceDBTableConfig = {
  name: 'vectors',
  vectorColumn: 'vector',
  idColumn: 'id',
  contentColumn: 'content',
  metadataColumn: 'metadata',
  mode: 'create',
};

export const DEFAULT_INDEX_CONFIG: LanceDBIndexConfig = {
  vectorColumn: 'vector',
  indexType: 'IVF_PQ',
  metricType: 'cosine',
  numPartitions: 256,
  numSubVectors: 16,
};