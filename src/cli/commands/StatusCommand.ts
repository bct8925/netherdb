import { Command } from 'commander';
import { Logger } from '../../utils/Logger.js';
import { GitUtils } from '../../utils/GitUtils.js';
import { DatabaseFactory } from '../../database/factory.js';
import { VersionTracker } from '../../obsidian/indexing/VersionTracker.js';
import { ObsidianManager } from '../../obsidian/indexing/ObsidianManager.js';
import { IncrementalIndexer } from '../../obsidian/indexing/IncrementalIndexer.js';
import { FileIndexer } from '../../obsidian/indexing/FileIndexer.js';
import { ConfigHelper, type BaseCommandOptions } from '../../utils/ConfigHelper.js';
import type { DatabaseConfig } from '../../types/Config.js';
import { formatDistanceToNow } from 'date-fns';

export interface StatusOptions extends BaseCommandOptions {
  verbose?: boolean;
  json?: boolean;
}

interface StatusInfo {
  vault: {
    path: string;
    isGitRepo: boolean;
    currentSHA?: string;
    totalFiles: number;
  };
  database: {
    exists: boolean;
    path: string;
    totalDocuments?: number;
    totalChunks?: number;
    lastIndexed?: Date;
    indexedSHA?: string;
  };
  sync: {
    isUpToDate: boolean;
    needsFullReindex: boolean;
    changedFiles?: string[];
    recommendation: string;
  };
}

export class StatusCommand {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('StatusCommand');
  }

  public register(program: Command): void {
    program
      .command('status')
      .description('Check indexing status and sync state')
      .option('--config <path>', 'Path to configuration file', 'config/default.json')
      .option('--vault-path <path>', 'Path to Obsidian vault (default: current directory)')
      .option('--db-path <path>', 'Path to vector database directory')
      .option('--verbose', 'Show detailed information')
      .option('--json', 'Output status as JSON')
      .action((options: StatusOptions, command: Command) => this.handleStatus(options, command));
  }

  private async handleStatus(options: StatusOptions, command: Command): Promise<void> {
    try {
      this.logger.info('Checking status', { options });

      // Load configuration with global support
      const { config } = await ConfigHelper.loadConfigWithGlobalSupport(options, command);

      const vaultPath = config.obsidian?.vaultPath || process.cwd();

      // Gather status information
      const status = await this.gatherStatusInfo(vaultPath, config);

      // Output results
      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        this.displayStatus(status, options.verbose || false);
      }

    } catch (error) {
      this.logger.error('Status check failed', { error });
      console.error('❌ Status check failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async gatherStatusInfo(vaultPath: string, config: DatabaseConfig): Promise<StatusInfo> {
    // Initialize components
    const database = DatabaseFactory.create(config.database.provider, config.database);
    const obsidianManager = new ObsidianManager(vaultPath, config.database.connection.path);
    const versionTracker = new VersionTracker(vaultPath, config.database.connection.path);

    // Check if database exists without creating it
    const databaseExists = await database.databaseExists();

    // Vault information
    const isGitRepo = await GitUtils.isGitRepository(vaultPath);
    let currentSHA: string | undefined;
    if (isGitRepo) {
      try {
        currentSHA = await GitUtils.getCurrentCommitSHA(vaultPath);
      } catch (error) {
        this.logger.warn('Could not get current git SHA', { error });
      }
    }

    // Use discovery options from config
    const discoveryOptions = {
      includePatterns: config.obsidian?.indexing?.includePatterns,
      excludePatterns: config.obsidian?.indexing?.excludePatterns,
    };

    // Discover files based on include patterns (typically markdown files)
    const filesResult = await obsidianManager.discoverFiles({
      ...discoveryOptions,
      fileExtensions: ['.md'],
      includeHidden: false,
    });
    const files = filesResult.map(file => file.path);

    // Database information
    let totalDocuments: number | undefined;
    let totalChunks: number | undefined;
    let lastIndexed: Date | undefined;
    let indexedSHA: string | undefined;

    if (databaseExists) {
      try {
        // Only try to get stats if database exists
        await database.initialize();
        const stats = await database.getStats();
        totalDocuments = stats.totalVectors; // Use available field
        totalChunks = stats.totalVectors;
      } catch (error) {
        // Database exists but is inaccessible
        this.logger.debug('Database exists but not accessible', { error });
      }
    }

    // Version tracking information
    let hasVersionInfo = false;
    if (databaseExists) {
      try {
        hasVersionInfo = await versionTracker.hasVersionInfo();
        if (hasVersionInfo) {
          const versionInfo = await versionTracker.getVersionInfo();
          lastIndexed = versionInfo.indexedAt;
          indexedSHA = versionInfo.lastIndexedSHA;
        }
      } catch (error) {
        this.logger.debug('Could not get version info', { error });
      }
    }

    // Sync analysis
    let isUpToDate = false;
    let needsFullReindex = false;
    let changedFiles: string[] | undefined;
    let recommendation: string;

    if (!databaseExists) {
      recommendation = 'Run full indexing to create initial database';
      needsFullReindex = true;
    } else if (!hasVersionInfo) {
      recommendation = 'Run full indexing to establish version tracking';
      needsFullReindex = true;
    } else if (!isGitRepo) {
      recommendation = 'Consider using git for better change tracking';
      isUpToDate = false; // Can't determine without git
    } else if (currentSHA === indexedSHA) {
      recommendation = 'Index is up to date';
      isUpToDate = true;
    } else {
      // Check for changes
      try {
        // Create a dummy FileIndexer for change detection only
        const dummyFileIndexer = new FileIndexer(database, obsidianManager, {});
        const indexer = new IncrementalIndexer(
          dummyFileIndexer, obsidianManager, versionTracker, database
        );
        const changes = await indexer.detectChanges();
        
        const totalChanges = changes.added.length + changes.modified.length + changes.deleted.length;
        changedFiles = [...changes.added, ...changes.modified, ...changes.deleted];
        
        if (totalChanges === 0) {
          recommendation = 'Index is functionally up to date (no content changes)';
          isUpToDate = true;
        } else {
          recommendation = `Run incremental indexing (${totalChanges} files changed)`;
          isUpToDate = false;
        }
      } catch (error) {
        this.logger.warn('Could not analyze changes', { error });
        recommendation = 'Run incremental indexing (change analysis failed)';
        isUpToDate = false;
      }
    }

    const result: StatusInfo = {
      vault: {
        path: vaultPath,
        isGitRepo,
        totalFiles: files.length
      },
      database: {
        exists: databaseExists,
        path: config.database.connection.path
      },
      sync: {
        isUpToDate,
        needsFullReindex,
        recommendation
      }
    };

    // Add optional fields only if they exist
    if (currentSHA) {
      result.vault.currentSHA = currentSHA;
    }
    if (totalDocuments !== undefined) {
      result.database.totalDocuments = totalDocuments;
    }
    if (totalChunks !== undefined) {
      result.database.totalChunks = totalChunks;
    }
    if (lastIndexed) {
      result.database.lastIndexed = lastIndexed;
    }
    if (indexedSHA) {
      result.database.indexedSHA = indexedSHA;
    }
    if (changedFiles) {
      result.sync.changedFiles = changedFiles;
    }

    return result;
  }

  private displayStatus(status: StatusInfo, verbose: boolean): void {
    console.log('📊 Obsidian Vector Database Status\n');

    // Vault Status
    console.log('📁 Vault Information:');
    console.log(`  Path: ${status.vault.path}`);
    console.log(`  Git Repository: ${status.vault.isGitRepo ? '✅ Yes' : '❌ No'}`);
    if (status.vault.currentSHA) {
      console.log(`  Current SHA: ${status.vault.currentSHA.substring(0, 8)}...`);
    }
    console.log(`  Total Files: ${status.vault.totalFiles}`);

    console.log('\n💾 Database Information:');
    console.log(`  Exists: ${status.database.exists ? '✅ Yes' : '❌ No'}`);
    console.log(`  Path: ${status.database.path}`);
    
    if (status.database.exists) {
      if (status.database.totalDocuments !== undefined) {
        console.log(`  Documents: ${status.database.totalDocuments}`);
      }
      if (status.database.totalChunks !== undefined) {
        console.log(`  Chunks: ${status.database.totalChunks}`);
      }
      if (status.database.lastIndexed) {
        const timeAgo = formatDistanceToNow(status.database.lastIndexed, { addSuffix: true });
        console.log(`  Last Indexed: ${timeAgo}`);
      }
      if (status.database.indexedSHA) {
        console.log(`  Indexed SHA: ${status.database.indexedSHA.substring(0, 8)}...`);
      }
    }

    console.log('\n🔄 Sync Status:');
    const syncIcon = status.sync.isUpToDate ? '✅' : '⚠️';
    console.log(`  Status: ${syncIcon} ${status.sync.isUpToDate ? 'Up to date' : 'Needs update'}`);
    console.log(`  Recommendation: ${status.sync.recommendation}`);

    if (status.sync.needsFullReindex) {
      console.log('  Action Required: netherdb index --full');
    } else if (!status.sync.isUpToDate) {
      console.log('  Action Required: netherdb index --incremental');
    }

    // Verbose information
    if (verbose && status.sync.changedFiles && status.sync.changedFiles.length > 0) {
      console.log('\n📝 Changed Files:');
      status.sync.changedFiles.slice(0, 10).forEach(file => {
        console.log(`  • ${file}`);
      });
      
      if (status.sync.changedFiles.length > 10) {
        console.log(`  ... and ${status.sync.changedFiles.length - 10} more files`);
      }
    }

    // Performance insights
    if (verbose && status.database.exists) {
      console.log('\n📈 Performance Insights:');
      
      if (status.database.totalDocuments && status.database.totalChunks) {
        const avgChunksPerDoc = (status.database.totalChunks / status.database.totalDocuments).toFixed(1);
        console.log(`  Average chunks per document: ${avgChunksPerDoc}`);
      }

      const coverage = status.vault.totalFiles > 0 
        ? ((status.database.totalDocuments || 0) / status.vault.totalFiles * 100).toFixed(1)
        : '0.0';
      console.log(`  Index coverage: ${coverage}% of files`);
    }

    console.log('\n💡 Tip: Use --verbose for detailed information or --json for machine-readable output');
  }

}

