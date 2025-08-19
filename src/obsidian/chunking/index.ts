// Export chunking functionality
export { ChunkingStrategy, DEFAULT_CHUNK_STRATEGY } from './ChunkingStrategy';
export { HeaderBasedChunker } from './HeaderBasedChunker';
export { TokenCounter, defaultTokenCounter } from './TokenCounter';
export { ContentPreserver } from './ContentPreserver';

export type {
  TokenCountingStrategy,
  TokenCountingConfig,
} from './TokenCounter';

export type {
  PreservedBlock,
  PreservationResult,
} from './ContentPreserver';