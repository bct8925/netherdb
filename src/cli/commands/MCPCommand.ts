import { Command } from 'commander';
import { MCPServer, MCPServerConfig } from '../../mcp/server/MCPServer.js';
import { Logger } from '../../utils/Logger.js';
import type { DatabaseProviderConfig, EmbeddingConfig, AppConfig } from '../../types/Config.js';
import { readFile } from 'fs/promises';

export class MCPCommand {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('MCPCommand');
  }

  register(program: Command): void {
    const mcpCommand = program
      .command('mcp')
      .description('Start the MCP (Model Context Protocol) server');

    mcpCommand
      .command('start')
      .description('Start the MCP server')
      .option('-c, --config <path>', 'Configuration file path')
      .option('-d, --db-path <path>', 'Path to vector database directory')
      .option('-v, --verbose', 'Enable verbose logging')
      .action(async (options) => {
        await this.startServer(options);
      });
  }

  private async startServer(options: { verbose?: boolean; config?: string; dbPath?: string }): Promise<void> {
    try {
      if (options.verbose) {
        // Logger doesn't have setLevel method - using verbose flag for future implementation
        console.log('Verbose logging enabled');
      }

      this.logger.info('Starting MCP server...');

      // Load configuration
      const config = await this.loadConfig(options.config || 'config/default.json');
      
      // Override config with CLI options
      if (options.dbPath) {
        config.database.connection.path = options.dbPath;
      }

      // Create database configuration
      const databaseConfig: DatabaseProviderConfig = config.database;

      const embeddingConfig: EmbeddingConfig = config.embedding;

      // Create MCP server configuration
      const serverConfig: MCPServerConfig = {
        name: 'netherdb',
        version: '1.0.0',
        database: databaseConfig,
        embedding: embeddingConfig
      };

      // Create and start the server
      const server = new MCPServer(serverConfig);
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        this.logger.info('Received SIGINT, shutting down gracefully...');
        try {
          await server.stop();
          process.exit(0);
        } catch (error) {
          this.logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      process.on('SIGTERM', async () => {
        this.logger.info('Received SIGTERM, shutting down gracefully...');
        try {
          await server.stop();
          process.exit(0);
        } catch (error) {
          this.logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      await server.start();
      
      // Keep the process alive
      process.stdin.resume();
      
    } catch (error) {
      this.logger.error('Failed to start MCP server:', error);
      process.exit(1);
    }
  }

  private async loadConfig(configPath: string): Promise<AppConfig> {
    try {
      const configContent = await readFile(configPath, 'utf-8');
      return JSON.parse(configContent);
    } catch {
      // Use default config if file doesn't exist
      this.logger.warn(`Config file not found at ${configPath}, using defaults`);
      
      return {
        database: {
          provider: 'lancedb' as const,
          connection: {
            path: './vector-db'
          }
        },
        embedding: {
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384
        },
        obsidian: {
          vaultPath: process.cwd(),
          chunking: {
            maxTokens: 512,
            overlapTokens: 50,
            splitByHeaders: true,
            splitByParagraphs: true,
            includeHeaders: true,
            preserveCodeBlocks: true,
            preserveTables: true,
            preserveCallouts: false
          },
          indexing: {
            batchSize: 10,
            includePatterns: ['*.md'],
            excludePatterns: ['.git/**', 'node_modules/**', '.obsidian/**']
          }
        }
      };
    }
  }
}