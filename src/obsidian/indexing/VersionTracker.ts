import { promises as fs } from 'fs';
import path from 'path';
import { GitUtils } from '../../utils/GitUtils';
import { Logger } from '../../utils/Logger';

/**
 * Version tracking information for git-based indexing
 */
export interface VersionInfo {
  lastIndexedSHA: string;
  indexedAt: Date;
  fileHashes: Map<string, string>; // file path -> content hash
  totalDocuments: number;
  totalChunks: number;
}

/**
 * File change information
 */
export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string; // For renamed files
  contentHash: string;
}

/**
 * Git-based version tracking for intelligent reindexing
 */
export class VersionTracker {
  private readonly repoPath: string;
  private readonly versionFilePath: string;
  private readonly logger: Logger;
  private gitUtils: GitUtils;

  constructor(repoPath: string, databaseDir?: string, logger?: Logger) {
    this.repoPath = repoPath;
    // Store version file in database directory if provided, otherwise fall back to repo root
    const versionDir = databaseDir || repoPath;
    this.versionFilePath = path.join(versionDir, 'netherdb-version.json');
    this.logger = logger || new Logger('VersionTracker');
    this.gitUtils = new GitUtils(repoPath);
  }

  /**
   * Check if version information exists
   */
  async hasVersionInfo(): Promise<boolean> {
    try {
      await fs.access(this.versionFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get version information (alias for loadVersionInfo for CLI compatibility)
   */
  async getVersionInfo(): Promise<VersionInfo> {
    const info = await this.loadVersionInfo();
    if (!info) {
      throw new Error('No version information available');
    }
    return info;
  }

  /**
   * Load version information from disk
   */
  async loadVersionInfo(): Promise<VersionInfo | null> {
    try {
      const exists = await fs.access(this.versionFilePath).then(() => true).catch(() => false);
      if (!exists) {
        return null;
      }

      const content = await fs.readFile(this.versionFilePath, 'utf-8');
      const data = JSON.parse(content);
      
      return {
        lastIndexedSHA: data.lastIndexedSHA,
        indexedAt: new Date(data.indexedAt),
        fileHashes: new Map(data.fileHashes || []),
        totalDocuments: data.totalDocuments || 0,
        totalChunks: data.totalChunks || 0,
      };
    } catch (error) {
      this.logger.error('Failed to load version info:', error);
      return null;
    }
  }

  /**
   * Save version information to disk
   */
  async saveVersionInfo(versionInfo: VersionInfo): Promise<void> {
    try {
      const data = {
        lastIndexedSHA: versionInfo.lastIndexedSHA,
        indexedAt: versionInfo.indexedAt.toISOString(),
        fileHashes: Array.from(versionInfo.fileHashes.entries()),
        totalDocuments: versionInfo.totalDocuments,
        totalChunks: versionInfo.totalChunks,
      };

      await fs.writeFile(this.versionFilePath, JSON.stringify(data, null, 2), 'utf-8');
      this.logger.debug('Version info saved successfully');
    } catch (error) {
      this.logger.error('Failed to save version info:', error);
      throw error;
    }
  }

  /**
   * Check if reindexing is needed by comparing current HEAD with last indexed SHA
   */
  async needsReindexing(): Promise<boolean> {
    try {
      const versionInfo = await this.loadVersionInfo();
      if (!versionInfo) {
        this.logger.info('No version info found, full indexing needed');
        return true;
      }

      const currentSHA = await this.gitUtils.getCurrentSHA();
      if (currentSHA !== versionInfo.lastIndexedSHA) {
        this.logger.info(`Version mismatch: current=${currentSHA}, indexed=${versionInfo.lastIndexedSHA}`);
        return true;
      }

      this.logger.debug('Version up to date, no reindexing needed');
      return false;
    } catch (error) {
      this.logger.error('Error checking reindexing status:', error);
      return true; // Default to reindexing on error
    }
  }

  /**
   * Get files that have changed since last indexing
   */
  async getChangedFiles(fileExtensions: string[] = ['.md']): Promise<FileChange[]> {
    try {
      const versionInfo = await this.loadVersionInfo();
      if (!versionInfo) {
        // No version info, treat all markdown files as new
        return this.getAllMarkdownFiles(fileExtensions);
      }

      const changes: FileChange[] = [];
      const currentSHA = await this.gitUtils.getCurrentSHA();
      
      if (currentSHA === versionInfo.lastIndexedSHA) {
        // Check for uncommitted changes
        const uncommittedChanges = await this.gitUtils.getUncommittedChanges();
        for (const change of uncommittedChanges) {
          if (this.shouldIncludeFile(change.path, fileExtensions)) {
            const contentHash = await this.getFileHash(change.path);
            const fileChange: FileChange = {
              path: change.path,
              status: change.status,
              contentHash,
            };
            if (change.oldPath) {
              fileChange.oldPath = change.oldPath;
            }
            changes.push(fileChange);
          }
        }
        return changes;
      }

      // Get changes between commits
      const gitChanges = await this.gitUtils.getChangesBetweenCommits(
        versionInfo.lastIndexedSHA,
        currentSHA
      );

      for (const change of gitChanges) {
        if (this.shouldIncludeFile(change.path, fileExtensions)) {
          let contentHash = '';
          if (change.status !== 'deleted') {
            try {
              contentHash = await this.getFileHash(change.path);
            } catch (error) {
              this.logger.warn(`Could not get hash for ${change.path}:`, error);
              contentHash = '';
            }
          }

          const fileChange: FileChange = {
            path: change.path,
            status: change.status,
            contentHash,
          };
          if (change.oldPath) {
            fileChange.oldPath = change.oldPath;
          }
          changes.push(fileChange);
        }
      }

      return changes;
    } catch (error) {
      this.logger.error('Error getting changed files:', error);
      throw error;
    }
  }

  /**
   * Get all markdown files for initial indexing
   */
  private async getAllMarkdownFiles(fileExtensions: string[]): Promise<FileChange[]> {
    const files = await this.findMarkdownFiles(this.repoPath, fileExtensions);
    const changes: FileChange[] = [];

    for (const filePath of files) {
      try {
        const contentHash = await this.getFileHash(filePath);
        changes.push({
          path: filePath,
          status: 'added',
          contentHash,
        });
      } catch (error) {
        this.logger.warn(`Could not process file ${filePath}:`, error);
      }
    }

    return changes;
  }

  /**
   * Recursively find markdown files in directory
   */
  private async findMarkdownFiles(dir: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        // Skip hidden directories and common ignore patterns
        if (!item.name.startsWith('.') && 
            !['node_modules', 'dist', 'build'].includes(item.name)) {
          const subFiles = await this.findMarkdownFiles(fullPath, extensions);
          files.push(...subFiles);
        }
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (extensions.includes(ext)) {
          const relativePath = path.relative(this.repoPath, fullPath);
          files.push(relativePath);
        }
      }
    }

    return files;
  }

  /**
   * Check if file should be included based on extensions
   */
  private shouldIncludeFile(filePath: string, extensions: string[]): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return extensions.includes(ext);
  }

  /**
   * Get content hash for a file
   */
  private async getFileHash(relativePath: string): Promise<string> {
    const fullPath = path.join(this.repoPath, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return this.gitUtils.getContentHash(content);
  }

  /**
   * Update version info after successful indexing
   */
  /**
   * Update version info after indexing (CLI convenience method)
   */
  async updateVersionInfo(): Promise<void> {
    try {
      const currentSHA = await this.gitUtils.getCurrentSHA();
      const markdownFiles = await this.getAllMarkdownFiles(['.md']);
      
      const fileHashes = new Map<string, string>();
      for (const file of markdownFiles) {
        fileHashes.set(file.path, file.contentHash);
      }

      const versionInfo: VersionInfo = {
        lastIndexedSHA: currentSHA,
        indexedAt: new Date(),
        fileHashes,
        totalDocuments: 0, // Will be updated by database
        totalChunks: 0, // Will be updated by database
      };

      await this.saveVersionInfo(versionInfo);
    } catch (error) {
      this.logger.error('Failed to update version info:', error);
      throw error;
    }
  }

  async updateVersionAfterIndexing(
    totalDocuments: number,
    totalChunks: number,
    processedFiles: Map<string, string>
  ): Promise<void> {
    try {
      const currentSHA = await this.gitUtils.getCurrentSHA();
      const versionInfo: VersionInfo = {
        lastIndexedSHA: currentSHA,
        indexedAt: new Date(),
        fileHashes: processedFiles,
        totalDocuments,
        totalChunks,
      };

      await this.saveVersionInfo(versionInfo);
      this.logger.info(`Version updated: SHA=${currentSHA}, docs=${totalDocuments}, chunks=${totalChunks}`);
    } catch (error) {
      this.logger.error('Failed to update version after indexing:', error);
      throw error;
    }
  }

  /**
   * Get current repository status
   */
  async getRepositoryStatus(): Promise<{
    currentSHA: string;
    isClean: boolean;
    lastIndexedSHA?: string;
    indexedAt?: Date;
    needsReindexing: boolean;
  }> {
    try {
      const currentSHA = await this.gitUtils.getCurrentSHA();
      const isClean = await this.gitUtils.isRepositoryClean();
      const versionInfo = await this.loadVersionInfo();
      const needsReindexing = await this.needsReindexing();

      const result: {
        currentSHA: string;
        isClean: boolean;
        lastIndexedSHA?: string;
        indexedAt?: Date;
        needsReindexing: boolean;
      } = {
        currentSHA,
        isClean,
        needsReindexing,
      };
      
      if (versionInfo?.lastIndexedSHA) {
        result.lastIndexedSHA = versionInfo.lastIndexedSHA;
      }
      if (versionInfo?.indexedAt) {
        result.indexedAt = versionInfo.indexedAt;
      }
      
      return result;
    } catch (error) {
      this.logger.error('Error getting repository status:', error);
      throw error;
    }
  }
}