/**
 * Tests for DatabaseFactory
 */

import { DatabaseFactory, createDatabase, createLanceDB } from '../../src/database/factory';
import { LanceDBProvider } from '../../src/database/providers/lancedb';

describe('DatabaseFactory', () => {
  describe('create', () => {
    it('should create LanceDB instance', () => {
      const db = DatabaseFactory.create('lancedb', {
        provider: 'lancedb',
        connection: { path: './test.lancedb' },
      });

      expect(db).toBeInstanceOf(LanceDBProvider);
    });

    it('should throw error for unsupported provider', () => {
      expect(() => {
        DatabaseFactory.create('unsupported', {
          provider: 'unsupported' as never,
          connection: { path: './test.lancedb' },
        });
      }).toThrow('Unsupported database provider: unsupported');
    });

    it('should throw error for chroma (not implemented)', () => {
      expect(() => {
        DatabaseFactory.create('chroma', {
          provider: 'chroma',
          connection: { path: './test.chroma' },
        });
      }).toThrow('Chroma provider not yet implemented');
    });

    it('should throw error for weaviate (not implemented)', () => {
      expect(() => {
        DatabaseFactory.create('weaviate', {
          provider: 'weaviate',
          connection: { path: './test.weaviate' },
        });
      }).toThrow('Weaviate provider not yet implemented');
    });
  });

  describe('createLanceDB', () => {
    it('should create LanceDB instance with default table name', () => {
      const db = DatabaseFactory.createLanceDB('./test.lancedb');
      expect(db).toBeInstanceOf(LanceDBProvider);
    });

    it('should create LanceDB instance with custom table name', () => {
      const db = DatabaseFactory.createLanceDB('./test.lancedb', 'custom_table');
      expect(db).toBeInstanceOf(LanceDBProvider);
    });
  });

  describe('fromAppConfig', () => {
    it('should create database from app config', () => {
      const config = {
        provider: 'lancedb' as const,
        connection: { path: './test.lancedb' },
        embedding: { model: 'test', dimensions: 384 },
      };

      const db = DatabaseFactory.fromAppConfig(config);
      expect(db).toBeInstanceOf(LanceDBProvider);
    });
  });

  describe('getSupportedProviders', () => {
    it('should return list of supported providers', () => {
      const providers = DatabaseFactory.getSupportedProviders();
      expect(providers).toEqual(['lancedb']);
    });
  });

  describe('isProviderSupported', () => {
    it('should return true for supported provider', () => {
      expect(DatabaseFactory.isProviderSupported('lancedb')).toBe(true);
    });

    it('should return false for unsupported provider', () => {
      expect(DatabaseFactory.isProviderSupported('unsupported')).toBe(false);
    });
  });

  describe('convenience functions', () => {
    it('createDatabase should work', () => {
      const db = createDatabase('lancedb', {
        provider: 'lancedb',
        connection: { path: './test.lancedb' },
      });
      expect(db).toBeInstanceOf(LanceDBProvider);
    });

    it('createLanceDB should work', () => {
      const db = createLanceDB('./test.lancedb');
      expect(db).toBeInstanceOf(LanceDBProvider);
    });
  });
});