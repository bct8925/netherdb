/**
 * Abstract interface for embedding providers
 */

export interface EmbeddingProvider {
  /**
   * Initialize the embedding model
   */
  initialize(): Promise<void>;

  /**
   * Generate embeddings for a single text
   * @param text Input text to embed
   * @returns Vector embedding
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts
   * @param texts Array of input texts to embed
   * @returns Array of vector embeddings
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Get the dimension of the embeddings
   * @returns Embedding dimension
   */
  getDimension(): number;

  /**
   * Get the model name/identifier
   * @returns Model identifier
   */
  getModelName(): string;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}
