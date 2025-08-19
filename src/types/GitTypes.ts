/**
 * Git-related type definitions
 */

/**
 * Represents a file change detected by git
 */
export interface GitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string; // For renamed files
}

/**
 * Git status information
 */
export interface GitStatus {
  isGitRepo: boolean;
  currentSHA?: string;
  isClean: boolean;
  hasUncommittedChanges: boolean;
}

/**
 * Result of git change detection
 */
export interface GitChangesResult {
  changes: GitFileChange[];
  hasMoreChanges: boolean;
  totalChanges: number;
}
