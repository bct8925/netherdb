/**
 * Tests for MCPServer
 */

import { MCPServer, MCPServerConfig } from '../../src/mcp/server/MCPServer';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DatabaseFactory } from '../../src/database/factory';
import { TransformersEmbedding } from '../../src/embeddings/TransformersEmbedding';
import { Logger } from '../../src/utils/Logger';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('../../src/database/factory');
jest.mock('../../src/embeddings/TransformersEmbedding');
jest.mock('../../src/utils/Logger');
jest.mock('../../src/mcp/server/setupTools');
jest.mock('../../src/mcp/server/setupResources');

describe('MCPServer', () => {
  let mockMcpServer: jest.Mocked<McpServer>;
  let mockDb: any;
  let mockEmbedding: jest.Mocked<TransformersEmbedding>;
  let mockLogger: jest.Mocked<Logger>;
  let mockTransport: jest.Mocked<StdioServerTransport>;
  let testConfig: MCPServerConfig;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock MCP Server
    mockMcpServer = {
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      registerTool: jest.fn(),
      registerResource: jest.fn(),
    } as any;
    (McpServer as jest.Mock).mockImplementation(() => mockMcpServer);

    // Mock StdioServerTransport
    mockTransport = {} as any;
    (StdioServerTransport as jest.Mock).mockImplementation(() => mockTransport);

    // Mock Database
    mockDb = {
      initialize: jest.fn().mockResolvedValue(undefined),
    };
    (DatabaseFactory.create as jest.Mock).mockReturnValue(mockDb);

    // Mock Embedding
    mockEmbedding = {
      initialize: jest.fn().mockResolvedValue(undefined),
    } as any;
    (TransformersEmbedding as jest.Mock).mockImplementation(() => mockEmbedding);

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;
    (Logger as jest.Mock).mockImplementation(() => mockLogger);

    testConfig = {
      name: 'test-server',
      version: '1.0.0',
      database: {
        provider: 'lancedb' as const,
        connection: {
          path: './test.lancedb',
        },
      },
      embedding: {
        model: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
      },
    };
  });

  describe('constructor', () => {
    it('should create MCPServer with correct configuration', () => {
      new MCPServer(testConfig);

      expect(McpServer).toHaveBeenCalledWith({
        name: testConfig.name,
        version: testConfig.version,
      });
      expect(DatabaseFactory.create).toHaveBeenCalledWith(
        testConfig.database.provider,
        testConfig.database
      );
      expect(TransformersEmbedding).toHaveBeenCalledWith({
        modelName: testConfig.embedding.model,
        dimension: testConfig.embedding.dimensions,
      });
      expect(Logger).toHaveBeenCalledWith('MCPServer');
    });

    it('should setup tools and resources', () => {
      const setupTools = require('../../src/mcp/server/setupTools').setupTools;
      const setupResources = require('../../src/mcp/server/setupResources').setupResources;

      new MCPServer(testConfig);

      expect(setupTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockDb,
        mockEmbedding,
        mockLogger
      );
      expect(setupResources).toHaveBeenCalledWith(
        mockMcpServer,
        mockDb,
        mockLogger
      );
    });
  });

  describe('start', () => {
    let server: MCPServer;

    beforeEach(() => {
      server = new MCPServer(testConfig);
    });

    it('should start server successfully', async () => {
      await server.start();

      expect(mockDb.initialize).toHaveBeenCalled();
      expect(mockEmbedding.initialize).toHaveBeenCalled();
      expect(StdioServerTransport).toHaveBeenCalled();
      expect(mockMcpServer.connect).toHaveBeenCalledWith(mockTransport);
      expect(mockLogger.info).toHaveBeenCalledWith('Database initialized successfully');
      expect(mockLogger.info).toHaveBeenCalledWith('Embedding provider initialized successfully');
      expect(mockLogger.info).toHaveBeenCalledWith(
        `MCP Server ${testConfig.name} v${testConfig.version} started`
      );
    });

    it('should handle database initialization failure', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.initialize.mockRejectedValue(dbError);

      await expect(server.start()).rejects.toThrow(
        'Database initialization failed: Database connection failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Database initialization failed:', dbError);
    });

    it('should handle embedding initialization failure', async () => {
      const embeddingError = new Error('Model loading failed');
      mockEmbedding.initialize.mockRejectedValue(embeddingError);

      await expect(server.start()).rejects.toThrow(
        'Embedding provider initialization failed: Model loading failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Embedding provider initialization failed:',
        embeddingError
      );
    });

    it('should handle server connection failure', async () => {
      const connectionError = new Error('Transport failed');
      mockMcpServer.connect.mockRejectedValue(connectionError);

      await expect(server.start()).rejects.toThrow('Transport failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to start MCP server:', connectionError);
    });

    it('should handle unknown database error', async () => {
      mockDb.initialize.mockRejectedValue('Unknown error');

      await expect(server.start()).rejects.toThrow(
        'Database initialization failed: Unknown error'
      );
    });

    it('should handle unknown embedding error', async () => {
      mockEmbedding.initialize.mockRejectedValue('Unknown error');

      await expect(server.start()).rejects.toThrow(
        'Embedding provider initialization failed: Unknown error'
      );
    });
  });

  describe('stop', () => {
    let server: MCPServer;

    beforeEach(() => {
      server = new MCPServer(testConfig);
    });

    it('should stop server successfully', async () => {
      await server.stop();

      expect(mockMcpServer.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('MCP Server stopped');
    });

    it('should handle stop failure', async () => {
      const stopError = new Error('Failed to close');
      mockMcpServer.close.mockRejectedValue(stopError);

      await expect(server.stop()).rejects.toThrow('Failed to close');
      expect(mockLogger.error).toHaveBeenCalledWith('Error stopping MCP server:', stopError);
    });
  });
});