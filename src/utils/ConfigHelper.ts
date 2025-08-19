/**
 * Helper functions for command configuration handling
 */

import { Command } from 'commander';
import { GlobalConfig } from './GlobalConfig';
import { readFile } from 'fs/promises';
import type { DatabaseConfig } from '../types/Config';

export interface BaseCommandOptions {
  config?: string;
  vaultPath?: string;
  dbPath?: string;
}

export class ConfigHelper {
  /**
   * Load configuration with global flag support
   */
  static async loadConfigWithGlobalSupport(
    options: BaseCommandOptions,
    command: Command
  ): Promise<{ config: DatabaseConfig; isGlobal: boolean }> {
    // Check if global flag is set on parent command
    const isGlobal = command.parent?.getOptionValue('global') || false;
    const paths = GlobalConfig.getPaths(isGlobal);

    // Ensure global directories exist if using global flag
    if (isGlobal) {
      await GlobalConfig.ensureGlobalDirectories();
      await GlobalConfig.ensureGlobalConfig(paths.configPath);
    }

    // Determine config path (global base or override)
    const configPath = options.config || paths.configPath;
    const config = await ConfigHelper.loadConfig(configPath);

    // If in global mode, use global paths as base and apply option overrides
    if (isGlobal) {
      // Set global paths as base
      config.obsidian.vaultPath = paths.vaultPath;
      config.database.connection.path = paths.dbPath;

      // Apply CLI option overrides if provided
      if (options.vaultPath) {
        config.obsidian.vaultPath = options.vaultPath;
      }
      if (options.dbPath) {
        config.database.connection.path = options.dbPath;
      }
    } else {
      // In local mode, only apply CLI option overrides if provided
      if (options.vaultPath) {
        config.obsidian.vaultPath = options.vaultPath;
      }
      if (options.dbPath) {
        config.database.connection.path = options.dbPath;
      }
    }

    return { config, isGlobal };
  }

  /**
   * Load configuration from file
   */
  static async loadConfig(configPath: string): Promise<DatabaseConfig> {
    try {
      const configContent = await readFile(configPath, 'utf-8');
      return JSON.parse(configContent);
    } catch {
      // Use default config if file doesn't exist
      return {
        database: {
          provider: 'lancedb' as const,
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
    }
  }
}
