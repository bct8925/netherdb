#!/usr/bin/env node

/**
 * Script to rename project from obsidian-vector/obsidian-vector-db to netherdb
 * This script recursively updates all references in the codebase
 */

const fs = require('fs');
const path = require('path');

// Files and directories to skip
const SKIP_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  '.nyc_output',
  'coverage',
  'scripts/rename-project.js', // Skip this script itself
  '.claude'
];

// File extensions to process
const PROCESS_EXTENSIONS = [
  '.js', '.ts', '.json', '.md', '.txt', '.yml', '.yaml'
];

// Replacement patterns
const REPLACEMENTS = [
  // CLI command name
  { from: /obsidian-vector(?!-)/g, to: 'netherdb' },
  
  // Package name
  { from: /obsidian-vector-db/g, to: 'netherdb' },
  
  // Version file name
  { from: /obsidian-vector-version\.json/g, to: 'netherdb-version.json' },
  
  // Folder references (remove old folder structure references)
  { from: /obsidian-vector-db\//g, to: '' },
  { from: /\/obsidian-vector-db/g, to: '' },
  
  // MCP server name in configs
  { from: /"obsidian-vector-db":/g, to: '"netherdb":' },
  
  // Path references that need updating
  { from: /\/Documents\/obsidian\/obsidian-vector-db\//g, to: '/Documents/netherdb/' },
];

function shouldSkip(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  return SKIP_PATTERNS.some(pattern => 
    relativePath.includes(pattern) || relativePath.startsWith(pattern)
  );
}

function shouldProcess(filePath) {
  const ext = path.extname(filePath);
  return PROCESS_EXTENSIONS.includes(ext);
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;
    let hasChanges = false;

    // Apply all replacements
    REPLACEMENTS.forEach(({ from, to }) => {
      const beforeLength = newContent.length;
      newContent = newContent.replace(from, to);
      if (newContent.length !== beforeLength || newContent !== content) {
        hasChanges = true;
      }
    });

    // Write back if changes were made
    if (hasChanges && newContent !== content) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ Updated: ${path.relative(process.cwd(), filePath)}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

function processDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  let totalUpdated = 0;

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (shouldSkip(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      totalUpdated += processDirectory(fullPath);
    } else if (entry.isFile() && shouldProcess(fullPath)) {
      if (processFile(fullPath)) {
        totalUpdated++;
      }
    }
  }

  return totalUpdated;
}

function main() {
  console.log('🔄 Starting project rename: obsidian-vector → netherdb\n');
  
  const startTime = Date.now();
  const totalUpdated = processDirectory(process.cwd());
  const endTime = Date.now();
  
  console.log(`\n✨ Rename complete!`);
  console.log(`📁 Files updated: ${totalUpdated}`);
  console.log(`⏱️  Time taken: ${endTime - startTime}ms`);
  
  console.log('\n🔧 Next steps:');
  console.log('1. Run: npm install (to update package-lock.json)');
  console.log('2. Run: npm run build (to update dist/ files)');
  console.log('3. Run: npm test (to verify everything works)');
  console.log('4. Update any external references or documentation');
}

if (require.main === module) {
  main();
}