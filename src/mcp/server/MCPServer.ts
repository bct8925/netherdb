import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Logger } from '../../utils/Logger';
import { DatabaseFactory } from '../../database/factory';
import { TransformersEmbedding } from '../../embeddings/TransformersEmbedding';
import type { VectorDatabase } from '../../database/interfaces/VectorDatabase';
import type { DatabaseProviderConfig, EmbeddingConfig } from '../../types/Config';
import { setupTools } from './setupTools';
import { setupResources } from './setupResources';

export interface MCPServerConfig {
  name: string;
  version: string;
  database: DatabaseProviderConfig;
  embedding: EmbeddingConfig;
}

export class MCPServer {
  private server: McpServer;
  private db: VectorDatabase;
  private embedding: TransformersEmbedding;
  private logger: Logger;
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.logger = new Logger('MCPServer');
    
    this.server = new McpServer({
      name: config.name,
      version: config.version,
    });

    this.db = DatabaseFactory.create(config.database.provider, config.database);
    this.embedding = new TransformersEmbedding({
      modelName: config.embedding.model,
      dimension: config.embedding.dimensions
    });
    
    setupTools(
      this.server,
      this.db,
      this.embedding,
      this.logger
    );
    
    setupResources(
      this.server,
      this.db,
      this.logger
    );
  }

  async start(): Promise<void> {
    try {
      // Initialize database and embedding provider
      try {
        await this.db.initialize();
        this.logger.info('Database initialized successfully');
      } catch (dbError) {
        this.logger.error('Database initialization failed:', dbError);
        throw new Error(`Database initialization failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
      }
      
      try {
        await this.embedding.initialize();
        this.logger.info('Embedding provider initialized successfully');
      } catch (embeddingError) {
        this.logger.error('Embedding provider initialization failed:', embeddingError);
        throw new Error(`Embedding provider initialization failed: ${embeddingError instanceof Error ? embeddingError.message : 'Unknown error'}`);
      }
      
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      this.logger.info(`MCP Server ${this.config.name} v${this.config.version} started`);
    } catch (error) {
      this.logger.error('Failed to start MCP server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.server.close();
      this.logger.info('MCP Server stopped');
    } catch (error) {
      this.logger.error('Error stopping MCP server:', error);
      throw error;
    }
  }
}