/**
 * Tests for MCPCommand
 */

import { Command } from 'commander';
import { MCPCommand } from '../../src/cli/commands/MCPCommand';
import { MCPServer } from '../../src/mcp/server/MCPServer';
import { ConfigHelper } from '../../src/utils/ConfigHelper';
import { Logger } from '../../src/utils/Logger';

// Mock dependencies
jest.mock('../../src/mcp/server/MCPServer');
jest.mock('../../src/utils/ConfigHelper');
jest.mock('../../src/utils/Logger');

describe('MCPCommand', () => {
  let mcpCommand: MCPCommand;
  let mockProgram: jest.Mocked<Command>;
  let mockMcpSubCommand: jest.Mocked<Command>;
  let mockStartCommand: jest.Mocked<Command>;
  let mockLogger: jest.Mocked<Logger>;
  let mockMCPServer: jest.Mocked<MCPServer>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;
    (Logger as jest.Mock).mockImplementation(() => mockLogger);

    // Mock MCP Server
    mockMCPServer = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    } as any;
    (MCPServer as jest.Mock).mockImplementation(() => mockMCPServer);

    // Mock Commander commands
    mockStartCommand = {
      description: jest.fn().mockReturnThis(),
      option: jest.fn().mockReturnThis(),
      action: jest.fn().mockReturnThis(),
    } as any;

    mockMcpSubCommand = {
      command: jest.fn().mockReturnValue(mockStartCommand),
      description: jest.fn().mockReturnThis(),
    } as any;

    mockProgram = {
      command: jest.fn().mockReturnValue(mockMcpSubCommand),
      getOptionValue: jest.fn(),
      parent: null,
    } as any;

    mcpCommand = new MCPCommand();
  });

  describe('register', () => {
    it('should register mcp command with start subcommand', () => {
      mcpCommand.register(mockProgram);

      expect(mockProgram.command).toHaveBeenCalledWith('mcp');
      expect(mockMcpSubCommand.description).toHaveBeenCalledWith(
        'Start the MCP (Model Context Protocol) server'
      );
      expect(mockMcpSubCommand.command).toHaveBeenCalledWith('start');
      expect(mockStartCommand.description).toHaveBeenCalledWith('Start the MCP server');
      expect(mockStartCommand.option).toHaveBeenCalledWith(
        '-c, --config <path>',
        'Configuration file path'
      );
      expect(mockStartCommand.option).toHaveBeenCalledWith(
        '-d, --db-path <path>',
        'Path to vector database directory'
      );
      expect(mockStartCommand.option).toHaveBeenCalledWith(
        '-v, --verbose',
        'Enable verbose logging'
      );
      expect(mockStartCommand.action).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('startServer', () => {
    let actionHandler: (options: any, command: Command) => Promise<void>;
    let mockCommand: jest.Mocked<Command>;

    beforeEach(() => {
      mcpCommand.register(mockProgram);
      actionHandler = mockStartCommand.action.mock.calls[0]?.[0] as any;

      mockCommand = {
        parent: {
          getOptionValue: jest.fn(),
        },
      } as any;

      // Mock ConfigHelper
      (ConfigHelper.loadConfigWithGlobalSupport as jest.Mock).mockResolvedValue({
        config: {
          database: {
            provider: 'lancedb',
            connection: { path: './test.lancedb' },
          },
          embedding: {
            model: 'Xenova/all-MiniLM-L6-v2',
            dimensions: 384,
          },
        },
        isGlobal: false,
      });

      // Mock process.stdin.resume
      jest.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should start MCP server successfully', async () => {
      const options = { verbose: false };

      await actionHandler(options, mockCommand);

      expect(ConfigHelper.loadConfigWithGlobalSupport).toHaveBeenCalledWith(
        options,
        mockCommand
      );
      expect(MCPServer).toHaveBeenCalledWith({
        name: 'netherdb',
        version: '1.0.0',
        database: {
          provider: 'lancedb',
          connection: { path: './test.lancedb' },
        },
        embedding: {
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384,
        },
      });
      expect(mockMCPServer.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Starting MCP server...');
    });

    it('should handle verbose option', async () => {
      const options = { verbose: true };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await actionHandler(options, mockCommand);

      expect(consoleSpy).toHaveBeenCalledWith('Verbose logging enabled');
      consoleSpy.mockRestore();
    });

    it('should handle global configuration', async () => {
      (ConfigHelper.loadConfigWithGlobalSupport as jest.Mock).mockResolvedValue({
        config: {
          database: {
            provider: 'lancedb',
            connection: { path: '/home/.netherdb/vectordb' },
          },
          embedding: {
            model: 'Xenova/all-MiniLM-L6-v2',
            dimensions: 384,
          },
        },
        isGlobal: true,
      });

      const options = {};
      mockCommand.parent!.getOptionValue = jest.fn().mockReturnValue(true);

      await actionHandler(options, mockCommand);

      expect(ConfigHelper.loadConfigWithGlobalSupport).toHaveBeenCalledWith(
        options,
        mockCommand
      );
      expect(MCPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          database: expect.objectContaining({
            connection: { path: '/home/.netherdb/vectordb' },
          }),
        })
      );
    });

    it('should handle config and dbPath options', async () => {
      const options = {
        config: './custom-config.json',
        dbPath: './custom-db',
      };

      await actionHandler(options, mockCommand);

      expect(ConfigHelper.loadConfigWithGlobalSupport).toHaveBeenCalledWith(
        options,
        mockCommand
      );
    });

    it('should handle server start failure', async () => {
      const startError = new Error('Server start failed');
      mockMCPServer.start.mockRejectedValue(startError);
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const options = {};

      await expect(actionHandler(options, mockCommand)).rejects.toThrow('process.exit called');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to start MCP server:', startError);
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    it('should handle config loading failure', async () => {
      const configError = new Error('Config loading failed');
      (ConfigHelper.loadConfigWithGlobalSupport as jest.Mock).mockRejectedValue(configError);
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const options = {};

      await expect(actionHandler(options, mockCommand)).rejects.toThrow('process.exit called');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to start MCP server:', configError);
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    describe('signal handling', () => {
      let originalListeners: { [key: string]: any[] };

      beforeEach(() => {
        // Store original listeners
        originalListeners = {
          SIGINT: process.listeners('SIGINT') as any[],
          SIGTERM: process.listeners('SIGTERM') as any[],
        };

        // Remove existing listeners
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
      });

      afterEach(() => {
        // Restore original listeners
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        originalListeners.SIGINT?.forEach(listener => process.on('SIGINT', listener));
        originalListeners.SIGTERM?.forEach(listener => process.on('SIGTERM', listener));
      });

      it('should handle SIGINT gracefully', async () => {
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
        const options = {};

        await actionHandler(options, mockCommand);

        // Trigger SIGINT
        process.emit('SIGINT', 'SIGINT');

        // Wait for async handler
        await new Promise(resolve => global.setTimeout(resolve, 0));

        expect(mockLogger.info).toHaveBeenCalledWith('Received SIGINT, shutting down gracefully...');
        expect(mockMCPServer.stop).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);

        exitSpy.mockRestore();
      });

      it('should handle SIGTERM gracefully', async () => {
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
        const options = {};

        await actionHandler(options, mockCommand);

        // Trigger SIGTERM
        process.emit('SIGTERM', 'SIGTERM');

        // Wait for async handler
        await new Promise(resolve => global.setTimeout(resolve, 0));

        expect(mockLogger.info).toHaveBeenCalledWith('Received SIGTERM, shutting down gracefully...');
        expect(mockMCPServer.stop).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);

        exitSpy.mockRestore();
      });

      it('should handle shutdown errors', async () => {
        const shutdownError = new Error('Shutdown failed');
        mockMCPServer.stop.mockRejectedValue(shutdownError);
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
        const options = {};

        await actionHandler(options, mockCommand);

        // Trigger SIGINT
        process.emit('SIGINT', 'SIGINT');

        // Wait for async handler
        await new Promise(resolve => global.setTimeout(resolve, 0));

        expect(mockLogger.error).toHaveBeenCalledWith('Error during shutdown:', shutdownError);
        expect(exitSpy).toHaveBeenCalledWith(1);

        exitSpy.mockRestore();
      });
    });
  });
});