/**
 * Database factory for creating vector database instances
 */

import { VectorDatabase } from './interfaces/VectorDatabase';
import { LanceDBProvider, LanceDBConnectionConfig, LanceDBTableConfig } from './providers/lancedb';
import { DatabaseProviderConfig } from '../types/Config';

export interface DatabaseFactoryConfig {
  provider: DatabaseProviderConfig['provider'];
  connection: DatabaseProviderConfig['connection'];
  tableConfig?: Partial<LanceDBTableConfig>;
}

export class DatabaseFactory {
  /**
   * Create a vector database instance based on configuration
   * @param config Database configuration
   * @returns VectorDatabase instance
   */
  static create(provider: string, config: DatabaseProviderConfig): VectorDatabase {
    switch (provider) {
      case 'lancedb':
        return new LanceDBProvider(config.connection as LanceDBConnectionConfig);

      case 'chroma':
        throw new Error('Chroma provider not yet implemented');

      case 'weaviate':
        throw new Error('Weaviate provider not yet implemented');

      default:
        throw new Error(`Unsupported database provider: ${config.provider}`);
    }
  }

  /**
   * Create a LanceDB instance with default configuration
   * @param path Database file path
   * @param tableName Optional table name (defaults to 'vectors')
   * @returns LanceDB VectorDatabase instance
   */
  static createLanceDB(path: string, tableName = 'vectors'): VectorDatabase {
    return new LanceDBProvider(
      { path },
      {
        name: tableName,
        vectorColumn: 'vector',
        idColumn: 'id',
        contentColumn: 'content',
        metadataColumn: 'metadata',
        mode: 'create',
      }
    );
  }

  /**
   * Create a database instance from application configuration
   * @param appConfig Application configuration object
   * @returns VectorDatabase instance
   */
  static fromAppConfig(appConfig: DatabaseProviderConfig): VectorDatabase {
    return DatabaseFactory.create(appConfig.provider, appConfig);
  }

  /**
   * Get list of supported database providers
   * @returns Array of provider names
   */
  static getSupportedProviders(): string[] {
    return ['lancedb'];
  }

  /**
   * Check if a provider is supported
   * @param provider Provider name to check
   * @returns True if provider is supported
   */
  static isProviderSupported(provider: string): boolean {
    return DatabaseFactory.getSupportedProviders().includes(provider);
  }
}

/**
 * Convenience function to create a database instance
 * @param config Database configuration
 * @returns VectorDatabase instance
 */
export function createDatabase(provider: string, config: DatabaseProviderConfig): VectorDatabase {
  return DatabaseFactory.create(provider, config);
}

/**
 * Convenience function to create a LanceDB instance
 * @param path Database file path
 * @param tableName Optional table name
 * @returns LanceDB VectorDatabase instance
 */
export function createLanceDB(path: string, tableName?: string): VectorDatabase {
  return DatabaseFactory.createLanceDB(path, tableName);
}
