/**
 * Transformers.js embedding implementation using local models
 */

import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';
import { EmbeddingProvider } from './EmbeddingProvider';

export interface TransformersConfig {
  modelName: string;
  dimension: number;
  pooling?: 'mean' | 'cls';
  normalize?: boolean;
}

export class TransformersEmbedding implements EmbeddingProvider {
  private pipeline: FeatureExtractionPipeline | null = null;
  private readonly config: TransformersConfig;
  private isInitialized = false;

  constructor(config: TransformersConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize the feature extraction pipeline
      this.pipeline = (await pipeline(
        'feature-extraction',
        this.config.modelName
      )) as FeatureExtractionPipeline;

      this.isInitialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize embedding model ${this.config.modelName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.isInitialized || !this.pipeline) {
      throw new Error('Embedding provider not initialized. Call initialize() first.');
    }

    try {
      // Clean and prepare text
      const cleanText = this.preprocessText(text);

      if (cleanText.trim().length === 0) {
        // Return zero vector for empty text
        return new Array(this.config.dimension).fill(0);
      }

      // Generate embedding
      const output = await this.pipeline(cleanText);

      // Extract the embedding array from the output
      // The output structure depends on the model, but typically it's a tensor
      let embedding: number[];

      if (Array.isArray(output) && output.length > 0) {
        // Handle array output
        embedding = Array.from(output[0]) as number[];
      } else if (output && typeof output === 'object' && 'data' in output && 'dims' in output) {
        // Handle tensor output with proper pooling
        const tensor = output as { data: number[]; dims: number[] };

        if (!tensor.dims || tensor.dims.length < 3) {
          throw new Error('Invalid tensor dimensions: expected [batch, sequence, hidden]');
        }

        const [batchSize, seqLength, hiddenDim] = tensor.dims as [number, number, number];

        if (hiddenDim !== this.config.dimension) {
          throw new Error(
            `Model hidden dimension mismatch: expected ${this.config.dimension}, got ${hiddenDim}`
          );
        }

        // Apply pooling based on configuration
        embedding = this.applyPooling(tensor.data, batchSize, seqLength, hiddenDim);
      } else {
        throw new Error('Unexpected embedding output format');
      }

      // Ensure the embedding has the expected dimension
      if (embedding.length !== this.config.dimension) {
        throw new Error(
          `Embedding dimension mismatch: expected ${this.config.dimension}, got ${embedding.length}`
        );
      }

      return embedding;
    } catch (error) {
      throw new Error(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.isInitialized || !this.pipeline) {
      throw new Error('Embedding provider not initialized. Call initialize() first.');
    }

    try {
      // Process texts in smaller batches to avoid memory issues
      const batchSize = 32;
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const cleanTexts = batch.map(text => this.preprocessText(text));

        // Generate embeddings for the batch
        const batchResults = await Promise.all(
          cleanTexts.map(async text => {
            if (text.trim().length === 0) {
              return new Array(this.config.dimension).fill(0);
            }
            return this.embed(text);
          })
        );

        results.push(...batchResults);
      }

      return results;
    } catch (error) {
      throw new Error(
        `Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getDimension(): number {
    return this.config.dimension;
  }

  getModelName(): string {
    return this.config.modelName;
  }

  async dispose(): Promise<void> {
    if (this.pipeline) {
      // Transformers.js doesn't require explicit disposal
      // But we can clean up references
      this.pipeline = null;
    }
    this.isInitialized = false;
  }

  /**
   * Apply pooling to tensor data to get a single embedding vector
   * @param data Tensor data array
   * @param batchSize Batch size dimension
   * @param seqLength Sequence length dimension
   * @param hiddenDim Hidden dimension
   * @returns Pooled embedding vector
   */
  private applyPooling(
    data: number[],
    batchSize: number,
    seqLength: number,
    hiddenDim: number
  ): number[] {
    // For now, we only handle batch size of 1
    if (batchSize !== 1) {
      throw new Error(`Batch size ${batchSize} not supported for pooling`);
    }

    const embedding = new Array(hiddenDim).fill(0);

    const poolingStrategy = this.config.pooling || 'mean';

    if (poolingStrategy === 'mean') {
      // Mean pooling: average across sequence length
      for (let seq = 0; seq < seqLength; seq++) {
        for (let dim = 0; dim < hiddenDim; dim++) {
          const index = seq * hiddenDim + dim;
          const value = data[index];
          if (value !== undefined) {
            embedding[dim] += value / seqLength;
          }
        }
      }
    } else if (poolingStrategy === 'cls') {
      // CLS pooling: use the first token's embedding
      for (let dim = 0; dim < hiddenDim; dim++) {
        const value = data[dim];
        if (value !== undefined) {
          embedding[dim] = value;
        }
      }
    } else {
      throw new Error(`Unsupported pooling strategy: ${poolingStrategy}`);
    }

    // Apply normalization if configured
    if (this.config.normalize) {
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      if (norm > 0) {
        for (let i = 0; i < embedding.length; i++) {
          embedding[i] /= norm;
        }
      }
    }

    return embedding;
  }

  /**
   * Preprocess text before embedding generation
   * @param text Input text
   * @returns Cleaned text
   */
  private preprocessText(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\p{C}/gu, '') // Remove control characters
      .substring(0, 512); // Limit length to avoid token limits
  }
}

/**
 * Default embedding configurations for common models
 */
export const EMBEDDING_CONFIGS = {
  'all-MiniLM-L6-v2': {
    modelName: 'Xenova/all-MiniLM-L6-v2',
    dimension: 384,
    pooling: 'mean' as const,
    normalize: true,
  },
  'all-mpnet-base-v2': {
    modelName: 'Xenova/all-mpnet-base-v2',
    dimension: 768,
    pooling: 'mean' as const,
    normalize: true,
  },
  'bge-small-en-v1.5': {
    modelName: 'Xenova/bge-small-en-v1.5',
    dimension: 384,
    pooling: 'cls' as const,
    normalize: true,
  },
} as const;

/**
 * Create a TransformersEmbedding instance with a preset configuration
 * @param configName Name of the preset configuration
 * @returns TransformersEmbedding instance
 */
export function createTransformersEmbedding(
  configName: keyof typeof EMBEDDING_CONFIGS
): TransformersEmbedding {
  const config = EMBEDDING_CONFIGS[configName];
  if (!config) {
    throw new Error(`Unknown embedding configuration: ${configName}`);
  }
  return new TransformersEmbedding(config);
}
