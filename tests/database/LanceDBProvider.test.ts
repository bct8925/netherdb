/**
 * Tests for LanceDBProvider
 */

import { LanceDBProvider } from '../../src/database/providers/lancedb';
import { VectorData } from '../../src/types/Common';

// Mock LanceDB to avoid actual file operations in tests
jest.mock('@lancedb/lancedb', () => ({
  connect: jest.fn(),
}));

describe('LanceDBProvider', () => {
  let provider: LanceDBProvider;
  let mockConnection: any;
  let mockTable: any;
  const testDbPath = './test-data/test.lancedb';

  beforeEach(() => {
    // Setup mocks
    mockTable = {
      add: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      countRows: jest.fn().mockResolvedValue(0),
      version: jest.fn().mockResolvedValue(1),
      createIndex: jest.fn().mockResolvedValue(undefined),
      mergeInsert: jest.fn().mockReturnValue({
        whenMatchedUpdateAll: jest.fn().mockReturnThis(),
        whenNotMatchedInsertAll: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
    };

    mockConnection = {
      tableNames: jest.fn().mockResolvedValue([]),
      createTable: jest.fn().mockResolvedValue(mockTable),
      openTable: jest.fn().mockResolvedValue(mockTable),
    };

    const { connect } = require('@lancedb/lancedb');
    (connect as jest.Mock).mockResolvedValue(mockConnection);

    provider = new LanceDBProvider({ path: testDbPath });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(provider.initialize()).resolves.not.toThrow();
      expect(mockConnection.tableNames).toHaveBeenCalled();
    });

    it('should create table if it does not exist', async () => {
      mockConnection.tableNames.mockResolvedValue([]);
      
      await provider.initialize();
      
      expect(mockConnection.createTable).toHaveBeenCalled();
      expect(mockTable.delete).toHaveBeenCalledWith("id = 'sample_id'");
    });

    it('should open existing table', async () => {
      mockConnection.tableNames.mockResolvedValue(['vectors']);
      
      await provider.initialize();
      
      expect(mockConnection.openTable).toHaveBeenCalledWith('vectors');
    });

    it('should handle initialization errors', async () => {
      const { connect } = require('@lancedb/lancedb');
      (connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      await expect(provider.initialize()).rejects.toThrow('Failed to initialize LanceDB: Connection failed');
    });
  });

  describe('insert operations', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should insert vectors successfully', async () => {
      const vectors: VectorData[] = [
        {
          id: 'test-1',
          vector: [0.1, 0.2, 0.3],
          content: 'Test content',
          metadata: {
            filePath: '/test.md',
            title: 'Test',
            tags: ['test'],
            chunkIndex: 0,
            totalChunks: 1,
            lastModified: new Date(),
          },
        },
      ];

      const result = await provider.insert(vectors);

      expect(result).toEqual(['test-1']);
      expect(mockTable.add).toHaveBeenCalledWith([
        {
          id: 'test-1',
          vector: [0.1, 0.2, 0.3],
          content: 'Test content',
          metadata: {
            ...vectors[0]!.metadata,
            lastModified: expect.any(String), // Date converted to ISO string
          },
        },
      ]);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedProvider = new LanceDBProvider({ path: testDbPath });
      
      await expect(uninitializedProvider.insert([])).rejects.toThrow(
        'Database not initialized. Call initialize() first.'
      );
    });

    it('should handle insert errors', async () => {
      mockTable.add.mockRejectedValue(new Error('Insert failed'));

      await expect(provider.insert([{
        id: 'test',
        vector: [],
        content: '',
        metadata: {
          filePath: '',
          title: '',
          tags: [],
          chunkIndex: 0,
          totalChunks: 1,
          lastModified: new Date(),
        },
      }])).rejects.toThrow('Failed to insert vectors: Insert failed');
    });

    it('should upsert vectors successfully', async () => {
      const testVectors = [
        {
          id: 'test-1',
          vector: [0.1, 0.2, 0.3],
          content: 'Test content',
          metadata: {
            filePath: '/test.md',
            title: 'Test',
            tags: ['test'],
            chunkIndex: 0,
            totalChunks: 1,
            lastModified: new Date(),
          },
        },
      ];

      const result = await provider.upsert(testVectors);

      expect(mockTable.mergeInsert).toHaveBeenCalledWith('id');
      expect(mockTable.mergeInsert().whenMatchedUpdateAll).toHaveBeenCalled();
      expect(mockTable.mergeInsert().whenNotMatchedInsertAll).toHaveBeenCalled();
      expect(mockTable.mergeInsert().execute).toHaveBeenCalledWith([
        {
          id: 'test-1',
          vector: [0.1, 0.2, 0.3],
          content: 'Test content',
          metadata: expect.objectContaining({
            filePath: '/test.md',
            title: 'Test',
            tags: ['test'],
            chunkIndex: 0,
            totalChunks: 1,
            lastModified: expect.any(String), // ISO string conversion
          }),
        },
      ]);
      expect(result).toEqual(['test-1']);
    });
  });

  describe('search operations', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should search vectors successfully', async () => {
      const mockResults = [
        {
          id: 'test-1',
          content: 'Test content',
          metadata: { title: 'Test' },
          _score: 0.95,
          _distance: 0.05,
        },
      ];

      mockTable.search().limit().where().toArray.mockResolvedValue(mockResults);

      const results = await provider.search([0.1, 0.2, 0.3]);

      expect(results).toEqual([
        {
          id: 'test-1',
          content: 'Test content',
          metadata: { title: 'Test' },
          score: 0.95,
          distance: 0.05,
        },
      ]);

      expect(mockTable.search).toHaveBeenCalledWith([0.1, 0.2, 0.3]);
    });

    it('should apply filters correctly', async () => {
      const filters = {
        tags: ['test'],
        dateRange: {
          from: new Date('2023-01-01'),
          to: new Date('2023-12-31'),
        },
      };

      await provider.search([0.1, 0.2, 0.3], filters);

      // Search filtering is done client-side in our implementation
      expect(mockTable.search).toHaveBeenCalledWith([0.1, 0.2, 0.3]);
      expect(mockTable.search().limit).toHaveBeenCalled();
      expect(mockTable.search().limit().toArray).toHaveBeenCalled();
    });

    it('should handle search errors', async () => {
      mockTable.search().limit().where().toArray.mockRejectedValue(new Error('Search failed'));

      await expect(provider.search([0.1, 0.2, 0.3])).rejects.toThrow(
        'Failed to search vectors: Search failed'
      );
    });
  });

  describe('update operations', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should update vector successfully', async () => {
      // Mock existing record for metadata merge
      mockTable.search().limit().where().toArray.mockResolvedValue([
        {
          id: 'test-1',
          vector: [0.1, 0.2, 0.3],
          content: 'Test',
          metadata: { existing: 'data' },
        },
      ]);

      await provider.update('test-1', [0.4, 0.5, 0.6], { new: 'metadata' });

      // Update now uses delete + add approach
      expect(mockTable.delete).toHaveBeenCalledWith("id = 'test-1'");
      expect(mockTable.add).toHaveBeenCalledWith([
        {
          id: 'test-1',
          vector: [0.4, 0.5, 0.6],
          content: 'Test',
          metadata: { existing: 'data', new: 'metadata' },
        },
      ]);
    });
  });

  describe('delete operations', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should delete vector successfully', async () => {
      await provider.delete('test-1');

      expect(mockTable.delete).toHaveBeenCalledWith("id = 'test-1'");
    });

    it('should batch delete vectors successfully', async () => {
      await provider.batchDelete(['test-1', 'test-2']);

      expect(mockTable.delete).toHaveBeenCalledWith("id IN ('test-1', 'test-2')");
    });
  });

  describe('utility operations', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should get stats successfully', async () => {
      mockTable.countRows.mockResolvedValue(100);

      const stats = await provider.getStats();

      expect(stats.totalVectors).toBe(100);
      expect(stats.indexHealth).toBe('healthy');
    });

    it('should handle stats errors gracefully', async () => {
      mockTable.countRows.mockRejectedValue(new Error('Count failed'));

      const stats = await provider.getStats();

      expect(stats.totalVectors).toBe(0);
      expect(stats.indexHealth).toBe('error');
    });

    it('should count vectors successfully', async () => {
      mockTable.countRows.mockResolvedValue(50);

      const count = await provider.count();

      expect(count).toBe(50);
    });

    it('should check if record exists', async () => {
      // Mock existing record
      mockTable.search().limit().where().toArray.mockResolvedValue([{ id: 'test-1' }]);

      const exists = await provider.exists('test-1');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent record', async () => {
      mockTable.search().limit().where().toArray.mockResolvedValue([]);

      const exists = await provider.exists('non-existent');

      expect(exists).toBe(false);
    });

    it('should get record by ID', async () => {
      const mockRecord = {
        id: 'test-1',
        vector: [0.1, 0.2, 0.3],
        content: 'Test',
        metadata: { title: 'Test' },
      };

      mockTable.search().limit().where().toArray.mockResolvedValue([mockRecord]);

      const result = await provider.getById('test-1');

      expect(result).toEqual(mockRecord);
    });

    it('should return null for non-existent record', async () => {
      mockTable.search().limit().where().toArray.mockResolvedValue([]);

      const result = await provider.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('index operations', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should create index successfully', async () => {
      const config = {
        name: 'test_index',
        vectorColumn: 'vector',
        metricType: 'cosine' as const,
      };

      await provider.createIndex(config);

      expect(mockTable.createIndex).toHaveBeenCalledWith('vector');
    });

    it('should list indices', async () => {
      mockTable.countRows.mockResolvedValue(100);

      const indices = await provider.listIndices();

      expect(indices).toHaveLength(1);
      expect(indices[0]!.name).toBe('vector_index');
      expect(indices[0]!.vectorCount).toBe(100);
    });
  });

  describe('close', () => {
    it('should close connection successfully', async () => {
      await provider.initialize();
      await expect(provider.close()).resolves.not.toThrow();
    });
  });
});