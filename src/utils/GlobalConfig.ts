/**
 * Global configuration utilities for handling --global flag
 */

import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

export interface GlobalPaths {
  configPath: string;
  vaultPath: string;
  dbPath: string;
}

export class GlobalConfig {
  /**
   * Get paths based on global flag
   */
  static getPaths(isGlobal: boolean): GlobalPaths {
    if (isGlobal) {
      const globalDir = join(homedir(), '.netherdb');
      return {
        configPath: join(globalDir, 'config', 'default.json'),
        vaultPath: globalDir,
        dbPath: join(globalDir, 'vectordb'),
      };
    } else {
      return {
        configPath: 'config/default.json',
        vaultPath: process.cwd(),
        dbPath: './vectors.lancedb',
      };
    }
  }

  /**
   * Ensure global directories exist (config only, not database)
   */
  static async ensureGlobalDirectories(): Promise<void> {
    const globalDir = join(homedir(), '.netherdb');
    const configDir = join(globalDir, 'config');

    await mkdir(globalDir, { recursive: true });
    await mkdir(configDir, { recursive: true });
    // Note: vectordb directory is only created by index commands, not by status/other commands
  }

  /**
   * Check if global directories exist
   */
  static globalDirectoriesExist(): boolean {
    const globalDir = join(homedir(), '.netherdb');
    const configDir = join(globalDir, 'config');

    return existsSync(globalDir) && existsSync(configDir);
  }

  /**
   * Get global directory path
   */
  static getGlobalDirectory(): string {
    return join(homedir(), '.netherdb');
  }

  /**
   * Ensure global config file exists with default values
   */
  static async ensureGlobalConfig(configPath: string): Promise<void> {
    try {
      await readFile(configPath, 'utf-8');
    } catch {
      // Create default global config if it doesn't exist
      const paths = GlobalConfig.getPaths(true);
      const defaultConfig = {
        database: {
          provider: 'lancedb' as const,
          connection: {
            path: paths.dbPath,
          },
        },
        embedding: {
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384,
        },
        obsidian: {
          vaultPath: paths.vaultPath,
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
        mcp: {
          server: {
            name: 'netherdb',
            version: '0.1.0',
          },
        },
        logging: {
          level: 'info' as const,
          format: 'text' as const,
        },
      };

      await writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
      console.log(`📁 Created global config at ${configPath}`);
    }
  }
}
