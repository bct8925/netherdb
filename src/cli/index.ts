#!/usr/bin/env node

/**
 * CLI entry point for netherdb command
 */

import { Command } from 'commander';
import {
  IndexCommand,
  StatusCommand,
  BackupCommand,
  SearchCommand,
  MCPCommand,
} from './commands/index.js';
import { Logger } from '../utils/Logger.js';

const logger = new Logger('CLI');

async function main() {
  const program = new Command();

  program
    .name('netherdb')
    .description('CLI for NetherDB - Obsidian Vector Database system')
    .version('0.1.0')
    .option('-g, --global', 'Use global configuration directory (~/.netherdb)');

  // Register command handlers
  const indexCommand = new IndexCommand();
  const statusCommand = new StatusCommand();
  const backupCommand = new BackupCommand();
  const searchCommand = new SearchCommand();
  const mcpCommand = new MCPCommand();

  indexCommand.register(program);
  statusCommand.register(program);
  backupCommand.register(program);
  searchCommand.register(program);
  mcpCommand.register(program);

  // Global error handling
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', { reason, promise });
    console.error('❌ Unexpected error occurred. Check logs for details.');
    process.exit(1);
  });

  process.on('uncaughtException', error => {
    logger.error('Uncaught exception', { error });
    console.error('❌ Fatal error occurred:', error.message);
    process.exit(1);
  });

  // Parse command line arguments
  try {
    await program.parseAsync();
  } catch (error) {
    logger.error('CLI parsing failed', { error });
    console.error('❌ Command failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Handle if no command provided
if (process.argv.length <= 2) {
  console.log('🔧 NetherDB - Obsidian Vector Database CLI');
  console.log('');
  console.log('Available commands:');
  console.log('  index     Index Obsidian vault into vector database');
  console.log('  status    Check indexing status and sync state');
  console.log('  search    Search through indexed documents');
  console.log('  backup    Backup and restore vector database');
  console.log('  mcp       Model Context Protocol server commands');
  console.log('');
  console.log('Use "netherdb <command> --help" for more information about a command.');
  process.exit(0);
}

main().catch(error => {
  logger.error('CLI main function failed', { error });
  console.error('❌ CLI startup failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
