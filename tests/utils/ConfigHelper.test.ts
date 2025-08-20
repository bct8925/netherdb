/**
 * Tests for ConfigHelper
 */

import { Command } from 'commander';
import { ConfigHelper } from '../../src/utils/ConfigHelper';
import { GlobalConfig } from '../../src/utils/GlobalConfig';
import { readFile } from 'fs/promises';

// Mock dependencies
jest.mock('../../src/utils/GlobalConfig');
jest.mock('fs/promises');

describe('ConfigHelper', () => {
  let mockCommand: jest.Mocked<Command>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCommand = {
      parent: {
        getOptionValue: jest.fn(),
      },
    } as any;

    // Mock GlobalConfig
    (GlobalConfig.getPaths as jest.Mock).mockReturnValue({
      configPath: '/home/.netherdb/config/default.json',
      vaultPath: '/home/.netherdb',
      dbPath: '/home/.netherdb/vectordb',
    });
    (GlobalConfig.ensureGlobalDirectories as jest.Mock).mockResolvedValue(undefined);
    (GlobalConfig.ensureGlobalConfig as jest.Mock).mockResolvedValue(undefined);
  });

  describe('loadConfigWithGlobalSupport', () => {
    const mockConfig = {
      database: {
        provider: 'lancedb' as const,
        connection: { path: './vectors.lancedb' },
      },
      embedding: {
        model: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
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
          preserveCallouts: false,
        },
        indexing: {
          batchSize: 10,
          includePatterns: ['*.md'],
          excludePatterns: [
            '.git/**',
            'node_modules/**',
            '.obsidian/**',
            'config/**',
            'vectordb/**',
          ],
        },
      },
    };

    beforeEach(() => {
      (readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockConfig));
    });

    it('should load config in local mode when global flag is false', async () => {
      mockCommand.parent!.getOptionValue = jest.fn().mockReturnValue(false);

      const result = await ConfigHelper.loadConfigWithGlobalSupport({}, mockCommand);

      expect(GlobalConfig.getPaths).toHaveBeenCalledWith(false);
      expect(GlobalConfig.ensureGlobalDirectories).not.toHaveBeenCalled();
      expect(GlobalConfig.ensureGlobalConfig).not.toHaveBeenCalled();
      expect(result.isGlobal).toBe(false);
      expect(result.config).toEqual(mockConfig);
    });

    it('should load config in global mode when global flag is true', async () => {
      mockCommand.parent!.getOptionValue = jest.fn().mockReturnValue(true);

      const result = await ConfigHelper.loadConfigWithGlobalSupport({}, mockCommand);

      expect(GlobalConfig.getPaths).toHaveBeenCalledWith(true);
      expect(GlobalConfig.ensureGlobalDirectories).toHaveBeenCalled();
      expect(GlobalConfig.ensureGlobalConfig).toHaveBeenCalledWith(
        '/home/.netherdb/config/default.json'
      );
      expect(result.isGlobal).toBe(true);
      expect(result.config.obsidian.vaultPath).toBe('/home/.netherdb');
      expect(result.config.database.connection.path).toBe('/home/.netherdb/vectordb');
    });

    it('should handle no parent command gracefully', async () => {
      const commandWithoutParent = {} as Command;

      const result = await ConfigHelper.loadConfigWithGlobalSupport({}, commandWithoutParent);

      expect(result.isGlobal).toBe(false);
    });

    it('should use custom config path when provided', async () => {
      const customConfigPath = './custom-config.json';
      const options = { config: customConfigPath };

      await ConfigHelper.loadConfigWithGlobalSupport(options, mockCommand);

      expect(readFile).toHaveBeenCalledWith(customConfigPath, 'utf-8');
    });

    it('should apply CLI option overrides in local mode', async () => {
      mockCommand.parent!.getOptionValue = jest.fn().mockReturnValue(false);
      const options = {
        vaultPath: './custom-vault',
        dbPath: './custom-db',
      };

      const result = await ConfigHelper.loadConfigWithGlobalSupport(options, mockCommand);

      expect(result.config.obsidian.vaultPath).toBe('./custom-vault');
      expect(result.config.database.connection.path).toBe('./custom-db');
    });

    it('should apply CLI option overrides in global mode', async () => {
      mockCommand.parent!.getOptionValue = jest.fn().mockReturnValue(true);
      const options = {
        vaultPath: './custom-vault',
        dbPath: './custom-db',
      };

      const result = await ConfigHelper.loadConfigWithGlobalSupport(options, mockCommand);

      expect(result.config.obsidian.vaultPath).toBe('./custom-vault');
      expect(result.config.database.connection.path).toBe('./custom-db');
    });

    it('should use global paths as base in global mode without overrides', async () => {
      mockCommand.parent!.getOptionValue = jest.fn().mockReturnValue(true);
      const options = {};

      const result = await ConfigHelper.loadConfigWithGlobalSupport(options, mockCommand);

      expect(result.config.obsidian.vaultPath).toBe('/home/.netherdb');
      expect(result.config.database.connection.path).toBe('/home/.netherdb/vectordb');
    });

    it('should only override specified options', async () => {
      mockCommand.parent!.getOptionValue = jest.fn().mockReturnValue(false);
      const options = {
        vaultPath: './custom-vault',
        // dbPath not specified
      };

      const result = await ConfigHelper.loadConfigWithGlobalSupport(options, mockCommand);

      expect(result.config.obsidian.vaultPath).toBe('./custom-vault');
      expect(result.config.database.connection.path).toBe('./vectors.lancedb'); // Original value
    });
  });

  describe('loadConfig', () => {
    it('should load config from file successfully', async () => {
      const configData = {
        database: { provider: 'lancedb' },
        embedding: { model: 'test-model' },
      };
      (readFile as jest.Mock).mockResolvedValue(JSON.stringify(configData));

      const result = await ConfigHelper.loadConfig('./config.json');

      expect(readFile).toHaveBeenCalledWith('./config.json', 'utf-8');
      expect(result).toEqual(configData);
    });

    it('should return default config when file read fails', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const result = await ConfigHelper.loadConfig('./nonexistent.json');

      expect(result).toEqual({
        database: {
          provider: 'lancedb',
          connection: {
            path: './vectors.lancedb',
          },
        },
        embedding: {
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384,
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
            preserveCallouts: false,
          },
          indexing: {
            batchSize: 10,
            includePatterns: ['**/*.md'],
            excludePatterns: [
              '.git/**',
              'node_modules/**',
              '.obsidian/**',
              'config/**',
              'vectordb/**',
            ],
          },
        },
      });
    });

    it('should handle invalid JSON gracefully', async () => {
      (readFile as jest.Mock).mockResolvedValue('invalid json');

      const result = await ConfigHelper.loadConfig('./invalid.json');

      // Should return default config when JSON parsing fails
      expect(result.database.provider).toBe('lancedb');
    });
  });
});