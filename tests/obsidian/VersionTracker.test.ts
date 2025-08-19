import { VersionTracker, VersionInfo } from '../../src/obsidian/indexing/VersionTracker';
import { GitUtils } from '../../src/utils/GitUtils';
import { Logger } from '../../src/utils/Logger';
import { promises as fs } from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('../../src/utils/GitUtils');
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
  },
}));

const MockedGitUtils = GitUtils as jest.MockedClass<typeof GitUtils>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('VersionTracker', () => {
  let versionTracker: VersionTracker;
  let mockGitUtils: jest.Mocked<GitUtils>;
  let mockLogger: jest.Mocked<Logger>;
  const testRepoPath = '/test/repo';

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    mockGitUtils = {
      getCurrentSHA: jest.fn(),
      isRepositoryClean: jest.fn(),
      getUncommittedChanges: jest.fn(),
      getChangesBetweenCommits: jest.fn(),
      getContentHash: jest.fn(),
    } as any;

    MockedGitUtils.mockImplementation(() => mockGitUtils);
    
    versionTracker = new VersionTracker(testRepoPath, undefined, mockLogger);
  });

  describe('loadVersionInfo', () => {
    it('should return null when version file does not exist', async () => {
      mockedFs.access.mockRejectedValue(new Error('File not found'));

      const result = await versionTracker.loadVersionInfo();

      expect(result).toBeNull();
    });

    it('should load version info successfully', async () => {
      const mockVersionData = {
        lastIndexedSHA: 'abc123',
        indexedAt: '2023-01-01T00:00:00.000Z',
        fileHashes: [['file1.md', 'hash1'], ['file2.md', 'hash2']],
        totalDocuments: 2,
        totalChunks: 5,
      };

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockVersionData));

      const result = await versionTracker.loadVersionInfo();

      expect(result).toEqual({
        lastIndexedSHA: 'abc123',
        indexedAt: new Date('2023-01-01T00:00:00.000Z'),
        fileHashes: new Map([['file1.md', 'hash1'], ['file2.md', 'hash2']]),
        totalDocuments: 2,
        totalChunks: 5,
      });
    });

    it('should handle corrupted version file gracefully', async () => {
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue('invalid json');

      const result = await versionTracker.loadVersionInfo();

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to load version info:',
        expect.any(Error)
      );
    });
  });

  describe('saveVersionInfo', () => {
    it('should save version info successfully', async () => {
      const versionInfo: VersionInfo = {
        lastIndexedSHA: 'abc123',
        indexedAt: new Date('2023-01-01T00:00:00.000Z'),
        fileHashes: new Map([['file1.md', 'hash1']]),
        totalDocuments: 1,
        totalChunks: 3,
      };

      mockedFs.writeFile.mockResolvedValue(undefined);

      await versionTracker.saveVersionInfo(versionInfo);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        path.join(testRepoPath, 'netherdb-version.json'),
        expect.stringContaining('"lastIndexedSHA": "abc123"'),
        'utf-8'
      );
    });

    it('should handle write errors', async () => {
      const versionInfo: VersionInfo = {
        lastIndexedSHA: 'abc123',
        indexedAt: new Date(),
        fileHashes: new Map(),
        totalDocuments: 0,
        totalChunks: 0,
      };

      mockedFs.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(versionTracker.saveVersionInfo(versionInfo)).rejects.toThrow('Write failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save version info:',
        expect.any(Error)
      );
    });
  });

  describe('needsReindexing', () => {
    it('should return true when no version info exists', async () => {
      mockedFs.access.mockRejectedValue(new Error('File not found'));

      const result = await versionTracker.needsReindexing();

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('No version info found, full indexing needed');
    });

    it('should return true when SHA differs', async () => {
      const mockVersionData = {
        lastIndexedSHA: 'old123',
        indexedAt: '2023-01-01T00:00:00.000Z',
        fileHashes: [],
        totalDocuments: 0,
        totalChunks: 0,
      };

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockVersionData));
      mockGitUtils.getCurrentSHA.mockResolvedValue('new456');

      const result = await versionTracker.needsReindexing();

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Version mismatch: current=new456, indexed=old123'
      );
    });

    it('should return false when SHA matches', async () => {
      const mockVersionData = {
        lastIndexedSHA: 'same123',
        indexedAt: '2023-01-01T00:00:00.000Z',
        fileHashes: [],
        totalDocuments: 0,
        totalChunks: 0,
      };

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockVersionData));
      mockGitUtils.getCurrentSHA.mockResolvedValue('same123');

      const result = await versionTracker.needsReindexing();

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Version up to date, no reindexing needed');
    });
  });

  describe('getChangedFiles', () => {
    it('should return all files when no version info exists', async () => {
      mockedFs.access.mockRejectedValue(new Error('File not found'));
      
      // Mock file system structure
      mockedFs.readdir.mockImplementation(async (dir) => {
        if (dir === testRepoPath) {
          return [
            { name: 'file1.md', isDirectory: () => false, isFile: () => true },
            { name: 'subfolder', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dir === path.join(testRepoPath, 'subfolder')) {
          return [
            { name: 'file2.md', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      mockedFs.readFile.mockResolvedValue('file content');
      mockGitUtils.getContentHash.mockReturnValue('hash123');

      const result = await versionTracker.getChangedFiles(['.md']);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: 'file1.md',
        status: 'added',
        contentHash: 'hash123',
      });
      expect(result[1]).toEqual({
        path: path.join('subfolder', 'file2.md'),
        status: 'added',
        contentHash: 'hash123',
      });
    });

    it('should return git changes when SHA differs', async () => {
      const mockVersionData = {
        lastIndexedSHA: 'old123',
        indexedAt: '2023-01-01T00:00:00.000Z',
        fileHashes: [],
        totalDocuments: 0,
        totalChunks: 0,
      };

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockVersionData));
      mockGitUtils.getCurrentSHA.mockResolvedValue('new456');
      mockGitUtils.getChangesBetweenCommits.mockResolvedValue([
        { path: 'file1.md', status: 'modified' },
        { path: 'file2.md', status: 'added' },
      ]);
      mockGitUtils.getContentHash.mockReturnValue('hash123');

      // Mock file reads for content hashing
      mockedFs.readFile.mockImplementation(async (filePath) => {
        if (typeof filePath === 'string' && filePath.includes('netherdb-version.json')) {
          return JSON.stringify(mockVersionData);
        }
        return 'file content';
      });

      const result = await versionTracker.getChangedFiles(['.md']);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: 'file1.md',
        status: 'modified',
        contentHash: 'hash123',
      });
      expect(result[1]).toEqual({
        path: 'file2.md',
        status: 'added',
        contentHash: 'hash123',
      });
    });

    it('should handle uncommitted changes', async () => {
      const mockVersionData = {
        lastIndexedSHA: 'same123',
        indexedAt: '2023-01-01T00:00:00.000Z',
        fileHashes: [],
        totalDocuments: 0,
        totalChunks: 0,
      };

      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockVersionData));
      mockGitUtils.getCurrentSHA.mockResolvedValue('same123');
      mockGitUtils.getUncommittedChanges.mockResolvedValue([
        { path: 'file1.md', status: 'modified' },
      ]);
      mockGitUtils.getContentHash.mockReturnValue('hash123');

      // Mock file reads
      mockedFs.readFile.mockImplementation(async (filePath) => {
        if (typeof filePath === 'string' && filePath.includes('netherdb-version.json')) {
          return JSON.stringify(mockVersionData);
        }
        return 'file content';
      });

      const result = await versionTracker.getChangedFiles(['.md']);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: 'file1.md',
        status: 'modified',
        contentHash: 'hash123',
      });
    });

    it('should filter files by extension', async () => {
      mockedFs.access.mockRejectedValue(new Error('File not found'));
      
      mockedFs.readdir.mockResolvedValue([
        { name: 'file1.md', isDirectory: () => false, isFile: () => true },
        { name: 'file2.txt', isDirectory: () => false, isFile: () => true },
        { name: 'file3.md', isDirectory: () => false, isFile: () => true },
      ] as any);

      mockedFs.readFile.mockResolvedValue('file content');
      mockGitUtils.getContentHash.mockReturnValue('hash123');

      const result = await versionTracker.getChangedFiles(['.md']);

      expect(result).toHaveLength(2);
      expect(result.every(f => f.path.endsWith('.md'))).toBe(true);
    });
  });

  describe('updateVersionAfterIndexing', () => {
    it('should update version info successfully', async () => {
      const processedFiles = new Map([
        ['file1.md', 'hash1'],
        ['file2.md', 'hash2'],
      ]);

      mockGitUtils.getCurrentSHA.mockResolvedValue('new123');
      mockedFs.writeFile.mockResolvedValue(undefined);

      await versionTracker.updateVersionAfterIndexing(2, 5, processedFiles);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        path.join(testRepoPath, 'netherdb-version.json'),
        expect.stringContaining('"lastIndexedSHA": "new123"'),
        'utf-8'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Version updated: SHA=new123, docs=2, chunks=5'
      );
    });
  });

  describe('database directory handling', () => {
    it('should use database directory when provided', async () => {
      const databaseDir = '/test/database';
      const versionTrackerWithDb = new VersionTracker(testRepoPath, databaseDir, mockLogger);
      
      const versionInfo: VersionInfo = {
        lastIndexedSHA: 'abc123',
        indexedAt: new Date('2023-01-01T00:00:00.000Z'),
        fileHashes: new Map([['file1.md', 'hash1']]),
        totalDocuments: 1,
        totalChunks: 3,
      };

      mockedFs.writeFile.mockResolvedValue(undefined);

      await versionTrackerWithDb.saveVersionInfo(versionInfo);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        path.join(databaseDir, 'netherdb-version.json'),
        expect.stringContaining('"lastIndexedSHA": "abc123"'),
        'utf-8'
      );
    });
  });

  describe('getRepositoryStatus', () => {
    it('should return complete repository status', async () => {
      const mockVersionData = {
        lastIndexedSHA: 'old123',
        indexedAt: '2023-01-01T00:00:00.000Z',
        fileHashes: [],
        totalDocuments: 0,
        totalChunks: 0,
      };

      mockGitUtils.getCurrentSHA.mockResolvedValue('current123');
      mockGitUtils.isRepositoryClean.mockResolvedValue(true);
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockVersionData));

      const result = await versionTracker.getRepositoryStatus();

      expect(result).toEqual({
        currentSHA: 'current123',
        isClean: true,
        lastIndexedSHA: 'old123',
        indexedAt: new Date('2023-01-01T00:00:00.000Z'),
        needsReindexing: true,
      });
    });
  });
});