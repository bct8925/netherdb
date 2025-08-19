/**
 * Common type definitions used across the application
 */

export interface VectorData {
  id: string;
  vector: number[];
  metadata: Metadata;
  content: string;
}

export interface Metadata {
  filePath: string;
  title: string;
  tags: string[];
  category?: string;
  source?: string;
  chunkIndex: number;
  totalChunks: number;
  lastModified: Date;
  [key: string]: unknown;
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: Metadata;
  score: number;
  distance: number;
}

export interface SearchFilters {
  tags?: string[];
  fileTypes?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  sections?: string[];
  minScore?: number;
  threshold?: number;
}

export interface DatabaseStats {
  totalVectors: number;
  totalSize: string;
  lastUpdated: Date;
  indexHealth: 'healthy' | 'degraded' | 'error';
}

export interface IndexInfo {
  name: string;
  type: string;
  vectorCount: number;
  createdAt: Date;
}

export interface QueryOptions {
  limit?: number;
  threshold?: number;
  includeMetadata?: boolean;
}

/**
 * Configuration for chunk processing strategies
 */
export interface ChunkStrategy {
  // Logical boundary splitting
  splitByHeaders: boolean; // Split at H1, H2, H3 boundaries
  splitByParagraphs: boolean; // Split at paragraph boundaries

  // Size constraints
  maxTokens: number; // Target maximum chunk size in tokens
  overlapTokens: number; // Overlap tokens between chunks

  // Context preservation
  includeHeaders: boolean; // Include section headers in chunks
  preserveCodeBlocks: boolean; // Keep code blocks intact
  preserveTables: boolean; // Keep tables intact
  preserveCallouts: boolean; // Keep Obsidian callouts intact
}

/**
 * Represents a chunk of content from a document
 */
export interface DocumentChunk {
  id: string; // Unique chunk identifier
  content: string; // The actual chunk content
  tokens: number; // Token count for this chunk

  // Source information
  sourceFile: string; // Original file path
  chunkIndex: number; // Index within the document

  // Position tracking
  startPosition: number; // Character position in original document
  endPosition: number; // End character position

  // Context preservation
  headers: string[]; // Hierarchical headers leading to this chunk
  section: string | undefined; // Section name if applicable

  // Relationships
  previousChunkId?: string; // Previous chunk in sequence
  nextChunkId?: string; // Next chunk in sequence

  // Metadata
  metadata: ChunkMetadata;
}

/**
 * Metadata associated with a document chunk
 */
export interface ChunkMetadata {
  // Inherited from document
  title?: string;
  author?: string;
  tags: string[];
  date?: Date;

  // Chunk-specific
  type: ChunkType;
  headingLevel?: number; // If chunk starts with heading
  hasCodeBlocks: boolean;
  hasTables: boolean;
  hasCallouts: boolean;
  hasWikiLinks: boolean;

  // Custom fields
  custom: Record<string, unknown>;
}

/**
 * Types of content chunks
 */
export type ChunkType =
  | 'paragraph' // Regular paragraph content
  | 'heading' // Heading-based section
  | 'code' // Code block
  | 'table' // Table content
  | 'callout' // Obsidian callout
  | 'list' // List content
  | 'quote' // Blockquote
  | 'mixed'; // Mixed content types

/**
 * Result of chunking a document
 */
export interface ChunkingResult {
  chunks: DocumentChunk[];
  totalTokens: number;
  chunkingStrategy: ChunkStrategy;
  processingTime: number;
  warnings: string[];
}
