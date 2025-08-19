/**
 * Main entry point for the Obsidian Vector Database system
 */

export * from './database';
export * from './mcp';
export * from './embeddings';
export * from './utils';
export * from './types';

// Export obsidian module components individually to avoid naming conflicts
export { ObsidianManager, VersionTracker } from './obsidian/indexing';
export { MarkdownParser, FrontmatterParser, WikiLinkParser } from './obsidian/parser';
export { HeaderBasedChunker, TokenCounter, ContentPreserver } from './obsidian/chunking';

// Re-export with specific names to avoid conflicts
export { FileIndexer } from './obsidian/indexing/FileIndexer';
export { IncrementalIndexer } from './obsidian/indexing/IncrementalIndexer';
export type { IndexingConfig as FileIndexingConfig } from './obsidian/indexing/FileIndexer';
export type { IncrementalConfig as IncrementalIndexingConfig } from './obsidian/indexing/IncrementalIndexer';