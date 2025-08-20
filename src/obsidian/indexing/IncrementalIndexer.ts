import { FileIndexer, IndexingConfig, IndexingResult, IndexingError } from './FileIndexer';
import { ObsidianManager } from './ObsidianManager';
import { VersionTracker, VersionInfo } from './VersionTracker';
import { VectorDatabase } from '../../database/interfaces/VectorDatabase';
import { Logger } from '../../utils/Logger';
import { GitFileChange } from '../../types/GitTypes';

/**
 * Configuration for incremental indexing operations
 */
export interface IncrementalConfig extends Partial<IndexingConfig> {
  // Change detection
  forceFullReindex?: boolean;
  maxChangedFiles?: number;
  
  // Performance optimization
  batchDeleteSize?: number;
  deleteBeforeInsert?: boolean;
  
  // Change handling
  handleRenames?: boolean;
  handleMoves?: boolean;
}

/**
 * Result of incremental indexing operation
 */
export interface IncrementalResult extends IndexingResult {
  changesSummary: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
  };
  versionInfo: VersionInfo;
  fullReindexTriggered: boolean;
}

/**
 * Incremental indexer that processes only changed files based on git history
 */
export class IncrementalIndexer {
  private readonly fileIndexer: FileIndexer;
  private readonly obsidianManager: ObsidianManager;
  private readonly versionTracker: VersionTracker;
  private readonly vectorDb: VectorDatabase;
  private readonly logger: Logger;
  private readonly config: IncrementalConfig;

  constructor(
    fileIndexer: FileIndexer,
    obsidianManager: ObsidianManager,
    versionTracker: VersionTracker,
    vectorDb: VectorDatabase,
    config: IncrementalConfig = {},
    logger?: Logger
  ) {
    this.fileIndexer = fileIndexer;
    this.obsidianManager = obsidianManager;
    this.versionTracker = versionTracker;
    this.vectorDb = vectorDb;
    this.logger = logger || new Logger('IncrementalIndexer');
    
    this.config = {
      maxChangedFiles: 100,
      batchDeleteSize: 50,
      deleteBeforeInsert: true,
      handleRenames: true,
      handleMoves: true,
      skipErrorFiles: true,
      ...config,
    };
  }

  /**
   * Detect changes since last indexing (public method for CLI)
   */
  async detectChanges(): Promise<{
    added: string[];
    modified: string[];
    deleted: string[];
  }> {
    const changes = await this.versionTracker.getChangedFiles(['.md']);
    
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    
    for (const change of changes) {
      switch (change.status) {
        case 'added':
          added.push(change.path);
          break;
        case 'modified':
          modified.push(change.path);
          break;
        case 'deleted':
          deleted.push(change.path);
          break;
        case 'renamed':
          if (change.oldPath) {
            deleted.push(change.oldPath);
          }
          added.push(change.path);
          break;
      }
    }
    
    return { added, modified, deleted };
  }

  /**
   * Perform incremental indexing based on detected changes
   */
  async performIncrementalIndex(): Promise<IncrementalResult> {
    const startTime = Date.now();
    this.logger.info('Starting incremental indexing');

    try {
      // Check if incremental indexing is possible
      const canIncremental = await this.canPerformIncremental();
      
      if (!canIncremental || this.config.forceFullReindex) {
        this.logger.info('Falling back to full reindex');
        return await this.performFullReindex();
      }

      // Get changed files
      const changesResult = await this.obsidianManager.getChangedFiles();
      
      if (changesResult.changes.length === 0) {
        this.logger.info('No changes detected, skipping indexing');
        return await this.createNoChangesResult();
      }

      this.logger.info(
        `Processing ${changesResult.changes.length} changed files`
      );

      // Check if changes exceed threshold for full reindex
      if (changesResult.changes.length > (this.config.maxChangedFiles || 100)) {
        this.logger.info(
          `Too many changes (${changesResult.changes.length}), triggering full reindex`
        );
        return await this.performFullReindex();
      }

      // Process changes incrementally
      const result = await this.processChanges(changesResult.changes);

      // Update version info after successful indexing
      await this.updateVersionAfterIndexing(result);

      const processingTime = Date.now() - startTime;
      this.logger.info(
        `Incremental indexing completed in ${processingTime}ms: ` +
        `${result.changesSummary.added} added, ${result.changesSummary.modified} modified, ` +
        `${result.changesSummary.deleted} deleted`
      );

      return {
        ...result,
        processingTime,
        fullReindexTriggered: false,
      };

    } catch (error) {
      this.logger.error('Error during incremental indexing:', error);
      throw error;
    }
  }

  /**
   * Process individual file changes
   */
  private async processChanges(changes: GitFileChange[]): Promise<IncrementalResult> {
    const changesSummary = {
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
    };

    const errors: IndexingError[] = [];
    const skippedFiles: string[] = [];
    let totalChunks = 0;

    // Group changes by type for efficient processing
    const changesByType = this.groupChangesByType(changes);

    // TODO: Process deletions first
    // if (changesByType.deleted.length > 0) {
    //   this.logger.debug(`Processing ${changesByType.deleted.length} deletions`);
      
    //   for (const change of changesByType.deleted) {
    //     try {
    //       await this.handleFileDeletion(change.path);
    //       changesSummary.deleted++;
    //     } catch (error) {
    //       this.logger.error(`Error deleting file ${change.path}:`, error);
    //       if (!this.config.skipErrorFiles) throw error;
    //       errors.push({
    //         file: change.path,
    //         error: error instanceof Error ? error.message : String(error),
    //         stage: 'storage',
    //         timestamp: new Date(),
    //       });
    //     }
    //   }
    // }

    // Process renames/moves
    if (changesByType.renamed.length > 0 && this.config.handleRenames) {
      this.logger.debug(`Processing ${changesByType.renamed.length} renames`);
      
      for (const change of changesByType.renamed) {
        try {
          await this.handleFileRename(change);
          changesSummary.renamed++;
        } catch (error) {
          this.logger.error(`Error renaming file ${change.path}:`, error);
          if (!this.config.skipErrorFiles) throw error;
          errors.push({
            file: change.path,
            error: error instanceof Error ? error.message : String(error),
            stage: 'storage',
            timestamp: new Date(),
          });
        }
      }
    }

    // Process additions and modifications
    const filesToIndex = [
      ...changesByType.added,
      ...changesByType.modified,
    ];

    if (filesToIndex.length > 0) {
      this.logger.debug(`Processing ${filesToIndex.length} file updates`);
      
      // Use FileIndexer for actual indexing
      const indexingResult = await this.fileIndexer.indexFiles(
        filesToIndex.map(change => change.path)
      );

      totalChunks += indexingResult.totalChunks;
      errors.push(...indexingResult.errors);
      skippedFiles.push(...indexingResult.skippedFiles);

      // Count changes by type
      for (const change of filesToIndex) {
        if (change.status === 'added') {
          changesSummary.added++;
        } else if (change.status === 'modified') {
          changesSummary.modified++;
        }
      }
    }

    const versionInfo = await this.versionTracker.loadVersionInfo();

    return {
      success: errors.length === 0 || (this.config.skipErrorFiles ?? true),
      processedFiles: changesSummary.added + changesSummary.modified,
      totalChunks,
      errors,
      processingTime: 0, // Will be set by caller
      skippedFiles,
      changesSummary,
      versionInfo: versionInfo || {
        lastIndexedSHA: '',
        indexedAt: new Date(),
        fileHashes: new Map(),
        totalDocuments: 0,
        totalChunks: 0,
      },
      fullReindexTriggered: false,
    };
  }

  // TODO: Implement deletion logic based on metadata
  /**
   * Handle file deletion from vector database
   */
  // private async handleFileDeletion(_filePath: string): Promise<void> {
    // this.logger.debug(`Deleting chunks for file: ${filePath}`);

    // try {
    //   // Query for chunks from this file
    //   const existingChunks = await this.vectorDb.query(undefined, {
    //     limit: 1000,
    //     includeMetadata: true,
    //   });

    //   const chunksToDelete = existingChunks.results
    //     .filter(result => result.metadata.filePath === filePath)
    //     .map(result => result.id);

    //   if (chunksToDelete.length > 0) {
    //     // Delete in batches if needed
    //     const batchSize = this.config.batchDeleteSize || 50;
        
    //     for (let i = 0; i < chunksToDelete.length; i += batchSize) {
    //       const batch = chunksToDelete.slice(i, i + batchSize);
    //       await this.vectorDb.delete(batch);
    //     }

    //     this.logger.debug(
    //       `Deleted ${chunksToDelete.length} chunks for file: ${filePath}`
    //     );
    //   }
    // } catch (error) {
    //   this.logger.error(`Error deleting chunks for ${filePath}:`, error);
    //   throw error;
    // }
  // }

  /**
   * Handle file rename/move operations
   */
  private async handleFileRename(change: GitFileChange): Promise<void> {
    // For now, treat renames as delete + add
    // In a more sophisticated implementation, we could update metadata in place
    
    if (change.oldPath) {
      this.logger.debug(`Handling rename: ${change.oldPath} -> ${change.path}`);
      
      // TODO: Delete old chunks
      // await this.handleFileDeletion(change.oldPath);
      
      // The new file will be indexed as an "added" file
      this.logger.debug(`Rename handled, new file will be indexed: ${change.path}`);
    }
  }

  /**
   * Group changes by type for efficient processing
   */
  private groupChangesByType(changes: GitFileChange[]): {
    added: GitFileChange[];
    modified: GitFileChange[];
    deleted: GitFileChange[];
    renamed: GitFileChange[];
  } {
    const grouped = {
      added: [] as GitFileChange[],
      modified: [] as GitFileChange[],
      deleted: [] as GitFileChange[],
      renamed: [] as GitFileChange[],
    };

    for (const change of changes) {
      switch (change.status) {
        case 'added':
          grouped.added.push(change);
          break;
        case 'modified':
          grouped.modified.push(change);
          break;
        case 'deleted':
          grouped.deleted.push(change);
          break;
        case 'renamed':
          grouped.renamed.push(change);
          break;
      }
    }

    return grouped;
  }

  /**
   * Check if incremental indexing is possible
   */
  private async canPerformIncremental(): Promise<boolean> {
    try {
      const versionInfo = await this.versionTracker.loadVersionInfo();
      
      // No version info means we need full reindex
      if (!versionInfo) {
        this.logger.debug('No version info found, full reindex required');
        return false;
      }

      // Check if repository is in a consistent state
      const repoStatus = await this.obsidianManager.getRepositoryStatus();
      
      if (!repoStatus.isGitRepo) {
        this.logger.debug('Not a git repository, using file-based change detection');
        return true; // Can still do incremental based on file timestamps
      }

      // For git repositories, check if we can track changes
      return repoStatus.currentSHA !== undefined;

    } catch (error) {
      this.logger.warn('Error checking incremental capability:', error);
      return false;
    }
  }

  /**
   * Perform full reindex as fallback
   */
  private async performFullReindex(): Promise<IncrementalResult> {
    this.logger.info('Performing full reindex');

    const result = await this.fileIndexer.indexAllFiles();
    
    // Update version tracking
    await this.updateVersionAfterIndexing(result);

    // Get final version info
    const versionInfo = await this.versionTracker.loadVersionInfo();

    return {
      ...result,
      changesSummary: {
        added: result.processedFiles,
        modified: 0,
        deleted: 0,
        renamed: 0,
      },
      versionInfo: versionInfo || {
        lastIndexedSHA: '',
        indexedAt: new Date(),
        fileHashes: new Map(),
        totalDocuments: 0,
        totalChunks: 0,
      },
      fullReindexTriggered: true,
    };
  }

  /**
   * Create result for when no changes are detected
   */
  private async createNoChangesResult(): Promise<IncrementalResult> {
    const versionInfo = await this.versionTracker.loadVersionInfo();

    return {
      success: true,
      processedFiles: 0,
      totalChunks: 0,
      errors: [],
      processingTime: 0,
      skippedFiles: [],
      changesSummary: {
        added: 0,
        modified: 0,
        deleted: 0,
        renamed: 0,
      },
      versionInfo: versionInfo || {
        lastIndexedSHA: '',
        indexedAt: new Date(),
        fileHashes: new Map(),
        totalDocuments: 0,
        totalChunks: 0,
      },
      fullReindexTriggered: false,
    };
  }

  /**
   * Update version tracking after successful indexing
   */
  private async updateVersionAfterIndexing(result: IndexingResult): Promise<void> {
    try {
      await this.versionTracker.updateVersionAfterIndexing(
        result.processedFiles,
        result.totalChunks,
        new Map() // Empty file hashes map for now
      );

      this.logger.debug('Version info updated after indexing');
    } catch (error) {
      this.logger.error('Error updating version info:', error);
      // Don't throw - indexing was successful
    }
  }

  /**
   * Get indexing status and recommendations
   */
  async getIndexingStatus(): Promise<{
    needsIndexing: boolean;
    recommendation: 'none' | 'incremental' | 'full';
    changeCount: number;
    lastIndexed?: Date;
    reason: string;
  }> {
    try {
      const versionInfo = await this.versionTracker.loadVersionInfo();
      
      if (!versionInfo) {
        return {
          needsIndexing: true,
          recommendation: 'full',
          changeCount: 0,
          reason: 'No previous indexing found',
        };
      }

      const changesResult = await this.obsidianManager.getChangedFiles();
      
      if (changesResult.changes.length === 0) {
        return {
          needsIndexing: false,
          recommendation: 'none',
          changeCount: 0,
          lastIndexed: versionInfo.indexedAt,
          reason: 'No changes detected',
        };
      }

      const recommendation = changesResult.changes.length > (this.config.maxChangedFiles || 100)
        ? 'full'
        : 'incremental';

      return {
        needsIndexing: true,
        recommendation,
        changeCount: changesResult.changes.length,
        lastIndexed: versionInfo.indexedAt,
        reason: `${changesResult.changes.length} files changed`,
      };

    } catch (error) {
      this.logger.error('Error getting indexing status:', error);
      return {
        needsIndexing: true,
        recommendation: 'full',
        changeCount: 0,
        reason: 'Error checking status',
      };
    }
  }

  /**
   * Force a full reindex on next operation
   */
  setForceFullReindex(force: boolean): void {
    this.config.forceFullReindex = force;
    this.logger.info(`Force full reindex set to: ${force}`);
  }

  /**
   * Update incremental indexing configuration
   */
  updateConfig(newConfig: Partial<IncrementalConfig>): void {
    Object.assign(this.config, newConfig);
    
    // Also update the underlying FileIndexer config
    this.fileIndexer.updateConfig(newConfig);
    
    this.logger.info('Incremental indexing configuration updated');
  }
}