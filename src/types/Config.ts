/**
 * Configuration type definitions
 */

export interface DatabaseProviderConfig {
  provider: 'lancedb' | 'chroma' | 'weaviate';
  connection: {
    path: string;
    [key: string]: unknown;
  };
}

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
}

export interface ObsidianConfig {
  vaultPath: string;
  chunking: ChunkingConfig;
  indexing: IndexingConfig;
}

export interface ChunkingConfig {
  strategy?: 'smart' | 'fixed' | 'semantic';
  maxTokens: number;
  overlapTokens: number;
  splitByHeaders: boolean;
  splitByParagraphs: boolean;
  includeHeaders: boolean;
  preserveCodeBlocks: boolean;
  preserveTables: boolean;
  preserveCallouts?: boolean;
}

export interface IndexingConfig {
  batchSize: number;
  includePatterns: string[];
  excludePatterns: string[];
}

export interface MCPConfig {
  server: {
    name: string;
    version: string;
  };
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
}

// Main configuration type used by CLI
export interface AppConfig {
  database: DatabaseProviderConfig;
  embedding: EmbeddingConfig;
  obsidian: ObsidianConfig;
  mcp?: MCPConfig;
  logging?: LoggingConfig;
}

// Legacy alias for backward compatibility
export type DatabaseConfig = AppConfig;
