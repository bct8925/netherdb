import { ObsidianManager, DiscoveryOptions } from '../../src/obsidian/indexing/ObsidianManager';
import { VersionTracker } from '../../src/obsidian/indexing/VersionTracker';
import { GitUtils } from '../../src/utils/GitUtils';
import { Logger } from '../../src/utils/Logger';
import { promises as fs } from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('../../src/obsidian/indexing/VersionTracker');
jest.mock('../../src/utils/GitUtils');
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readdir: jest.fn(),
    readFile: jest.fn(),
  },
}));

const MockedVersionTracker = VersionTracker as jest.MockedClass<typeof VersionTracker>;
const MockedGitUtils = GitUtils as jest.MockedClass<typeof GitUtils>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ObsidianManager', () => {
  let obsidianManager: ObsidianManager;
  let mockVersionTracker: jest.Mocked<VersionTracker>;
  let mockGitUtils: jest.Mocked<GitUtils>;
  let mockLogger: jest.Mocked<Logger>;
  const testVaultPath = '/test/vault';

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    mockVersionTracker = {
      needsReindexing: jest.fn(),
      loadVersionInfo: jest.fn(),
      getChangedFiles: jest.fn(),
      updateVersionAfterIndexing: jest.fn(),
      getRepositoryStatus: jest.fn(),
    } as any;

    mockGitUtils = {
      isGitRepository: jest.fn(),
      getContentHash: jest.fn(),
    } as any;

    MockedVersionTracker.mockImplementation(() => mockVersionTracker);
    MockedGitUtils.mockImplementation(() => mockGitUtils);
    
    obsidianManager = new ObsidianManager(testVaultPath, undefined, mockLogger);
  });

  describe('initialize', () => {
    it('should initialize successfully for valid vault', async () => {
      mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockGitUtils.isGitRepository.mockResolvedValue(true);

      await obsidianManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Git repository detected - version tracking enabled');
      expect(mockLogger.info).toHaveBeenCalledWith(`ObsidianManager initialized for vault: ${testVaultPath}`);
    });

    it('should handle non-git repositories gracefully', async () => {
      mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockGitUtils.isGitRepository.mockResolvedValue(false);

      await obsidianManager.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('Vault is not a git repository - version tracking disabled');
    });

    it('should throw error for invalid vault path', async () => {
      mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);

      await expect(obsidianManager.initialize()).rejects.toThrow(
        `Vault path is not a directory: ${testVaultPath}`
      );
    });

    it('should handle stat errors', async () => {
      mockedFs.stat.mockRejectedValue(new Error('Path not found'));

      await expect(obsidianManager.initialize()).rejects.toThrow('Path not found');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize ObsidianManager:',
        expect.any(Error)
      );
    });
  });

  describe('discoverFiles', () => {
    beforeEach(() => {
      // Mock file system structure
      mockedFs.readdir.mockImplementation(async (dirPath) => {
        const dir = dirPath as string;
        if (dir === testVaultPath) {
          return [
            { name: 'note1.md', isDirectory: () => false, isFile: () => true },
            { name: 'readme.txt', isDirectory: () => false, isFile: () => true },
            { name: 'subfolder', isDirectory: () => true, isFile: () => false },
            { name: '.hidden', isDirectory: () => true, isFile: () => false },
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
          ] as any;
        } else if (dir === path.join(testVaultPath, 'subfolder')) {
          return [
            { name: 'subnote.md', isDirectory: () => false, isFile: () => true },
            { name: 'large.md', isDirectory: () => false, isFile: () => true },
          ] as any;
        } else if (dir === path.join(testVaultPath, '.hidden')) {
          return [
            { name: 'hidden.md', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      // Mock file stats
      mockedFs.stat.mockImplementation(async (filePath) => {
        const file = filePath as string;
        if (file.includes('large.md')) {
          return { size: 15 * 1024 * 1024, mtime: new Date() } as any; // 15MB
        }
        return { size: 1024, mtime: new Date('2023-01-01') } as any;
      });

      // Mock file content reading
      mockedFs.readFile.mockResolvedValue('# Test content');
      mockGitUtils.getContentHash.mockReturnValue('hash123');
    });

    it('should discover markdown files with default options', async () => {
      const files = await obsidianManager.discoverFiles();

      expect(files).toHaveLength(2); // note1.md, subnote.md
      expect(files.every(f => f.extension === '.md')).toBe(true);
      
      const fileNames = files.map(f => f.name);
      expect(fileNames).toContain('note1');
      expect(fileNames).toContain('subnote');
    });

    it('should respect file extension filters', async () => {
      const options: Partial<DiscoveryOptions> = {
        fileExtensions: ['.md'], // Only .md, not .markdown
      };

      const files = await obsidianManager.discoverFiles(options);

      expect(files).toHaveLength(2); // note1.md, subnote.md
      expect(files.every(f => f.extension === '.md')).toBe(true);
    });

    it('should include hidden files when requested', async () => {
      const options: Partial<DiscoveryOptions> = {
        includeHidden: true,
        includePatterns: ['**/*.md', '.*/**/*.md'], // Include both regular and hidden directory patterns
      };

      const files = await obsidianManager.discoverFiles(options);

      const hiddenFile = files.find(f => f.path.includes('hidden.md'));
      expect(hiddenFile).toBeDefined();
    });

    it('should respect ignore paths', async () => {
      const options: Partial<DiscoveryOptions> = {
        ignorePaths: ['subfolder'],
      };

      const files = await obsidianManager.discoverFiles(options);

      const subfolderFiles = files.filter(f => f.path.includes('subfolder'));
      expect(subfolderFiles).toHaveLength(0);
    });

    it('should respect max file size limit', async () => {
      const options: Partial<DiscoveryOptions> = {
        maxFileSize: 10 * 1024 * 1024, // 10MB limit
      };

      const files = await obsidianManager.discoverFiles(options);

      // large.md (15MB) should be excluded
      const largeFile = files.find(f => f.name === 'large');
      expect(largeFile).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping large file')
      );
    });

    it('should create correct ObsidianFile objects', async () => {
      const files = await obsidianManager.discoverFiles();
      const note1 = files.find(f => f.name === 'note1');

      expect(note1).toEqual({
        path: 'note1.md',
        absolutePath: path.join(testVaultPath, 'note1.md'),
        name: 'note1',
        extension: '.md',
        size: 1024,
        modifiedAt: new Date('2023-01-01'),
        contentHash: 'hash123',
        isMarkdown: true,
      });
    });
  });

  describe('getChangedFiles', () => {
    it('should return full reindex when no version info exists', async () => {
      mockVersionTracker.needsReindexing.mockResolvedValue(true);
      mockVersionTracker.loadVersionInfo.mockResolvedValue(null);

      // Mock file discovery
      mockedFs.readdir.mockResolvedValue([
        { name: 'note1.md', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockedFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockedFs.readFile.mockResolvedValue('content');
      mockGitUtils.getContentHash.mockReturnValue('hash123');

      const result = await obsidianManager.getChangedFiles();

      expect(result.needsFullReindex).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toEqual({
        path: 'note1.md',
        status: 'added',
        contentHash: 'hash123',
      });
    });

    it('should return incremental changes when version info exists', async () => {
      mockVersionTracker.needsReindexing.mockResolvedValue(true);
      mockVersionTracker.loadVersionInfo.mockResolvedValue({
        lastIndexedSHA: 'old123',
        indexedAt: new Date(),
        fileHashes: new Map(),
        totalDocuments: 0,
        totalChunks: 0,
      });
      
      const mockChanges = [
        { path: 'note1.md', status: 'modified' as const, contentHash: 'hash123' },
        { path: 'note2.md', status: 'added' as const, contentHash: 'hash456' },
      ];
      mockVersionTracker.getChangedFiles.mockResolvedValue(mockChanges);

      const result = await obsidianManager.getChangedFiles();

      expect(result.needsFullReindex).toBe(false);
      expect(result.changes).toEqual(mockChanges);
    });

    it('should return empty changes when no reindexing needed', async () => {
      mockVersionTracker.needsReindexing.mockResolvedValue(false);

      const result = await obsidianManager.getChangedFiles();

      expect(result.needsFullReindex).toBe(false);
      expect(result.changes).toHaveLength(0);
    });

    it('should handle errors gracefully', async () => {
      mockVersionTracker.needsReindexing.mockRejectedValue(new Error('Git error'));

      // Mock fallback file discovery
      mockedFs.readdir.mockResolvedValue([
        { name: 'note1.md', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockedFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
      mockedFs.readFile.mockResolvedValue('content');
      mockGitUtils.getContentHash.mockReturnValue('hash123');

      const result = await obsidianManager.getChangedFiles();

      expect(result.needsFullReindex).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error detecting changed files:',
        expect.any(Error)
      );
    });
  });

  describe('getVaultStats', () => {
    beforeEach(() => {
      mockedFs.readdir.mockResolvedValue([
        { name: 'note1.md', isDirectory: () => false, isFile: () => true },
        { name: 'note2.md', isDirectory: () => false, isFile: () => true },
        { name: 'readme.txt', isDirectory: () => false, isFile: () => true },
      ] as any);

      mockedFs.stat.mockImplementation(async (filePath) => {
        const file = filePath as string;
        if (file.includes('note1.md')) {
          return { size: 1024, mtime: new Date() } as any;
        } else if (file.includes('note2.md')) {
          return { size: 2048, mtime: new Date() } as any;
        } else if (file.includes('readme.txt')) {
          return { size: 512, mtime: new Date() } as any;
        }
        return { size: 0, mtime: new Date() } as any;
      });

      mockedFs.readFile.mockResolvedValue('content');
      mockGitUtils.getContentHash.mockReturnValue('hash123');
    });

    it('should return correct vault statistics', async () => {
      const stats = await obsidianManager.getVaultStats();

      expect(stats).toEqual({
        totalFiles: 2, // Only .md files with default options
        markdownFiles: 2,
        totalSize: 3072, // 1024 + 2048
        lastScanned: expect.any(Date),
        filesByExtension: new Map([
          ['.md', 2],
        ]),
      });
    });

    it('should include non-markdown files when requested', async () => {
      const options: Partial<DiscoveryOptions> = {
        fileExtensions: ['.md', '.txt'],
        includePatterns: ['**/*.md', '**/*.txt'], // Include both .md and .txt patterns
      };

      const stats = await obsidianManager.getVaultStats(options);

      expect(stats.totalFiles).toBe(3);
      expect(stats.markdownFiles).toBe(2);
      expect(stats.totalSize).toBe(3584); // 1024 + 2048 + 512
      expect(stats.filesByExtension).toEqual(new Map([
        ['.md', 2],
        ['.txt', 1],
      ]));
    });
  });

  describe('utility methods', () => {
    it('should get absolute path correctly', () => {
      const result = obsidianManager.getAbsolutePath('subfolder/note.md');
      expect(result).toBe(path.resolve(testVaultPath, 'subfolder/note.md'));
    });

    it('should get relative path correctly', () => {
      const absolutePath = path.join(testVaultPath, 'subfolder', 'note.md');
      const result = obsidianManager.getRelativePath(absolutePath);
      expect(result).toBe(path.join('subfolder', 'note.md'));
    });

    it('should check if path is within vault', () => {
      const insidePath = path.join(testVaultPath, 'note.md');
      const outsidePath = '/other/vault/note.md';

      expect(obsidianManager.isWithinVault(insidePath)).toBe(true);
      expect(obsidianManager.isWithinVault(outsidePath)).toBe(false);
    });
  });

  describe('needsFileReindexing', () => {
    it('should return true when no version info exists', async () => {
      mockVersionTracker.loadVersionInfo.mockResolvedValue(null);

      const result = await obsidianManager.needsFileReindexing('note.md');

      expect(result).toBe(true);
    });

    it('should return true when file hash differs', async () => {
      mockVersionTracker.loadVersionInfo.mockResolvedValue({
        lastIndexedSHA: 'abc123',
        indexedAt: new Date(),
        fileHashes: new Map([['note.md', 'old_hash']]),
        totalDocuments: 1,
        totalChunks: 3,
      });

      mockedFs.readFile.mockResolvedValue('new content');
      mockGitUtils.getContentHash.mockReturnValue('new_hash');

      const result = await obsidianManager.needsFileReindexing('note.md');

      expect(result).toBe(true);
    });

    it('should return false when file hash matches', async () => {
      mockVersionTracker.loadVersionInfo.mockResolvedValue({
        lastIndexedSHA: 'abc123',
        indexedAt: new Date(),
        fileHashes: new Map([['note.md', 'same_hash']]),
        totalDocuments: 1,
        totalChunks: 3,
      });

      mockedFs.readFile.mockResolvedValue('content');
      mockGitUtils.getContentHash.mockReturnValue('same_hash');

      const result = await obsidianManager.needsFileReindexing('note.md');

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockVersionTracker.loadVersionInfo.mockRejectedValue(new Error('Load error'));

      const result = await obsidianManager.needsFileReindexing('note.md');

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Error checking file reindexing status for note.md:',
        expect.any(Error)
      );
    });
  });

  describe('getRepositoryStatus', () => {
    it('should return status for git repository', async () => {
      mockGitUtils.isGitRepository.mockResolvedValue(true);
      mockVersionTracker.getRepositoryStatus.mockResolvedValue({
        currentSHA: 'current123',
        isClean: true,
        lastIndexedSHA: 'old123',
        indexedAt: new Date('2023-01-01'),
        needsReindexing: true,
      });

      const result = await obsidianManager.getRepositoryStatus();

      expect(result).toEqual({
        currentSHA: 'current123',
        isClean: true,
        lastIndexedSHA: 'old123',
        indexedAt: new Date('2023-01-01'),
        needsReindexing: true,
        isGitRepo: true,
      });
    });

    it('should return default status for non-git repository', async () => {
      mockGitUtils.isGitRepository.mockResolvedValue(false);

      const result = await obsidianManager.getRepositoryStatus();

      expect(result).toEqual({
        currentSHA: '',
        isClean: true,
        needsReindexing: true,
        isGitRepo: false,
      });
    });
  });
});