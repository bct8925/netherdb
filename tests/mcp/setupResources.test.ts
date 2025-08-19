/**
 * Tests for setupResources function
 */

import { setupResources } from '../../src/mcp/server/setupResources';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('setupResources', () => {
  let mockServer: jest.Mocked<McpServer>;
  let mockDb: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockServer = {
      registerResource: jest.fn(),
    } as any;

    mockDb = {
      getStats: jest.fn(),
      query: jest.fn(),
      listIndices: jest.fn(),
    };

    mockLogger = {
      error: jest.fn(),
    };
  });

  it('should register all resources', () => {
    setupResources(mockServer, mockDb, mockLogger);

    expect(mockServer.registerResource).toHaveBeenCalledTimes(3);
    
    // Check knowledge-base-stats resource
    expect(mockServer.registerResource).toHaveBeenCalledWith(
      'knowledge-base-stats',
      'obsidian://knowledge-base/stats',
      expect.objectContaining({
        name: 'Knowledge Base Statistics',
        description: 'Database statistics and health information',
        mimeType: 'application/json',
      }),
      expect.any(Function)
    );

    // Check knowledge-base-documents resource
    expect(mockServer.registerResource).toHaveBeenCalledWith(
      'knowledge-base-documents',
      'obsidian://knowledge-base/documents',
      expect.objectContaining({
        name: 'All Documents',
        description: 'List of all documents in the knowledge base',
        mimeType: 'application/json',
      }),
      expect.any(Function)
    );

    // Check knowledge-base-indices resource
    expect(mockServer.registerResource).toHaveBeenCalledWith(
      'knowledge-base-indices',
      'obsidian://knowledge-base/indices',
      expect.objectContaining({
        name: 'Database Indices',
        description: 'List of all database indices',
        mimeType: 'application/json',
      }),
      expect.any(Function)
    );
  });

  describe('knowledge-base-stats resource handler', () => {
    let statsHandler: () => Promise<any>;

    beforeEach(() => {
      setupResources(mockServer, mockDb, mockLogger);
      statsHandler = mockServer.registerResource.mock.calls[0]?.[3] as any;
    });

    it('should return database statistics', async () => {
      const mockStats = {
        totalVectors: 100,
        totalDocuments: 50,
        lastUpdated: '2023-01-01T00:00:00.000Z'
      };
      mockDb.getStats.mockResolvedValue(mockStats);

      const result = await statsHandler();

      expect(mockDb.getStats).toHaveBeenCalled();
      expect(result).toEqual({
        contents: [{
          uri: 'obsidian://knowledge-base/stats',
          text: JSON.stringify(mockStats, null, 2),
          mimeType: 'application/json',
        }],
      });
    });

    it('should handle stats error', async () => {
      const error = new Error('Database unavailable');
      mockDb.getStats.mockRejectedValue(error);

      const result = await statsHandler();

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get stats:', error);
      expect(result).toEqual({
        contents: [{
          uri: 'obsidian://knowledge-base/stats',
          text: JSON.stringify({ error: 'Failed to retrieve statistics' }, null, 2),
          mimeType: 'application/json',
        }],
      });
    });
  });

  describe('knowledge-base-documents resource handler', () => {
    let documentsHandler: () => Promise<any>;

    beforeEach(() => {
      setupResources(mockServer, mockDb, mockLogger);
      documentsHandler = mockServer.registerResource.mock.calls[1]?.[3] as any;
    });

    it('should return list of documents', async () => {
      const mockStats = { totalVectors: 200 };
      const mockDocuments = {
        results: [
          {
            id: 'doc1',
            content: 'This is a test document with some content that should be truncated',
            metadata: {
              filePath: '/path/to/doc1.md',
              title: 'Document 1',
              tags: ['test', 'example'],
              lastModified: new Date('2023-01-01'),
            }
          },
          {
            id: 'doc2',
            content: 'Short content',
            metadata: {
              filePath: '/path/to/doc2.md',
              title: 'Document 2',
              tags: [],
              lastModified: '2023-01-02T00:00:00.000Z',
            }
          }
        ]
      };

      mockDb.getStats.mockResolvedValue(mockStats);
      mockDb.query.mockResolvedValue(mockDocuments);

      const result = await documentsHandler();

      expect(mockDb.getStats).toHaveBeenCalled();
      expect(mockDb.query).toHaveBeenCalledWith('', {
        limit: 20,
        includeMetadata: true,
      });

      const expectedDocuments = {
        total: 200,
        sampleCount: 2,
        documents: [
          {
            id: 'doc1',
            filePath: '/path/to/doc1.md',
            title: 'Document 1',
            tags: ['test', 'example'],
            lastModified: '2023-01-01T00:00:00.000Z',
            preview: 'This is a test document with some content that should be truncated',
          },
          {
            id: 'doc2',
            filePath: '/path/to/doc2.md',
            title: 'Document 2',
            tags: [],
            lastModified: '2023-01-02T00:00:00.000Z',
            preview: 'Short content',
          }
        ]
      };

      expect(result).toEqual({
        contents: [{
          uri: 'obsidian://knowledge-base/documents',
          text: JSON.stringify(expectedDocuments, null, 2),
          mimeType: 'application/json',
        }],
      });
    });

    it('should handle missing metadata fields gracefully', async () => {
      const mockStats = { totalVectors: 1 };
      const mockDocuments = {
        results: [
          {
            id: 'doc1',
            content: 'Test content',
            metadata: {
              filePath: '/path/to/doc1.md',
              title: 'Document 1',
              // Missing tags and lastModified
            }
          }
        ]
      };

      mockDb.getStats.mockResolvedValue(mockStats);
      mockDb.query.mockResolvedValue(mockDocuments);

      const result = await documentsHandler();

      const parsedResult = JSON.parse(result.contents[0].text);
      expect(parsedResult.documents[0]).toEqual(
        expect.objectContaining({
          id: 'doc1',
          tags: [],
          lastModified: expect.any(String), // Should be current date
        })
      );
    });

    it('should handle documents query error', async () => {
      const error = new Error('Query failed');
      mockDb.getStats.mockRejectedValue(error);

      const result = await documentsHandler();

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to list documents:', error);
      expect(result).toEqual({
        contents: [{
          uri: 'obsidian://knowledge-base/documents',
          text: JSON.stringify({ error: 'Failed to list documents' }, null, 2),
          mimeType: 'application/json',
        }],
      });
    });
  });

  describe('knowledge-base-indices resource handler', () => {
    let indicesHandler: () => Promise<any>;

    beforeEach(() => {
      setupResources(mockServer, mockDb, mockLogger);
      indicesHandler = mockServer.registerResource.mock.calls[2]?.[3] as any;
    });

    it('should return list of indices', async () => {
      const mockIndices = [
        { name: 'vector_index', type: 'IVF_PQ', status: 'ready' },
        { name: 'metadata_index', type: 'BTREE', status: 'ready' }
      ];
      mockDb.listIndices.mockResolvedValue(mockIndices);

      const result = await indicesHandler();

      expect(mockDb.listIndices).toHaveBeenCalled();
      expect(result).toEqual({
        contents: [{
          uri: 'obsidian://knowledge-base/indices',
          text: JSON.stringify(mockIndices, null, 2),
          mimeType: 'application/json',
        }],
      });
    });

    it('should handle indices query error', async () => {
      const error = new Error('Indices query failed');
      mockDb.listIndices.mockRejectedValue(error);

      const result = await indicesHandler();

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to list indices:', error);
      expect(result).toEqual({
        contents: [{
          uri: 'obsidian://knowledge-base/indices',
          text: JSON.stringify({ error: 'Failed to list indices' }, null, 2),
          mimeType: 'application/json',
        }],
      });
    });
  });

  describe('createPreview helper function', () => {
    it('should truncate long content', () => {
      // This test indirectly tests the createPreview function through document handler
      const longContent = 'A'.repeat(200);
      const expectedPreview = 'A'.repeat(100) + '...';

      // Test through the documents handler
      const mockStats = { totalVectors: 1 };
      const mockDocuments = {
        results: [
          {
            id: 'doc1',
            content: longContent,
            metadata: {
              filePath: '/path/to/doc1.md',
              title: 'Document 1',
              tags: [],
              lastModified: new Date('2023-01-01'),
            }
          }
        ]
      };

      mockDb.getStats.mockResolvedValue(mockStats);
      mockDb.query.mockResolvedValue(mockDocuments);

      setupResources(mockServer, mockDb, mockLogger);
      const documentsHandler = mockServer.registerResource.mock.calls[1]?.[3] as any;

      return documentsHandler().then((result: any) => {
        const parsedResult = JSON.parse(result.contents[0].text);
        expect(parsedResult.documents[0].preview).toBe(expectedPreview);
      });
    });

    it('should clean up whitespace in preview', () => {
      const contentWithWhitespace = 'Line 1\n\nLine 2\t\tTabbed content   ';
      const expectedPreview = 'Line 1 Line 2 Tabbed content';

      // Test through the documents handler
      const mockStats = { totalVectors: 1 };
      const mockDocuments = {
        results: [
          {
            id: 'doc1',
            content: contentWithWhitespace,
            metadata: {
              filePath: '/path/to/doc1.md',
              title: 'Document 1',
              tags: [],
              lastModified: new Date('2023-01-01'),
            }
          }
        ]
      };

      mockDb.getStats.mockResolvedValue(mockStats);
      mockDb.query.mockResolvedValue(mockDocuments);

      setupResources(mockServer, mockDb, mockLogger);
      const documentsHandler = mockServer.registerResource.mock.calls[1]?.[3] as any;

      return documentsHandler().then((result: any) => {
        const parsedResult = JSON.parse(result.contents[0].text);
        expect(parsedResult.documents[0].preview).toBe(expectedPreview);
      });
    });
  });
});