import { Command } from 'commander';
import { MCPServer, MCPServerConfig } from '../../mcp/server/MCPServer';
import { Logger } from '../../utils/Logger';
import { ConfigHelper } from '../../utils/ConfigHelper';
import type { DatabaseProviderConfig, EmbeddingConfig } from '../../types/Config';

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
      .action(async (options, command) => {
        await this.startServer(options, command);
      });
  }

  private async startServer(options: { verbose?: boolean; config?: string; dbPath?: string }, command: Command): Promise<void> {
    try {
      if (options.verbose) {
        // Logger doesn't have setLevel method - using verbose flag for future implementation
        console.log('Verbose logging enabled');
      }

      this.logger.info('Starting MCP server...');

      // Load configuration with global support
      const { config } = await ConfigHelper.loadConfigWithGlobalSupport(options, command);

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

}