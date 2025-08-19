import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import path from 'path';
import { Logger } from './Logger';

const execFileAsync = promisify(execFile);

/**
 * Git file change information
 */
export interface GitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string | undefined; // For renamed files
}

/**
 * Git utilities for repository operations
 */
export class GitUtils {
  private readonly repoPath: string;
  private readonly logger: Logger;

  constructor(repoPath: string, logger?: Logger) {
    this.repoPath = repoPath;
    this.logger = logger || new Logger('GitUtils');
  }

  /**
   * Get current HEAD commit SHA
   */
  async getCurrentSHA(): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: this.repoPath,
      });
      return stdout.trim();
    } catch (error) {
      this.logger.error('Failed to get current SHA:', error);
      throw new Error(`Failed to get current git SHA: ${error}`);
    }
  }

  /**
   * Check if repository is clean (no uncommitted changes)
   */
  async isRepositoryClean(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: this.repoPath,
      });
      return stdout.trim().length === 0;
    } catch (error) {
      this.logger.error('Failed to check repository status:', error);
      throw new Error(`Failed to check git status: ${error}`);
    }
  }

  /**
   * Get uncommitted changes
   */
  async getUncommittedChanges(): Promise<GitFileChange[]> {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: this.repoPath,
      });

      const changes: GitFileChange[] = [];
      const lines = stdout
        .trim()
        .split('\n')
        .filter(line => line.length > 0);

      for (const line of lines) {
        const statusCode = line.substring(0, 2);
        const filePath = line.substring(3);

        let status: GitFileChange['status'];
        let oldPath: string | undefined;

        switch (statusCode.trim()) {
          case 'A':
          case '??':
            status = 'added';
            break;
          case 'M':
          case 'MM':
          case 'AM':
            status = 'modified';
            break;
          case 'D':
            status = 'deleted';
            break;
          case 'R':
          case 'RM':
            status = 'renamed';
            // For renamed files, git status shows "old -> new"
            if (filePath.includes(' -> ')) {
              const [old] = filePath.split(' -> ');
              oldPath = old;
            }
            break;
          default:
            status = 'modified'; // Default fallback
        }

        const finalPath = filePath.includes(' -> ')
          ? filePath.split(' -> ')[1] || filePath
          : filePath;

        const change: GitFileChange = {
          path: finalPath,
          status,
        };

        if (oldPath) {
          change.oldPath = oldPath;
        }

        changes.push(change);
      }

      return changes;
    } catch (error) {
      this.logger.error('Failed to get uncommitted changes:', error);
      throw new Error(`Failed to get uncommitted changes: ${error}`);
    }
  }

  /**
   * Get changes between two commits
   */
  async getChangesBetweenCommits(fromSHA: string, toSHA: string): Promise<GitFileChange[]> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', '--name-status', `${fromSHA}..${toSHA}`],
        {
          cwd: this.repoPath,
        }
      );

      const changes: GitFileChange[] = [];
      const lines = stdout
        .trim()
        .split('\n')
        .filter(line => line.length > 0);

      for (const line of lines) {
        const parts = line.split('\t');
        const statusCode = parts[0];
        const filePath = parts[1];

        if (!statusCode || !filePath) continue;

        let status: GitFileChange['status'];
        let oldPath: string | undefined;

        switch (statusCode[0]) {
          case 'A':
            status = 'added';
            break;
          case 'M':
            status = 'modified';
            break;
          case 'D':
            status = 'deleted';
            break;
          case 'R':
            status = 'renamed';
            oldPath = filePath;
            break;
          default:
            status = 'modified'; // Default fallback
        }

        // For renamed files, there's usually a second part
        if (status === 'renamed' && parts[2]) {
          const change: GitFileChange = {
            path: parts[2],
            status,
          };
          if (filePath) {
            change.oldPath = filePath;
          }
          changes.push(change);
        } else {
          const change: GitFileChange = {
            path: filePath,
            status,
          };
          if (oldPath) {
            change.oldPath = oldPath;
          }
          changes.push(change);
        }
      }

      return changes;
    } catch (error) {
      this.logger.error(`Failed to get changes between ${fromSHA} and ${toSHA}:`, error);
      throw new Error(`Failed to get git changes: ${error}`);
    }
  }

  /**
   * Get content hash (SHA-1) for a string
   */
  getContentHash(content: string): string {
    return createHash('sha1').update(content, 'utf8').digest('hex');
  }

  /**
   * Check if path is within a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], {
        cwd: this.repoPath,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get repository root path
   */
  async getRepositoryRoot(): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
        cwd: this.repoPath,
      });
      return stdout.trim();
    } catch (error) {
      this.logger.error('Failed to get repository root:', error);
      throw new Error(`Failed to get git repository root: ${error}`);
    }
  }

  /**
   * Get relative path from repository root
   */
  async getRelativePath(absolutePath: string): Promise<string> {
    const repoRoot = await this.getRepositoryRoot();
    return path.relative(repoRoot, absolutePath);
  }

  /**
   * Get file history (commit SHAs that modified the file)
   */
  async getFileHistory(filePath: string, limit = 10): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', '--format=%H', `-n${limit}`, '--', filePath],
        {
          cwd: this.repoPath,
        }
      );

      return stdout
        .trim()
        .split('\n')
        .filter(sha => sha.length > 0);
    } catch (error) {
      this.logger.error(`Failed to get file history for ${filePath}:`, error);
      throw new Error(`Failed to get file history: ${error}`);
    }
  }

  /**
   * Get commit information
   */
  async getCommitInfo(sha: string): Promise<{
    sha: string;
    author: string;
    date: Date;
    message: string;
  }> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['show', '--format=%H%n%an%n%ai%n%s', '--no-patch', sha],
        {
          cwd: this.repoPath,
        }
      );

      const lines = stdout.trim().split('\n');
      if (lines.length < 4) {
        throw new Error('Invalid commit info format');
      }

      return {
        sha: lines[0] || '',
        author: lines[1] || '',
        date: new Date(lines[2] || ''),
        message: lines[3] || '',
      };
    } catch (error) {
      this.logger.error(`Failed to get commit info for ${sha}:`, error);
      throw new Error(`Failed to get commit info: ${error}`);
    }
  }

  // Static utility methods for CLI usage

  /**
   * Check if a path is within a git repository (static version)
   */
  static async isGitRepository(repoPath: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], {
        cwd: repoPath,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current HEAD commit SHA (static version)
   */
  static async getCurrentCommitSHA(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: repoPath,
      });
      return stdout.trim();
    } catch (error) {
      throw new Error(`Failed to get current git SHA: ${error}`);
    }
  }

  /**
   * Get repository status information (static version)
   */
  static async getRepositoryStatus(repoPath: string): Promise<{
    isClean: boolean;
    uncommittedChanges: GitFileChange[];
    currentSHA: string;
    hasUntracked: boolean;
  }> {
    try {
      const currentSHA = await GitUtils.getCurrentCommitSHA(repoPath);

      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: repoPath,
      });

      const isClean = stdout.trim().length === 0;
      const uncommittedChanges: GitFileChange[] = [];
      let hasUntracked = false;

      if (!isClean) {
        const lines = stdout
          .trim()
          .split('\n')
          .filter(line => line.length > 0);

        for (const line of lines) {
          const statusCode = line.substring(0, 2);
          const filePath = line.substring(3);

          if (statusCode.includes('?')) {
            hasUntracked = true;
          }

          let status: GitFileChange['status'];
          switch (statusCode.trim()) {
            case 'A':
            case '??':
              status = 'added';
              break;
            case 'M':
            case 'MM':
            case 'AM':
              status = 'modified';
              break;
            case 'D':
              status = 'deleted';
              break;
            case 'R':
            case 'RM':
              status = 'renamed';
              break;
            default:
              status = 'modified';
          }

          const finalPath = filePath.includes(' -> ')
            ? filePath.split(' -> ')[1] || filePath
            : filePath;
          const oldPath = filePath.includes(' -> ') ? filePath.split(' -> ')[0] : undefined;

          const change: GitFileChange = {
            path: finalPath,
            status,
          };

          if (oldPath) {
            change.oldPath = oldPath;
          }

          uncommittedChanges.push(change);
        }
      }

      return {
        isClean,
        uncommittedChanges,
        currentSHA,
        hasUntracked,
      };
    } catch (error) {
      throw new Error(`Failed to get repository status: ${error}`);
    }
  }

  /**
   * Get changes between commits with markdown file filtering
   */
  static async getMarkdownChangesBetweenCommits(
    repoPath: string,
    fromSHA: string,
    toSHA: string = 'HEAD'
  ): Promise<GitFileChange[]> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', '--name-status', `${fromSHA}..${toSHA}`, '*.md'],
        {
          cwd: repoPath,
        }
      );

      const changes: GitFileChange[] = [];
      const lines = stdout
        .trim()
        .split('\n')
        .filter(line => line.length > 0);

      for (const line of lines) {
        const parts = line.split('\t');
        const statusCode = parts[0];
        const filePath = parts[1];

        if (!statusCode || !filePath) continue;

        let status: GitFileChange['status'];
        switch (statusCode[0]) {
          case 'A':
            status = 'added';
            break;
          case 'M':
            status = 'modified';
            break;
          case 'D':
            status = 'deleted';
            break;
          case 'R':
            status = 'renamed';
            break;
          default:
            status = 'modified';
        }

        if (status === 'renamed' && parts[2]) {
          changes.push({
            path: parts[2],
            status,
            oldPath: filePath,
          });
        } else {
          changes.push({
            path: filePath,
            status,
          });
        }
      }

      return changes;
    } catch (error) {
      throw new Error(`Failed to get markdown changes between commits: ${error}`);
    }
  }

  /**
   * Get working directory changes for markdown files only
   */
  static async getMarkdownWorkingChanges(repoPath: string): Promise<GitFileChange[]> {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain', '*.md'], {
        cwd: repoPath,
      });

      const changes: GitFileChange[] = [];
      const lines = stdout
        .trim()
        .split('\n')
        .filter(line => line.length > 0);

      for (const line of lines) {
        const statusCode = line.substring(0, 2);
        const filePath = line.substring(3);

        let status: GitFileChange['status'];
        switch (statusCode.trim()) {
          case 'A':
          case '??':
            status = 'added';
            break;
          case 'M':
          case 'MM':
          case 'AM':
            status = 'modified';
            break;
          case 'D':
            status = 'deleted';
            break;
          case 'R':
          case 'RM':
            status = 'renamed';
            break;
          default:
            status = 'modified';
        }

        const finalPath = filePath.includes(' -> ')
          ? filePath.split(' -> ')[1] || filePath
          : filePath;
        const oldPath = filePath.includes(' -> ') ? filePath.split(' -> ')[0] : undefined;

        const change: GitFileChange = {
          path: finalPath,
          status,
        };

        if (oldPath) {
          change.oldPath = oldPath;
        }

        changes.push(change);
      }

      return changes;
    } catch (error) {
      throw new Error(`Failed to get markdown working changes: ${error}`);
    }
  }
}
