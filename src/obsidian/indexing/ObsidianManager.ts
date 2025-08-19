import { promises as fs } from 'fs';
import path from 'path';
import { minimatch } from 'minimatch';
import { VersionTracker, VersionInfo, FileChange } from './VersionTracker';
import { GitUtils } from '../../utils/GitUtils';
import { Logger } from '../../utils/Logger';

/**
 * Obsidian file metadata
 */
export interface ObsidianFile {
  path: string;
  absolutePath: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: Date;
  contentHash: string;
  isMarkdown: boolean;
}

/**
 * Obsidian discovery options
 */
export interface DiscoveryOptions {
  fileExtensions: string[];
  includeHidden: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
  ignorePaths?: string[]; // Legacy support
  maxFileSize?: number; // bytes
}

/**
 * Obsidian vault statistics
 */
export interface VaultStats {
  totalFiles: number;
  markdownFiles: number;
  totalSize: number;
  lastScanned: Date;
  filesByExtension: Map<string, number>;
}

/**
 * Main manager for Obsidian vault operations
 * Handles file discovery, version tracking, and git integration
 */
export class ObsidianManager {
  private readonly vaultPath: string;
  private readonly versionTracker: VersionTracker;
  private readonly gitUtils: GitUtils;
  private readonly logger: Logger;

  constructor(vaultPath: string, databaseDir?: string, logger?: Logger) {
    this.vaultPath = vaultPath;
    this.logger = logger || new Logger('ObsidianManager');
    this.versionTracker = new VersionTracker(vaultPath, databaseDir, this.logger);
    this.gitUtils = new GitUtils(vaultPath, this.logger);
  }

  /**
   * Initialize the manager and validate the vault
   */
  async initialize(): Promise<void> {
    try {
      // Check if vault path exists
      const vaultStat = await fs.stat(this.vaultPath);
      if (!vaultStat.isDirectory()) {
        throw new Error(`Vault path is not a directory: ${this.vaultPath}`);
      }

      // Check if it's a git repository
      const isGitRepo = await this.gitUtils.isGitRepository();
      if (!isGitRepo) {
        this.logger.warn('Vault is not a git repository - version tracking disabled');
      } else {
        this.logger.info('Git repository detected - version tracking enabled');
      }

      this.logger.info(`ObsidianManager initialized for vault: ${this.vaultPath}`);
    } catch (error) {
      this.logger.error('Failed to initialize ObsidianManager:', error);
      throw error;
    }
  }

  /**
   * Discover all files in the vault based on options
   */
  async discoverFiles(options: Partial<DiscoveryOptions> = {}): Promise<ObsidianFile[]> {
    const defaultOptions: DiscoveryOptions = {
      fileExtensions: ['.md', '.markdown'],
      includeHidden: false,
      includePatterns: ['**/*.md'],
      excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '.obsidian/**'],
      ignorePaths: ['node_modules', '.git', 'dist', 'build', '.obsidian'], // Legacy fallback
      maxFileSize: 10 * 1024 * 1024, // 10MB
    };

    const opts = { ...defaultOptions, ...options };
    this.logger.debug('Starting file discovery with options:', opts);

    const files = await this.scanDirectory(this.vaultPath, opts);
    this.logger.info(`Discovered ${files.length} files`);
    
    return files;
  }

  /**
   * Get files that have changed since last indexing
   */
  async getChangedFiles(options: Partial<DiscoveryOptions> = {}): Promise<{
    changes: FileChange[];
    needsFullReindex: boolean;
  }> {
    try {
      const needsReindex = await this.versionTracker.needsReindexing();
      
      if (needsReindex) {
        // Check if we have version info to determine if this is incremental or full
        const versionInfo = await this.versionTracker.loadVersionInfo();
        if (!versionInfo) {
          // No version info - full reindex needed
          this.logger.info('No version information found, performing full discovery');
          const allFiles = await this.discoverFiles(options);
          const changes: FileChange[] = allFiles.map(file => ({
            path: file.path,
            status: 'added' as const,
            contentHash: file.contentHash,
          }));
          
          return {
            changes,
            needsFullReindex: true,
          };
        } else {
          // Incremental update
          this.logger.info('Performing incremental change detection');
          const changes = await this.versionTracker.getChangedFiles(
            options.fileExtensions || ['.md', '.markdown']
          );
          
          return {
            changes,
            needsFullReindex: false,
          };
        }
      }

      // No changes needed
      return {
        changes: [],
        needsFullReindex: false,
      };
    } catch (error) {
      this.logger.error('Error detecting changed files:', error);
      // On error, fall back to full reindex
      const allFiles = await this.discoverFiles(options);
      const changes: FileChange[] = allFiles.map(file => ({
        path: file.path,
        status: 'added' as const,
        contentHash: file.contentHash,
      }));
      
      return {
        changes,
        needsFullReindex: true,
      };
    }
  }

  /**
   * Get vault statistics
   */
  async getVaultStats(options: Partial<DiscoveryOptions> = {}): Promise<VaultStats> {
    const files = await this.discoverFiles(options);
    const filesByExtension = new Map<string, number>();
    
    let totalSize = 0;
    let markdownFiles = 0;

    for (const file of files) {
      totalSize += file.size;
      
      if (file.isMarkdown) {
        markdownFiles++;
      }

      const ext = file.extension;
      filesByExtension.set(ext, (filesByExtension.get(ext) || 0) + 1);
    }

    return {
      totalFiles: files.length,
      markdownFiles,
      totalSize,
      lastScanned: new Date(),
      filesByExtension,
    };
  }

  /**
   * Update version information after successful indexing
   */
  async updateVersionAfterIndexing(
    totalDocuments: number,
    totalChunks: number,
    processedFiles: Map<string, string>
  ): Promise<void> {
    await this.versionTracker.updateVersionAfterIndexing(
      totalDocuments,
      totalChunks,
      processedFiles
    );
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
    isGitRepo: boolean;
  }> {
    const isGitRepo = await this.gitUtils.isGitRepository();
    
    if (!isGitRepo) {
      return {
        currentSHA: '',
        isClean: true,
        needsReindexing: true,
        isGitRepo: false,
      };
    }

    const status = await this.versionTracker.getRepositoryStatus();
    return {
      ...status,
      isGitRepo: true,
    };
  }

  /**
   * Get version information
   */
  async getVersionInfo(): Promise<VersionInfo | null> {
    return this.versionTracker.loadVersionInfo();
  }

  /**
   * Find all markdown files in the vault (CLI convenience method)
   */
  async findMarkdownFiles(): Promise<string[]> {
    const files = await this.discoverFiles({
      fileExtensions: ['.md'],
      includeHidden: false,
      ignorePaths: ['.git', 'node_modules', '.obsidian']
    });
    return files.map(file => file.path);
  }

  /**
   * Find all files in the vault (CLI convenience method)
   */
  async findAllFiles(): Promise<string[]> {
    const files = await this.discoverFiles({
      fileExtensions: ['.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg'],
      includeHidden: false,
      ignorePaths: ['.git', 'node_modules', '.obsidian']
    });
    return files.map(file => file.path);
  }

  /**
   * Check if a specific file needs reindexing
   */
  async needsFileReindexing(filePath: string): Promise<boolean> {
    try {
      const versionInfo = await this.versionTracker.loadVersionInfo();
      if (!versionInfo) {
        return true; // No version info, needs indexing
      }

      const currentHash = await this.getFileContentHash(filePath);
      const storedHash = versionInfo.fileHashes.get(filePath);
      
      return currentHash !== storedHash;
    } catch (error) {
      this.logger.warn(`Error checking file reindexing status for ${filePath}:`, error);
      return true; // On error, assume reindexing is needed
    }
  }

  /**
   * Get the absolute path for a relative path
   */
  getAbsolutePath(relativePath: string): string {
    return path.resolve(this.vaultPath, relativePath);
  }

  /**
   * Get the relative path for an absolute path
   */
  getRelativePath(absolutePath: string): string {
    return path.relative(this.vaultPath, absolutePath);
  }

  /**
   * Check if a path is within the vault
   */
  isWithinVault(filePath: string): boolean {
    const relativePath = path.relative(this.vaultPath, filePath);
    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  }

  // Private methods

  /**
   * Recursively scan directory for files
   */
  private async scanDirectory(
    dirPath: string,
    options: DiscoveryOptions,
    relativeTo: string = this.vaultPath
  ): Promise<ObsidianFile[]> {
    const files: ObsidianFile[] = [];
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        const relativePath = path.relative(relativeTo, itemPath);

        // Skip hidden files/directories if not included
        if (!options.includeHidden && item.name.startsWith('.')) {
          continue;
        }

        if (item.isDirectory()) {
          // For directories, only check exclude patterns (never include patterns)
          if (!this.shouldIncludeDirectory(relativePath, options)) {
            continue;
          }
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(itemPath, options, relativeTo);
          files.push(...subFiles);
        } else if (item.isFile()) {
          // For files, check full include/exclude logic
          if (!this.shouldIncludePath(relativePath, options)) {
            continue;
          }
          // Process file if it matches criteria
          const fileInfo = await this.processFile(itemPath, relativePath, options);
          if (fileInfo) {
            files.push(fileInfo);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Error scanning directory ${dirPath}:`, error);
    }

    return files;
  }

  /**
   * Process a single file and create file info
   */
  private async processFile(
    absolutePath: string,
    relativePath: string,
    options: DiscoveryOptions
  ): Promise<ObsidianFile | null> {
    try {
      const stat = await fs.stat(absolutePath);
      const extension = path.extname(relativePath).toLowerCase();

      // Check file extension
      if (!options.fileExtensions.includes(extension)) {
        return null;
      }

      // Check file size
      if (options.maxFileSize && stat.size > options.maxFileSize) {
        this.logger.warn(`Skipping large file: ${relativePath} (${stat.size} bytes)`);
        return null;
      }

      // Get content hash
      const contentHash = await this.getFileContentHash(absolutePath);

      return {
        path: relativePath,
        absolutePath,
        name: path.basename(relativePath, extension),
        extension,
        size: stat.size,
        modifiedAt: stat.mtime,
        contentHash,
        isMarkdown: ['.md', '.markdown'].includes(extension),
      };
    } catch (error) {
      this.logger.warn(`Error processing file ${relativePath}:`, error);
      return null;
    }
  }

  /**
   * Get content hash for a file
   */
  private async getFileContentHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return this.gitUtils.getContentHash(content);
  }

  /**
   * Check if a directory should be included based on include/exclude patterns
   * Uses a more permissive approach: if include patterns exist, check if the directory
   * or any potential subdirectory could match the patterns
   */
  private shouldIncludeDirectory(relativePath: string, options: DiscoveryOptions): boolean {
    const normalizedPath = relativePath.replace(/\\/g, '/'); // Normalize path separators
    
    // Check exclude patterns first (they take precedence)
    if (options.excludePatterns) {
      for (const pattern of options.excludePatterns) {
        if (minimatch(normalizedPath, pattern)) {
          return false;
        }
      }
    }
    
    // Legacy ignore paths support
    if (options.ignorePaths) {
      for (const ignorePath of options.ignorePaths) {
        if (normalizedPath.includes(ignorePath)) {
          return false;
        }
      }
    }
    
    // Check include patterns (if specified)
    if (options.includePatterns && options.includePatterns.length > 0) {
      for (const pattern of options.includePatterns) {
        // Direct match for directory patterns like "Salesforce/**"
        if (minimatch(normalizedPath, pattern)) {
          return true;
        }
        
        // Check if this directory could be a parent of matching files/directories
        // For patterns like "**/*.md", "Salesforce/" should be included because
        // it could contain matching files in subdirectories
        if (this.couldContainMatches(normalizedPath, pattern)) {
          return true;
        }
      }
      return false; // If include patterns are specified but none match
    }
    
    return true; // Include by default if no include patterns specified
  }

  /**
   * Check if a directory could potentially contain files/subdirectories that match a pattern
   */
  private couldContainMatches(directoryPath: string, pattern: string): boolean {
    // If pattern starts with "**", any directory could contain matches
    if (pattern.startsWith('**/')) {
      return true;
    }
    
    // If pattern contains directory components, check if this directory is a prefix
    const patternParts = pattern.split('/');
    const directoryParts = directoryPath.split('/').filter(p => p.length > 0);
    
    // Check if the directory path is a prefix of the pattern path
    for (let i = 0; i < Math.min(directoryParts.length, patternParts.length); i++) {
      const dirPart = directoryParts[i];
      const patternPart = patternParts[i];
      
      // Skip if either part is undefined
      if (!dirPart || !patternPart) {
        continue;
      }
      
      // If pattern part is a wildcard, it matches
      if (patternPart === '*' || patternPart === '**') {
        return true;
      }
      
      // If parts don't match exactly, check if pattern part could match
      if (dirPart !== patternPart && !minimatch(dirPart, patternPart)) {
        return false;
      }
    }
    
    return true; // Directory could be a prefix of the pattern
  }

  /**
   * Check if a file path should be included based on include/exclude patterns
   */
  private shouldIncludePath(relativePath: string, options: DiscoveryOptions): boolean {
    const normalizedPath = relativePath.replace(/\\/g, '/'); // Normalize path separators
    
    // Check exclude patterns first (they take precedence)
    if (options.excludePatterns) {
      for (const pattern of options.excludePatterns) {
        if (minimatch(normalizedPath, pattern)) {
          return false;
        }
      }
    }
    
    // Legacy ignore paths support
    if (options.ignorePaths) {
      for (const ignorePath of options.ignorePaths) {
        if (normalizedPath.includes(ignorePath)) {
          return false;
        }
      }
    }
    
    // Check include patterns (if specified)
    if (options.includePatterns && options.includePatterns.length > 0) {
      for (const pattern of options.includePatterns) {
        if (minimatch(normalizedPath, pattern)) {
          return true;
        }
      }
      return false; // If include patterns are specified but none match
    }
    
    return true; // Include by default if no include patterns specified
  }
}