import { Command } from 'commander';
import { Logger } from '../../utils/Logger.js';
import { DatabaseFactory } from '../../database/factory.js';
import { VersionTracker } from '../../obsidian/indexing/VersionTracker.js';
import type { DatabaseConfig } from '../../types/Config.js';
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { createGzip, createGunzip } from 'zlib';

export interface BackupOptions {
  config?: string;
  dbPath?: string;
  output?: string;
  compress?: boolean;
  includeMetadata?: boolean;
}

export interface RestoreOptions {
  config?: string;
  dbPath?: string;
  backup: string;
  force?: boolean;
}

interface BackupManifest {
  version: string;
  createdAt: Date;
  databasePath: string;
  totalFiles: number;
  totalSize: number;
  compressed: boolean;
  includesMetadata: boolean;
  metadata?: {
    lastIndexedSHA?: string;
    indexedAt?: Date;
    totalDocuments?: number;
    totalChunks?: number;
  };
}

export class BackupCommand {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('BackupCommand');
  }

  public register(program: Command): void {
    const backup = program
      .command('backup')
      .description('Backup and restore vector database');

    backup
      .command('create')
      .description('Create a backup of the vector database')
      .option('--config <path>', 'Path to configuration file', 'config/default.json')
      .option('--db-path <path>', 'Path to vector database directory')
      .option('--output <path>', 'Output path for backup file', this.generateBackupFilename())
      .option('--compress', 'Compress backup file with gzip', true)
      .option('--include-metadata', 'Include version tracking metadata', true)
      .action((options: BackupOptions) => this.handleBackup(options));

    backup
      .command('restore')
      .description('Restore vector database from backup')
      .argument('<backup>', 'Path to backup file')
      .option('--config <path>', 'Path to configuration file', 'config/default.json')
      .option('--db-path <path>', 'Path to vector database directory')
      .option('--force', 'Force restore even if database exists')
      .action((backup: string, options: RestoreOptions) => 
        this.handleRestore({ ...options, backup }));

    backup
      .command('list')
      .description('List available backups in a directory')
      .argument('[directory]', 'Directory to search for backups', '.')
      .action((directory: string) => this.handleList(directory));

    backup
      .command('info')
      .description('Show information about a backup file')
      .argument('<backup>', 'Path to backup file')
      .action((backup: string) => this.handleInfo(backup));
  }

  private async handleBackup(options: BackupOptions): Promise<void> {
    try {
      this.logger.info('Starting backup operation', { options });

      // Load configuration
      const config = await this.loadConfig(options.config || 'config/default.json');
      
      if (options.dbPath) {
        config.database.connection.path = options.dbPath;
      }

      const dbPath = config.database.connection.path;
      const outputPath = options.output || this.generateBackupFilename();
      
      console.log('💾 Creating database backup...');
      console.log(`  Source: ${dbPath}`);
      console.log(`  Output: ${outputPath}`);

      // Check if database exists
      try {
        await stat(dbPath);
      } catch {
        console.error('❌ Database directory not found:', dbPath);
        process.exit(1);
      }

      // Initialize database for metadata
      const database = DatabaseFactory.create(config.database.provider, config.database);
      const versionTracker = new VersionTracker(process.cwd(), config.database.connection.path);

      // Initialize database
      await database.initialize();

      // Gather metadata
      let metadata: BackupManifest['metadata'] | undefined;
      if (options.includeMetadata !== false) {
        try {
          const hasVersionInfo = await versionTracker.hasVersionInfo();
          if (hasVersionInfo) {
            const versionInfo = await versionTracker.getVersionInfo();
            metadata = {
              lastIndexedSHA: versionInfo.lastIndexedSHA,
              indexedAt: versionInfo.indexedAt,
              totalDocuments: versionInfo.totalDocuments,
              totalChunks: versionInfo.totalChunks
            };
          }

          const stats = await database.getStats();
          metadata = {
            ...metadata,
            totalDocuments: stats.totalVectors,
            totalChunks: stats.totalVectors
          };
        } catch (error) {
          this.logger.warn('Could not gather metadata', { error });
        }
      }

      // Create backup
      const result = await this.createBackup(dbPath, outputPath, {
        compress: options.compress !== false,
        includeMetadata: options.includeMetadata !== false,
        metadata
      });

      console.log('✅ Backup created successfully!');
      console.log(`📊 Backup Info:`);
      console.log(`  Files: ${result.totalFiles}`);
      console.log(`  Size: ${this.formatBytes(result.totalSize)}`);
      console.log(`  Compressed: ${result.compressed ? 'Yes' : 'No'}`);
      console.log(`  Location: ${outputPath}`);

    } catch (error) {
      this.logger.error('Backup operation failed', { error });
      console.error('❌ Backup failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async handleRestore(options: RestoreOptions): Promise<void> {
    try {
      this.logger.info('Starting restore operation', { options });

      // Load configuration
      const config = await this.loadConfig(options.config || 'config/default.json');
      
      if (options.dbPath) {
        config.database.connection.path = options.dbPath;
      }

      const dbPath = config.database.connection.path;
      const backupPath = options.backup;

      console.log('🔄 Restoring database from backup...');
      console.log(`  Backup: ${backupPath}`);
      console.log(`  Target: ${dbPath}`);

      // Check if backup exists
      try {
        await stat(backupPath);
      } catch {
        console.error('❌ Backup file not found:', backupPath);
        process.exit(1);
      }

      // Check if target database exists
      let dbExists = false;
      try {
        await stat(dbPath);
        dbExists = true;
      } catch {
        // Database doesn't exist, which is fine
      }

      if (dbExists && !options.force) {
        console.error('❌ Database already exists. Use --force to overwrite.');
        process.exit(1);
      }

      // Read backup manifest
      const manifest = await this.readBackupManifest(backupPath);
      
      console.log('📋 Backup Information:');
      console.log(`  Created: ${manifest.createdAt}`);
      console.log(`  Files: ${manifest.totalFiles}`);
      console.log(`  Size: ${this.formatBytes(manifest.totalSize)}`);
      if (manifest.metadata) {
        console.log(`  Documents: ${manifest.metadata.totalDocuments || 'Unknown'}`);
        console.log(`  Chunks: ${manifest.metadata.totalChunks || 'Unknown'}`);
      }

      // Perform restore
      await this.performRestore(backupPath, dbPath, manifest);

      console.log('✅ Database restored successfully!');
      console.log(`📁 Database location: ${dbPath}`);

    } catch (error) {
      this.logger.error('Restore operation failed', { error });
      console.error('❌ Restore failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async handleList(directory: string): Promise<void> {
    try {
      console.log(`📁 Looking for backups in: ${directory}\n`);

      const files = await readdir(directory);
      const backupFiles = files.filter(file => 
        file.endsWith('.ovdb') || file.endsWith('.ovdb.gz')
      );

      if (backupFiles.length === 0) {
        console.log('No backup files found.');
        return;
      }

      console.log(`Found ${backupFiles.length} backup file(s):\n`);

      for (const file of backupFiles) {
        const filePath = join(directory, file);
        try {
          const manifest = await this.readBackupManifest(filePath);
          const fileStats = await stat(filePath);
          
          console.log(`📦 ${file}`);
          console.log(`  Created: ${manifest.createdAt}`);
          console.log(`  Size: ${this.formatBytes(fileStats.size)}`);
          console.log(`  Files: ${manifest.totalFiles}`);
          if (manifest.metadata) {
            console.log(`  Documents: ${manifest.metadata.totalDocuments || 'Unknown'}`);
          }
          console.log('');
        } catch {
          console.log(`📦 ${file} (invalid backup file)`);
          console.log('');
        }
      }

    } catch (error) {
      console.error('❌ Failed to list backups:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async handleInfo(backupPath: string): Promise<void> {
    try {
      console.log(`📋 Backup Information: ${basename(backupPath)}\n`);

      const manifest = await this.readBackupManifest(backupPath);
      const fileStats = await stat(backupPath);

      console.log('📦 File Information:');
      console.log(`  Path: ${backupPath}`);
      console.log(`  Size: ${this.formatBytes(fileStats.size)}`);
      console.log(`  Compressed: ${manifest.compressed ? 'Yes' : 'No'}`);

      console.log('\n📊 Backup Content:');
      console.log(`  Created: ${manifest.createdAt}`);
      console.log(`  Version: ${manifest.version}`);
      console.log(`  Source Database: ${manifest.databasePath}`);
      console.log(`  Total Files: ${manifest.totalFiles}`);
      console.log(`  Uncompressed Size: ${this.formatBytes(manifest.totalSize)}`);
      console.log(`  Includes Metadata: ${manifest.includesMetadata ? 'Yes' : 'No'}`);

      if (manifest.metadata) {
        console.log('\n📈 Database Metadata:');
        if (manifest.metadata.lastIndexedSHA) {
          console.log(`  Last Indexed SHA: ${manifest.metadata.lastIndexedSHA.substring(0, 8)}...`);
        }
        if (manifest.metadata.indexedAt) {
          console.log(`  Indexed At: ${manifest.metadata.indexedAt}`);
        }
        if (manifest.metadata.totalDocuments) {
          console.log(`  Documents: ${manifest.metadata.totalDocuments}`);
        }
        if (manifest.metadata.totalChunks) {
          console.log(`  Chunks: ${manifest.metadata.totalChunks}`);
        }
      }

    } catch (error) {
      console.error('❌ Failed to read backup info:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async createBackup(
    dbPath: string,
    outputPath: string,
    options: {
      compress: boolean;
      includeMetadata: boolean;
      metadata?: BackupManifest['metadata'];
    }
  ): Promise<{ totalFiles: number; totalSize: number; compressed: boolean }> {
    // Ensure output directory exists
    await mkdir(dirname(outputPath), { recursive: true });

    // Gather files to backup
    const files = await this.collectDatabaseFiles(dbPath);
    let totalSize = 0;
    
    for (const file of files) {
      const stats = await stat(file.fullPath);
      totalSize += stats.size;
    }

    // Create manifest
    const manifest: BackupManifest = {
      version: '1.0.0',
      createdAt: new Date(),
      databasePath: dbPath,
      totalFiles: files.length,
      totalSize,
      compressed: options.compress,
      includesMetadata: options.includeMetadata
    };

    if (options.metadata) {
      manifest.metadata = options.metadata;
    }

    // Create backup archive
    const archive = new Map<string, Buffer>();
    
    // Add manifest
    archive.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

    // Add database files
    for (const file of files) {
      const content = await readFile(file.fullPath);
      archive.set(file.relativePath, content);
    }

    // Serialize archive
    const archiveData = this.serializeArchive(archive);

    // Write to file (with optional compression)
    if (options.compress) {
      const compressed = await this.compressData(archiveData);
      await writeFile(outputPath, compressed);
    } else {
      await writeFile(outputPath, archiveData);
    }

    return {
      totalFiles: files.length,
      totalSize,
      compressed: options.compress
    };
  }

  private async performRestore(backupPath: string, dbPath: string, manifest: BackupManifest): Promise<void> {
    // Read backup file
    let archiveData: Buffer;
    if (manifest.compressed) {
      const compressed = await readFile(backupPath);
      archiveData = await this.decompressData(compressed);
    } else {
      archiveData = await readFile(backupPath);
    }

    // Deserialize archive
    const archive = this.deserializeArchive(archiveData);

    // Create target directory
    await mkdir(dbPath, { recursive: true });

    // Restore files
    for (const [relativePath, content] of archive) {
      if (relativePath === 'manifest.json') continue; // Skip manifest
      
      const targetPath = join(dbPath, relativePath);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content);
    }
  }

  private async collectDatabaseFiles(dbPath: string): Promise<Array<{ relativePath: string; fullPath: string }>> {
    const files: Array<{ relativePath: string; fullPath: string }> = [];
    
    const collectRecursive = async (currentPath: string, relativePath: string = '') => {
      const items = await readdir(currentPath);
      
      for (const item of items) {
        const fullPath = join(currentPath, item);
        const itemRelativePath = relativePath ? join(relativePath, item) : item;
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          await collectRecursive(fullPath, itemRelativePath);
        } else {
          files.push({
            relativePath: itemRelativePath,
            fullPath
          });
        }
      }
    };

    await collectRecursive(dbPath);
    return files;
  }

  private async readBackupManifest(backupPath: string): Promise<BackupManifest> {
    let archiveData: Buffer;
    
    // Try to read as compressed first
    try {
      const compressed = await readFile(backupPath);
      if (backupPath.endsWith('.gz')) {
        archiveData = await this.decompressData(compressed);
      } else {
        // Try decompression first, fallback to uncompressed
        try {
          archiveData = await this.decompressData(compressed);
        } catch {
          archiveData = compressed;
        }
      }
    } catch (error) {
      throw new Error(`Failed to read backup file: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Deserialize and extract manifest
    const archive = this.deserializeArchive(archiveData);
    const manifestData = archive.get('manifest.json');
    
    if (!manifestData) {
      throw new Error('Invalid backup file: missing manifest');
    }

    return JSON.parse(manifestData.toString());
  }

  private serializeArchive(archive: Map<string, Buffer>): Buffer {
    // Simple archive format: [fileCount][file1Length][file1Name][file1Data][file2Length]...
    const parts: Buffer[] = [];
    
    // File count
    const fileCountBuffer = Buffer.alloc(4);
    fileCountBuffer.writeUInt32BE(archive.size, 0);
    parts.push(fileCountBuffer);
    
    // Files
    for (const [name, data] of archive) {
      const nameBuffer = Buffer.from(name, 'utf8');
      
      // Name length + name + data length + data
      const nameLengthBuffer = Buffer.alloc(4);
      nameLengthBuffer.writeUInt32BE(nameBuffer.length, 0);
      
      const dataLengthBuffer = Buffer.alloc(4);
      dataLengthBuffer.writeUInt32BE(data.length, 0);
      
      parts.push(nameLengthBuffer, nameBuffer, dataLengthBuffer, data);
    }
    
    return Buffer.concat(parts);
  }

  private deserializeArchive(archiveData: Buffer): Map<string, Buffer> {
    const archive = new Map<string, Buffer>();
    let offset = 0;
    
    // Read file count
    const fileCount = archiveData.readUInt32BE(offset);
    offset += 4;
    
    // Read files
    for (let i = 0; i < fileCount; i++) {
      // Read name length and name
      const nameLength = archiveData.readUInt32BE(offset);
      offset += 4;
      
      const name = archiveData.subarray(offset, offset + nameLength).toString('utf8');
      offset += nameLength;
      
      // Read data length and data
      const dataLength = archiveData.readUInt32BE(offset);
      offset += 4;
      
      const data = archiveData.subarray(offset, offset + dataLength);
      offset += dataLength;
      
      archive.set(name, data);
    }
    
    return archive;
  }

  private async compressData(data: Buffer): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const gzip = createGzip();
    
    return new Promise((resolve, reject) => {
      gzip.on('data', chunk => chunks.push(chunk));
      gzip.on('end', () => resolve(Buffer.concat(chunks)));
      gzip.on('error', reject);
      
      gzip.write(data);
      gzip.end();
    });
  }

  private async decompressData(compressedData: Buffer): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();
    
    return new Promise((resolve, reject) => {
      gunzip.on('data', chunk => chunks.push(chunk));
      gunzip.on('end', () => resolve(Buffer.concat(chunks)));
      gunzip.on('error', reject);
      
      gunzip.write(compressedData);
      gunzip.end();
    });
  }

  private generateBackupFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `backup-${timestamp}.ovdb.gz`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  private async loadConfig(configPath: string): Promise<DatabaseConfig> {
    try {
      const configContent = await readFile(configPath, 'utf-8');
      return JSON.parse(configContent);
    } catch {
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