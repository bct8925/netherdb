/**
 * Tests for TransformersEmbedding
 */

import {
  TransformersEmbedding,
  createTransformersEmbedding,
  EMBEDDING_CONFIGS,
} from '../../src/embeddings/TransformersEmbedding';

// Mock transformers library to avoid downloading models in tests
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
}));

describe('TransformersEmbedding', () => {
  let embedding: TransformersEmbedding;
  let mockPipeline: any;

  beforeEach(() => {
    mockPipeline = jest.fn();
    const { pipeline } = require('@xenova/transformers');
    (pipeline as jest.Mock).mockResolvedValue(mockPipeline);

    embedding = new TransformersEmbedding({
      modelName: 'test/model',
      dimension: 384,
      pooling: 'mean',
      normalize: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(embedding.initialize()).resolves.not.toThrow();

      const { pipeline } = require('@xenova/transformers');
      expect(pipeline).toHaveBeenCalledWith('feature-extraction', 'test/model');
    });

    it('should not initialize twice', async () => {
      await embedding.initialize();
      await embedding.initialize(); // Second call

      const { pipeline } = require('@xenova/transformers');
      expect(pipeline).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', async () => {
      const { pipeline } = require('@xenova/transformers');
      (pipeline as jest.Mock).mockRejectedValue(new Error('Model not found'));

      await expect(embedding.initialize()).rejects.toThrow(
        'Failed to initialize embedding model test/model: Model not found'
      );
    });
  });

  describe('embed', () => {
    beforeEach(async () => {
      await embedding.initialize();
    });

    it('should generate embeddings successfully', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      mockPipeline.mockResolvedValue([mockEmbedding]);

      const result = await embedding.embed('test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockPipeline).toHaveBeenCalledWith('test text');
    });

    it('should handle tensor output format', async () => {
      const dimension = 384;
      const batchSize = 1;
      const seqLength = 64;
      const mockData = new Array(batchSize * seqLength * dimension).fill(0.1);
      
      mockPipeline.mockResolvedValue({ 
        data: mockData,
        dims: [batchSize, seqLength, dimension]
      });

      const result = await embedding.embed('test text');

      expect(result).toHaveLength(dimension);
      expect(result.every(val => typeof val === 'number')).toBe(true);
    });

    it('should return zero vector for empty text', async () => {
      const result = await embedding.embed('');

      expect(result).toEqual(new Array(384).fill(0));
      expect(mockPipeline).not.toHaveBeenCalled();
    });

    it('should preprocess text correctly', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      mockPipeline.mockResolvedValue([mockEmbedding]);

      await embedding.embed('  text   with   spaces  ');

      expect(mockPipeline).toHaveBeenCalledWith('text with spaces');
    });

    it('should handle dimension mismatch', async () => {
      const wrongSizeEmbedding = new Array(256).fill(0.1); // Wrong size
      mockPipeline.mockResolvedValue([wrongSizeEmbedding]);

      await expect(embedding.embed('test')).rejects.toThrow(
        'Embedding dimension mismatch: expected 384, got 256'
      );
    });

    it('should throw error when not initialized', async () => {
      const uninitializedEmbedding = new TransformersEmbedding({
        modelName: 'test/model',
        dimension: 384,
      });

      await expect(uninitializedEmbedding.embed('test')).rejects.toThrow(
        'Embedding provider not initialized. Call initialize() first.'
      );
    });

    it('should handle unexpected output format', async () => {
      mockPipeline.mockResolvedValue('unexpected format');

      await expect(embedding.embed('test')).rejects.toThrow(
        'Unexpected embedding output format'
      );
    });
  });

  describe('embedBatch', () => {
    beforeEach(async () => {
      await embedding.initialize();
    });

    it('should generate batch embeddings successfully', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      mockPipeline.mockResolvedValue([mockEmbedding]);

      const texts = ['text 1', 'text 2', 'text 3'];
      const results = await embedding.embedBatch(texts);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual(mockEmbedding);
      expect(mockPipeline).toHaveBeenCalledTimes(3);
    });

    it('should handle large batches by processing in chunks', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      mockPipeline.mockResolvedValue([mockEmbedding]);

      // Create a batch larger than the internal batch size (32)
      const texts = Array(100).fill('test text');
      const results = await embedding.embedBatch(texts);

      expect(results).toHaveLength(100);
      expect(mockPipeline).toHaveBeenCalledTimes(100);
    });

    it('should handle mixed empty and non-empty texts', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      mockPipeline.mockResolvedValue([mockEmbedding]);

      const texts = ['test text', '', 'another text'];
      const results = await embedding.embedBatch(texts);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual(mockEmbedding);
      expect(results[1]).toEqual(new Array(384).fill(0)); // Zero vector for empty text
      expect(results[2]).toEqual(mockEmbedding);
      expect(mockPipeline).toHaveBeenCalledTimes(2); // Only for non-empty texts
    });
  });

  describe('utility methods', () => {
    it('should return correct dimension', () => {
      expect(embedding.getDimension()).toBe(384);
    });

    it('should return correct model name', () => {
      expect(embedding.getModelName()).toBe('test/model');
    });

    it('should dispose resources', async () => {
      await embedding.initialize();
      await expect(embedding.dispose()).resolves.not.toThrow();
    });
  });

  describe('preset configurations', () => {
    it('should have correct preset configurations', () => {
      expect(EMBEDDING_CONFIGS['all-MiniLM-L6-v2']).toEqual({
        modelName: 'Xenova/all-MiniLM-L6-v2',
        dimension: 384,
        pooling: 'mean',
        normalize: true,
      });

      expect(EMBEDDING_CONFIGS['all-mpnet-base-v2']).toEqual({
        modelName: 'Xenova/all-mpnet-base-v2',
        dimension: 768,
        pooling: 'mean',
        normalize: true,
      });

      expect(EMBEDDING_CONFIGS['bge-small-en-v1.5']).toEqual({
        modelName: 'Xenova/bge-small-en-v1.5',
        dimension: 384,
        pooling: 'cls',
        normalize: true,
      });
    });

    it('should create embedding with preset configuration', () => {
      const embeddingInstance = createTransformersEmbedding('all-MiniLM-L6-v2');

      expect(embeddingInstance).toBeInstanceOf(TransformersEmbedding);
      expect(embeddingInstance.getDimension()).toBe(384);
      expect(embeddingInstance.getModelName()).toBe('Xenova/all-MiniLM-L6-v2');
    });

    it('should throw error for unknown configuration', () => {
      expect(() => {
        createTransformersEmbedding('unknown-config' as never);
      }).toThrow('Unknown embedding configuration: unknown-config');
    });
  });

  describe('text preprocessing', () => {
    beforeEach(async () => {
      await embedding.initialize();
    });

    it('should handle null and undefined text', async () => {
      const result1 = await embedding.embed(null as never);
      const result2 = await embedding.embed(undefined as never);

      expect(result1).toEqual(new Array(384).fill(0));
      expect(result2).toEqual(new Array(384).fill(0));
    });

    it('should limit text length', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      mockPipeline.mockResolvedValue([mockEmbedding]);

      const longText = 'a'.repeat(1000);
      await embedding.embed(longText);

      // Should be called with truncated text
      expect(mockPipeline).toHaveBeenCalledWith('a'.repeat(512));
    });

    it('should normalize whitespace', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      mockPipeline.mockResolvedValue([mockEmbedding]);

      await embedding.embed('text\twith\n\nmultiple\r\nwhitespace');

      expect(mockPipeline).toHaveBeenCalledWith('text with multiple whitespace');
    });
  });
});