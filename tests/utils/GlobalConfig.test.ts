/**
 * Tests for GlobalConfig
 */

import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { GlobalConfig } from '../../src/utils/GlobalConfig';

// Mock dependencies
jest.mock('os');
jest.mock('fs/promises');
jest.mock('fs');

describe('GlobalConfig', () => {
  const mockHomeDir = '/home/user';

  beforeEach(() => {
    jest.clearAllMocks();
    (homedir as jest.Mock).mockReturnValue(mockHomeDir);
  });

  describe('getPaths', () => {
    it('should return global paths when isGlobal is true', () => {
      const paths = GlobalConfig.getPaths(true);

      expect(paths).toEqual({
        configPath: join(mockHomeDir, '.netherdb', 'config', 'default.json'),
        vaultPath: join(mockHomeDir, '.netherdb'),
        dbPath: join(mockHomeDir, '.netherdb', 'vectordb'),
      });
    });

    it('should return local paths when isGlobal is false', () => {
      const paths = GlobalConfig.getPaths(false);

      expect(paths).toEqual({
        configPath: 'config/default.json',
        vaultPath: process.cwd(),
        dbPath: './vectors.lancedb',
      });
    });
  });

  describe('ensureGlobalDirectories', () => {
    it('should create required global directories but not vectordb', async () => {
      await GlobalConfig.ensureGlobalDirectories();

      const expectedGlobalDir = join(mockHomeDir, '.netherdb');
      const expectedConfigDir = join(expectedGlobalDir, 'config');

      expect(mkdir).toHaveBeenCalledWith(expectedGlobalDir, { recursive: true });
      expect(mkdir).toHaveBeenCalledWith(expectedConfigDir, { recursive: true });
      expect(mkdir).toHaveBeenCalledTimes(2); // Only 2 calls, not 3
    });

    it('should handle mkdir errors gracefully', async () => {
      const mkdirError = new Error('Permission denied');
      (mkdir as jest.Mock).mockRejectedValue(mkdirError);

      await expect(GlobalConfig.ensureGlobalDirectories()).rejects.toThrow('Permission denied');
    });
  });

  describe('globalDirectoriesExist', () => {
    it('should return true when required directories exist', () => {
      (existsSync as jest.Mock).mockReturnValue(true);

      const result = GlobalConfig.globalDirectoriesExist();

      expect(result).toBe(true);
      expect(existsSync).toHaveBeenCalledTimes(2); // Only checks global and config dirs
    });

    it('should return false when any required directory is missing', () => {
      (existsSync as jest.Mock)
        .mockReturnValueOnce(true)  // global dir exists
        .mockReturnValueOnce(false); // config dir missing

      const result = GlobalConfig.globalDirectoriesExist();

      expect(result).toBe(false);
    });

    it('should return false when global directory is missing', () => {
      (existsSync as jest.Mock).mockReturnValue(false);

      const result = GlobalConfig.globalDirectoriesExist();

      expect(result).toBe(false);
    });
  });

  describe('getGlobalDirectory', () => {
    it('should return correct global directory path', () => {
      const globalDir = GlobalConfig.getGlobalDirectory();

      expect(globalDir).toBe(join(mockHomeDir, '.netherdb'));
    });
  });

  describe('ensureGlobalConfig', () => {
    const testConfigPath = join(mockHomeDir, '.netherdb', 'config', 'default.json');

    it('should not create config if file already exists', async () => {
      (readFile as jest.Mock).mockResolvedValue('existing config');

      await GlobalConfig.ensureGlobalConfig(testConfigPath);

      expect(readFile).toHaveBeenCalledWith(testConfigPath, 'utf-8');
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should create default config when file does not exist', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await GlobalConfig.ensureGlobalConfig(testConfigPath);

      expect(writeFile).toHaveBeenCalledWith(
        testConfigPath,
        expect.stringContaining('"provider": "lancedb"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        `📁 Created global config at ${testConfigPath}`
      );

      consoleSpy.mockRestore();
    });

    it('should create config with correct global paths', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      await GlobalConfig.ensureGlobalConfig(testConfigPath);

      const writeCall = (writeFile as jest.Mock).mock.calls[0];
      const configContent = JSON.parse(writeCall[1]);

      expect(configContent.database.connection.path).toBe(
        join(mockHomeDir, '.netherdb', 'vectordb')
      );
      expect(configContent.obsidian.vaultPath).toBe(
        join(mockHomeDir, '.netherdb')
      );
    });

    it('should create config with all required sections', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      await GlobalConfig.ensureGlobalConfig(testConfigPath);

      const writeCall = (writeFile as jest.Mock).mock.calls[0];
      const configContent = JSON.parse(writeCall[1]);

      expect(configContent).toHaveProperty('database');
      expect(configContent).toHaveProperty('embedding');
      expect(configContent).toHaveProperty('obsidian');
      expect(configContent).toHaveProperty('mcp');
      expect(configContent).toHaveProperty('logging');

      // Verify database config
      expect(configContent.database).toEqual({
        provider: 'lancedb',
        connection: {
          path: join(mockHomeDir, '.netherdb', 'vectordb'),
        },
      });

      // Verify embedding config
      expect(configContent.embedding).toEqual({
        model: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
      });

      // Verify obsidian config
      expect(configContent.obsidian.vaultPath).toBe(join(mockHomeDir, '.netherdb'));
      expect(configContent.obsidian).toHaveProperty('chunking');
      expect(configContent.obsidian).toHaveProperty('indexing');

      // Verify MCP config
      expect(configContent.mcp).toEqual({
        server: {
          name: 'netherdb',
          version: '0.1.0',
        },
      });

      // Verify logging config
      expect(configContent.logging).toEqual({
        level: 'info',
        format: 'text',
      });
    });

    it('should create config with proper chunking settings', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      await GlobalConfig.ensureGlobalConfig(testConfigPath);

      const writeCall = (writeFile as jest.Mock).mock.calls[0];
      const configContent = JSON.parse(writeCall[1]);

      expect(configContent.obsidian.chunking).toEqual({
        maxTokens: 512,
        overlapTokens: 50,
        splitByHeaders: true,
        splitByParagraphs: true,
        includeHeaders: true,
        preserveCodeBlocks: true,
        preserveTables: true,
        preserveCallouts: false,
      });
    });

    it('should create config with proper indexing settings', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      await GlobalConfig.ensureGlobalConfig(testConfigPath);

      const writeCall = (writeFile as jest.Mock).mock.calls[0];
      const configContent = JSON.parse(writeCall[1]);

      expect(configContent.obsidian.indexing).toEqual({
        batchSize: 10,
        includePatterns: ['**/*.md'],
        excludePatterns: [
          '.git/**',
          'node_modules/**',
          '.obsidian/**',
          'config/**',
          'vectordb/**',
        ],
      });
    });

    it('should handle writeFile errors', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      const writeError = new Error('Write permission denied');
      (writeFile as jest.Mock).mockRejectedValue(writeError);

      await expect(GlobalConfig.ensureGlobalConfig(testConfigPath)).rejects.toThrow(
        'Write permission denied'
      );
    });

    it('should format JSON with proper indentation', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      (writeFile as jest.Mock).mockResolvedValue(undefined);

      await GlobalConfig.ensureGlobalConfig(testConfigPath);

      const writeCall = (writeFile as jest.Mock).mock.calls[0];
      const jsonString = writeCall[1];

      // Check that JSON is properly formatted with 2-space indentation
      expect(jsonString).toContain('{\n  "database"');
      expect(jsonString).toContain('  "provider": "lancedb"');
    });
  });
});