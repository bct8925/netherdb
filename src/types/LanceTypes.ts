/**
 * LanceDB-specific type definitions
 */

/**
 * Raw result from LanceDB search operations
 */
export interface LanceDBSearchResult {
  [key: string]: unknown;
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  _score?: number;
  _distance?: number;
}

/**
 * LanceDB record structure
 */
export interface LanceDBRecord {
  id: string;
  vector: number[];
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * LanceDB table configuration keys
 */
export interface LanceDBTableColumns {
  idColumn: string;
  vectorColumn: string;
  contentColumn: string;
  metadataColumn: string;
}
