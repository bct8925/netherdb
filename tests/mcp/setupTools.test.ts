/**
 * Tests for setupTools function
 */

import { setupTools } from '../../src/mcp/server/setupTools';
import { SearchService, type FormattedSearchResult } from '../../src/services/SearchService';
import type { SearchResult } from '../../src/types/Common';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock dependencies
jest.mock('../../src/services/SearchService');

describe('setupTools', () => {
  let mockServer: jest.Mocked<McpServer>;
  let mockDb: any;
  let mockEmbedding: any;
  let mockLogger: any;
  let mockSearchService: jest.Mocked<SearchService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockServer = {
      registerTool: jest.fn(),
    } as any;

    mockDb = {};
    mockEmbedding = {};
    mockLogger = {};

    mockSearchService = {
      search: jest.fn(),
      getDocumentById: jest.fn(),
      getDocumentByPath: jest.fn(),
    } as any;

    (SearchService as jest.Mock).mockImplementation(() => mockSearchService);
  });

  it('should register search_knowledge and get_document tools', () => {
    setupTools(mockServer, mockDb, mockEmbedding, mockLogger);

    expect(SearchService).toHaveBeenCalledWith(mockDb, mockEmbedding, mockLogger);
    expect(mockServer.registerTool).toHaveBeenCalledTimes(2);
    
    // Check search_knowledge tool registration
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'search_knowledge',
      expect.objectContaining({
        title: 'Search Knowledge Base',
        inputSchema: expect.any(Object),
        outputSchema: expect.any(Object),
      }),
      expect.any(Function)
    );

    // Check get_document tool registration
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_document',
      expect.objectContaining({
        title: 'Get Document',
        inputSchema: expect.any(Object),
        outputSchema: expect.any(Object),
      }),
      expect.any(Function)
    );
  });

  describe('search_knowledge tool handler', () => {
    let searchHandler: (input: any) => Promise<any>;

    beforeEach(() => {
      setupTools(mockServer, mockDb, mockEmbedding, mockLogger);
      searchHandler = mockServer.registerTool.mock.calls[0]?.[2] as any;
    });

    it('should handle valid search query', async () => {
      const mockResults: FormattedSearchResult[] = [
        { 
          id: '1', 
          content: 'Test content', 
          metadata: { 
            filePath: '/test.md',
            title: 'Test',
            tags: [],
            lastModified: '2023-01-01T00:00:00.000Z'
          },
          score: 0.8,
          distance: 0.2,
          filePath: '/test.md',
          preview: 'Test content',
          relevanceScore: 0.8
        }
      ];
      mockSearchService.search.mockResolvedValue(mockResults);

      const input = {
        query: 'test query',
        limit: 10,
        threshold: 0.7
      };

      const result = await searchHandler(input);

      expect(mockSearchService.search).toHaveBeenCalledWith('test query', 'semantic', {
        limit: 10,
        threshold: 0.7,
        filters: undefined
      });

      expect(result).toEqual({
        content: [{
          type: 'text',
          text: expect.stringContaining('"searchType": "semantic"')
        }],
        structuredContent: expect.objectContaining({
          query: 'test query',
          results: mockResults,
          total: 1,
          searchType: 'semantic'
        })
      });
    });

    it('should handle search query with filters', async () => {
      const mockResults: FormattedSearchResult[] = [];
      mockSearchService.search.mockResolvedValue(mockResults);

      const input = {
        query: 'test query',
        limit: 5,
        threshold: 0.8,
        filters: {
          tags: ['important'],
          fileTypes: ['md'],
          sections: ['header']
        }
      };

      await searchHandler(input);

      expect(mockSearchService.search).toHaveBeenCalledWith('test query', 'semantic', {
        limit: 5,
        threshold: 0.8,
        filters: {
          tags: ['important'],
          fileTypes: ['md'],
          sections: ['header']
        }
      });
    });

    it('should validate query is non-empty string', async () => {
      const input = { query: '' };
      const result = await searchHandler(input);

      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          error: 'Query must be a non-empty string',
          searchType: 'error'
        })
      );
      expect(mockSearchService.search).not.toHaveBeenCalled();
    });

    it('should validate query is string type', async () => {
      const input = { query: null };
      const result = await searchHandler(input);

      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          error: 'Query must be a non-empty string',
          searchType: 'error'
        })
      );
      expect(mockSearchService.search).not.toHaveBeenCalled();
    });

    it('should validate limit is within bounds', async () => {
      const input = { query: 'test', limit: 150 };
      const result = await searchHandler(input);

      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          error: 'Limit must be between 1 and 100',
          searchType: 'error'
        })
      );
      expect(mockSearchService.search).not.toHaveBeenCalled();
    });

    it('should validate threshold is within bounds', async () => {
      const input = { query: 'test', threshold: 1.5 };
      const result = await searchHandler(input);

      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          error: 'Threshold must be between 0 and 1',
          searchType: 'error'
        })
      );
      expect(mockSearchService.search).not.toHaveBeenCalled();
    });

    it('should handle search service errors', async () => {
      const searchError = new Error('Search failed');
      mockSearchService.search.mockRejectedValue(searchError);

      const input = { query: 'test query' };
      const result = await searchHandler(input);

      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          error: 'Search failed',
          searchType: 'error'
        })
      );
    });
  });

  describe('get_document tool handler', () => {
    let documentHandler: (input: any) => Promise<any>;

    beforeEach(() => {
      setupTools(mockServer, mockDb, mockEmbedding, mockLogger);
      documentHandler = mockServer.registerTool.mock.calls[1]?.[2] as any;
    });

    it('should get document by ID', async () => {
      const mockDocument: SearchResult = {
        id: 'doc1',
        content: 'Document content',
        score: 1.0,
        distance: 0.0,
        metadata: {
          filePath: '/path/to/doc.md',
          title: 'Test Document',
          tags: ['test'],
          lastModified: new Date('2023-01-01'),
          chunkIndex: 0,
          totalChunks: 1
        }
      };
      mockSearchService.getDocumentById.mockResolvedValue(mockDocument);

      const input = { id: 'doc1' };
      const result = await documentHandler(input);

      expect(mockSearchService.getDocumentById).toHaveBeenCalledWith('doc1');
      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          id: 'doc1',
          path: '/path/to/doc.md',
          content: 'Document content',
          metadata: expect.objectContaining({
            title: 'Test Document',
            tags: ['test']
          })
        })
      );
    });

    it('should get document by path', async () => {
      const mockDocument: SearchResult = {
        id: 'doc1',
        content: 'Document content',
        score: 1.0,
        distance: 0.0,
        metadata: {
          filePath: '/path/to/doc.md',
          title: 'Test Document',
          tags: ['test'],
          lastModified: new Date('2023-01-01T00:00:00.000Z'),
          chunkIndex: 0,
          totalChunks: 1
        }
      };
      mockSearchService.getDocumentByPath.mockResolvedValue(mockDocument);

      const input = { path: '/path/to/doc.md' };
      const result = await documentHandler(input);

      expect(mockSearchService.getDocumentByPath).toHaveBeenCalledWith('/path/to/doc.md');
      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          path: '/path/to/doc.md',
          content: 'Document content'
        })
      );
    });

    it('should require either id or path', async () => {
      const input = {};
      const result = await documentHandler(input);

      expect(result.structuredContent).toEqual({
        error: 'Either id or path must be provided'
      });
      expect(mockSearchService.getDocumentById).not.toHaveBeenCalled();
      expect(mockSearchService.getDocumentByPath).not.toHaveBeenCalled();
    });

    it('should handle document not found', async () => {
      mockSearchService.getDocumentById.mockResolvedValue(null);

      const input = { id: 'nonexistent' };
      const result = await documentHandler(input);

      expect(result.structuredContent).toEqual({
        id: 'nonexistent',
        path: undefined,
        error: 'Document not found'
      });
    });

    it('should handle service errors', async () => {
      const serviceError = new Error('Database error');
      mockSearchService.getDocumentById.mockRejectedValue(serviceError);

      const input = { id: 'doc1' };
      const result = await documentHandler(input);

      expect(result.structuredContent).toEqual({
        id: 'doc1',
        path: undefined,
        error: 'Database error'
      });
    });
  });
});