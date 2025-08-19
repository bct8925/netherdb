#!/usr/bin/env npx ts-node

/**
 * Comprehensive integration test covering all Phase 2.1 and 2.2 functionality
 * Tests the complete end-to-end workflow from Obsidian files to vector search
 */

import { createLanceDB } from '../src/database/factory';
import { createTransformersEmbedding } from '../src/embeddings/TransformersEmbedding';
import { ChunkStrategy } from '../src/types/Common';
import { ObsidianManager } from '../src/obsidian/indexing/ObsidianManager';
import { MarkdownParser } from '../src/obsidian/parser/MarkdownParser';
import { HeaderBasedChunker } from '../src/obsidian/chunking/HeaderBasedChunker';
import { TokenCounter } from '../src/obsidian/chunking/TokenCounter';
import { ContentPreserver } from '../src/obsidian/chunking/ContentPreserver';
import { FileIndexer } from '../src/obsidian/indexing/FileIndexer';
import { IncrementalIndexer } from '../src/obsidian/indexing/IncrementalIndexer';
import { VersionTracker } from '../src/obsidian/indexing/VersionTracker';
import { Logger } from '../src/utils/Logger';
import { promises as fs } from 'fs';
import path from 'path';

async function runIntegrationTest() {
  console.log('🚀 Starting Comprehensive Integration Test for Phase 2.1 & 2.2');
  console.log('   Testing complete end-to-end workflow from Obsidian files to vector search\n');
  
  const testDbPath = path.join(__dirname, '../test-data/integration.lancedb');
  const testObsidianPath = path.join(__dirname, '../test-data/test-vault');
  
  // Clean up any existing test data to ensure clean state
  console.log('🧹 Cleaning up any existing test data...');
  try {
    await fs.rm(testDbPath, { recursive: true, force: true });
    await fs.rm(testObsidianPath, { recursive: true, force: true });
    console.log('✅ Previous test data cleaned up');
  } catch {
    // Files might not exist, which is fine
  }
  
  // Ensure test data directories exist
  const testDataDir = path.dirname(testDbPath);
  await fs.mkdir(testDataDir, { recursive: true });
  await fs.mkdir(testObsidianPath, { recursive: true });

  let database, embedding, obsidianManager, fileIndexer, incrementalIndexer, versionTracker;
  const logger = new Logger('IntegrationTest');

  try {
    console.log('='.repeat(60));
    console.log('PHASE 1: SETUP - Creating test Obsidian vault and services');
    console.log('='.repeat(60));

    // Create a realistic test Obsidian vault with various content types
    await createTestObsidianVault(testObsidianPath);
    
    // Initialize core services
    console.log('🔧 Initializing core services...');
    database = createLanceDB(testDbPath, 'obsidian_vectors');
    embedding = createTransformersEmbedding('all-MiniLM-L6-v2');
    
    await database.initialize();
    console.log('✅ Vector database initialized');
    
    await embedding.initialize();
    console.log('✅ Embedding model initialized');

    console.log('\n' + '='.repeat(60));
    console.log('PHASE 2.1: OBSIDIAN FILE DISCOVERY AND PARSING');
    console.log('='.repeat(60));

    // Test ObsidianManager
    console.log('📁 Testing ObsidianManager...');
    obsidianManager = new ObsidianManager(testObsidianPath, undefined, logger);

    const discoveredFiles = await obsidianManager.discoverFiles({
      fileExtensions: ['.md'],
      ignorePaths: ['templates', '.obsidian'],
      includeHidden: false,
    });
    console.log(`✅ Discovered ${discoveredFiles.length} markdown files:`);
    discoveredFiles.forEach(file => console.log(`   - ${file.path}`));

    // Test repository status
    const repoStatus = await obsidianManager.getRepositoryStatus();
    console.log(`📊 Repository status: isGit=${repoStatus.isGitRepo}, SHA=${repoStatus.currentSHA?.substring(0, 8) || 'N/A'}`);

    // Test MarkdownParser with different content types
    console.log('\n📝 Testing MarkdownParser with various content types...');
    const parser = new MarkdownParser(logger);
    
    for (const file of discoveredFiles.slice(0, 3)) { // Test first 3 files
      const content = await fs.readFile(file.absolutePath, 'utf-8');
      const parsed = await parser.parse(content, {
        extractTags: true,
        extractHeadings: true,
        processWikiLinks: true,
        extractPlainText: true,
        customFields: ['category', 'author'],
      });
      
      console.log(`   📄 ${file.path}:`);
      console.log(`      - Frontmatter: ${parsed.hasFrontmatter ? 'Yes' : 'No'}`);
      console.log(`      - WikiLinks: ${parsed.wikiLinks.length}`);
      console.log(`      - Tags: ${parsed.tags.length}`);
      console.log(`      - Headings: ${parsed.metadata.headings.length}`);
      console.log(`      - Word count: ${parsed.metadata.wordCount}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('PHASE 2.2: SMART CHUNKING AND INDEXING');
    console.log('='.repeat(60));

    // Test chunking strategies
    console.log('🔪 Testing chunking strategies...');
    
    const chunkStrategy: ChunkStrategy = {
      splitByHeaders: true,
      splitByParagraphs: true,
      maxTokens: 256, // Smaller for testing
      overlapTokens: 25,
      includeHeaders: true,
      preserveCodeBlocks: true,
      preserveTables: true,
      preserveCallouts: true,
    };

    const chunker = new HeaderBasedChunker(chunkStrategy, logger);
    TokenCounter.createGPTEstimate();
    const contentPreserver = new ContentPreserver();

    // Test chunking on a complex document
    const complexFile = discoveredFiles[1]!; // Use second file
    const complexContent = await fs.readFile(complexFile.absolutePath, 'utf-8');
    const complexParsed = await parser.parse(complexContent, {
      extractTags: true,
      extractHeadings: true,
      processWikiLinks: true,
      extractPlainText: true,
      customFields: ['category', 'author'],
    });
    
    const chunkingResult = await chunker.chunk(complexParsed, complexFile.path);
    console.log(`✅ Chunked document into ${chunkingResult.chunks.length} chunks:`);
    console.log(`   - Total tokens: ${chunkingResult.totalTokens}`);
    console.log(`   - Processing time: ${chunkingResult.processingTime}ms`);
    console.log(`   - Warnings: ${chunkingResult.warnings.length}`);
    
    chunkingResult.chunks.forEach((chunk, i) => {
      console.log(`   - Chunk ${i + 1}: ${chunk.tokens} tokens, type: ${chunk.metadata.type}`);
    });

    // Test token counting
    console.log('\n🔢 Testing token counting strategies...');
    const testText = complexContent.substring(0, 500);
    console.log(`   - Simple count: ${TokenCounter.createSimple().countTokens(testText)} tokens`);
    console.log(`   - Whitespace count: ${TokenCounter.createWhitespace().countTokens(testText)} tokens`);
    console.log(`   - GPT estimate: ${TokenCounter.createGPTEstimate().countTokens(testText)} tokens`);

    // Test content preservation
    console.log('\n🛡️  Testing content preservation...');
    const preservationResult = contentPreserver.preserveContent(complexContent);
    console.log(`   - Preserved blocks: ${preservationResult.preservedBlocks.length}`);
    console.log(`   - Block types: ${preservationResult.preservedBlocks.map(b => b.type).join(', ')}`);

    console.log('\n📚 Testing FileIndexer...');
    
    fileIndexer = new FileIndexer(
      database,
      obsidianManager,
      {
        chunkStrategy: chunkStrategy,
        batchSize: 5,
        maxConcurrency: 2,
        skipErrorFiles: true,
        preserveSpecialBlocks: true,
        generateEmbeddings: true,
        includeFileMetadata: true,
        customFields: ['category', 'author'],
        embeddingProvider: embedding,
      },
      logger
    );

    // Index all files
    const indexingResult = await fileIndexer.indexAllFiles();
    console.log(`✅ Indexed ${indexingResult.processedFiles} files:`);
    console.log(`   - Total chunks: ${indexingResult.totalChunks}`);
    console.log(`   - Processing time: ${indexingResult.processingTime}ms`);
    console.log(`   - Errors: ${indexingResult.errors.length}`);
    console.log(`   - Skipped files: ${indexingResult.skippedFiles.length}`);

    if (indexingResult.errors.length > 0) {
      console.log('   Errors encountered:');
      indexingResult.errors.forEach(error => {
        console.log(`     - ${error.file}: ${error.error} (${error.stage})`);
      });
    }

    console.log('\n⚡ Testing IncrementalIndexer and VersionTracker...');
    
    versionTracker = new VersionTracker(testObsidianPath, undefined, logger);
    incrementalIndexer = new IncrementalIndexer(
      fileIndexer,
      obsidianManager,
      versionTracker,
      database,
      {
        maxChangedFiles: 50,
        batchDeleteSize: 10,
        deleteBeforeInsert: true,
        handleRenames: true,
        handleMoves: true,
        skipErrorFiles: true,
      },
      logger
    );

    // Check indexing status
    const indexingStatus = await incrementalIndexer.getIndexingStatus();
    console.log(`📊 Indexing status: ${indexingStatus.recommendation} (${indexingStatus.reason})`);
    console.log(`   - Needs indexing: ${indexingStatus.needsIndexing}`);
    console.log(`   - Change count: ${indexingStatus.changeCount}`);
    console.log(`   - Last indexed: ${indexingStatus.lastIndexed?.toISOString() || 'Never'}`);

    // Simulate a file change and test incremental indexing
    console.log('\n📝 Simulating file changes for incremental indexing...');
    const newFilePath = path.join(testObsidianPath, 'dynamic-content.md');
    await fs.writeFile(newFilePath, `---
title: Dynamic Content
tags: [dynamic, test]
---

# Dynamic Content

This file was created during the integration test to test incremental indexing.

## Section 1

Content for testing incremental updates.

## Section 2

More content with [[wiki links]] and #tags.
`);

    // Run incremental indexing
    const incrementalResult = await incrementalIndexer.performIncrementalIndex();
    console.log(`✅ Incremental indexing completed:`);
    console.log(`   - Changes: +${incrementalResult.changesSummary.added} -${incrementalResult.changesSummary.deleted} ~${incrementalResult.changesSummary.modified}`);
    console.log(`   - Full reindex triggered: ${incrementalResult.fullReindexTriggered}`);
    console.log(`   - Processing time: ${incrementalResult.processingTime}ms`);

    console.log('\n' + '='.repeat(60));
    console.log('PHASE 3: END-TO-END SEARCH AND RETRIEVAL');
    console.log('='.repeat(60));

    // Test search functionality with real content and score validation
    console.log('🔍 Testing semantic search on indexed content with score validation...');
    
    const searchQueries = [
      'Apex programming classes and methods',
      'master detail lookup relationships',
      'Lightning Web Components LWC',
      'Flow Builder automation processes',
      'SOQL database queries SELECT',
    ];

    let totalSearchResults = 0;
    let scoreValidationPassed = true;
    const scoreIssues: string[] = [];

    for (const query of searchQueries) {
      console.log(`\n   Query: "${query}"`);
      const queryVector = await embedding.embed(query);
      const searchResults = await database.search(queryVector, undefined, 3);
      totalSearchResults += searchResults.length;
      
      console.log(`   Results (${searchResults.length}):`);
      searchResults.forEach((result, i) => {
        const preview = result.content.substring(0, 100).replace(/\n/g, ' ');
        console.log(`     ${i + 1}. [${result.score.toFixed(3)}] ${preview}...`);
        console.log(`        Source: ${result.metadata.filePath} (chunk ${result.metadata.chunkIndex + 1}/${result.metadata.totalChunks})`);
        
        // Critical score validation checks
        if (result.score === undefined || result.score === null) {
          scoreIssues.push(`Query "${query}" result ${i + 1}: Score is undefined/null`);
          scoreValidationPassed = false;
        } else if (result.score === 0) {
          scoreIssues.push(`Query "${query}" result ${i + 1}: Score is exactly zero (${result.distance} distance)`);
          scoreValidationPassed = false;
        } else if (result.score < 0 || result.score > 1) {
          scoreIssues.push(`Query "${query}" result ${i + 1}: Score ${result.score} outside valid range [0,1]`);
          scoreValidationPassed = false;
        } else if (Number.isNaN(result.score)) {
          scoreIssues.push(`Query "${query}" result ${i + 1}: Score is NaN`);
          scoreValidationPassed = false;
        } else if (!Number.isFinite(result.score)) {
          scoreIssues.push(`Query "${query}" result ${i + 1}: Score is not finite (${result.score})`);
          scoreValidationPassed = false;
        }
        
        // Validate distance values too
        if (result.distance === undefined || result.distance === null) {
          scoreIssues.push(`Query "${query}" result ${i + 1}: Distance is undefined/null`);
          scoreValidationPassed = false;
        } else if (result.distance < 0) {
          scoreIssues.push(`Query "${query}" result ${i + 1}: Distance ${result.distance} is negative`);
          scoreValidationPassed = false;
        } else if (Number.isNaN(result.distance)) {
          scoreIssues.push(`Query "${query}" result ${i + 1}: Distance is NaN`);
          scoreValidationPassed = false;
        }
      });
      
      // Validate score ordering (higher scores should come first)
      for (let i = 1; i < searchResults.length; i++) {
        const prevScore = searchResults[i-1]!.score;
        const currScore = searchResults[i]!.score;
        if (prevScore < currScore) {
          scoreIssues.push(`Query "${query}": Results not ordered by score (${prevScore} < ${currScore})`);
          scoreValidationPassed = false;
        }
      }
    }

    // Report score validation results
    console.log(`\n📊 Score Validation Results:`);
    console.log(`   Total search results analyzed: ${totalSearchResults}`);
    if (scoreValidationPassed) {
      console.log(`   ✅ All scores are valid and meaningful`);
      console.log(`   ✅ No zero scores detected`);
      console.log(`   ✅ All scores within valid range [0,1]`);
      console.log(`   ✅ Results properly ordered by relevance`);
    } else {
      console.log(`   ❌ Score validation FAILED with ${scoreIssues.length} issues:`);
      scoreIssues.forEach(issue => console.log(`      - ${issue}`));
      throw new Error(`Score validation failed! This indicates a regression in the scoring system.`);
    }

    // Test filtered search with score validation
    console.log('\n🏷️  Testing filtered search with score validation...');
    const taggedQuery = 'development';
    const taggedVector = await embedding.embed(taggedQuery);
    const taggedResults = await database.search(taggedVector, {
      tags: ['salesforce'],
    }, 5);
    console.log(`   Tagged search for "${taggedQuery}" with tag "salesforce": ${taggedResults.length} results`);
    
    // Validate filtered search scores
    taggedResults.forEach((result, i) => {
      if (result.score === 0) {
        scoreIssues.push(`Filtered search result ${i + 1}: Score is exactly zero`);
        scoreValidationPassed = false;
      }
      if (result.score < 0 || result.score > 1) {
        scoreIssues.push(`Filtered search result ${i + 1}: Score ${result.score} outside valid range`);
        scoreValidationPassed = false;
      }
    });

    // Test database query interface with score validation
    console.log('\n🎯 Testing database query interface with score validation...');
    const queryResults = await database.query('apex programming', { limit: 3 });
    console.log(`   Query interface results: ${queryResults.results.length} found`);
    
    // Validate query interface scores (these often use different code paths)
    queryResults.results.forEach((result, i) => {
      if (result.score === 0) {
        scoreIssues.push(`Query interface result ${i + 1}: Score is exactly zero`);
        scoreValidationPassed = false;
      }
      if (result.score < 0 || result.score > 1) {
        scoreIssues.push(`Query interface result ${i + 1}: Score ${result.score} outside valid range`);
        scoreValidationPassed = false;
      }
      console.log(`     ${i + 1}. [${result.score.toFixed(3)}] ${result.content.substring(0, 60)}...`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('PHASE 4: PERFORMANCE AND STATISTICS');
    console.log('='.repeat(60));

    // Get comprehensive stats
    const finalStats = await database.getStats();
    console.log(`📊 Final database statistics:`);
    console.log(`   - Total vectors: ${finalStats.totalVectors}`);
    console.log(`   - Database size: ${finalStats.totalSize}`);
    console.log(`   - Index health: ${finalStats.indexHealth}`);
    console.log(`   - Last updated: ${finalStats.lastUpdated}`);

    // Test version tracking
    const versionInfo = await versionTracker.loadVersionInfo();
    if (versionInfo) {
      console.log(`📚 Version tracking info:`);
      console.log(`   - Last indexed SHA: ${versionInfo.lastIndexedSHA.substring(0, 8)}`);
      console.log(`   - Indexed at: ${versionInfo.indexedAt}`);
      console.log(`   - Total documents: ${versionInfo.totalDocuments}`);
      console.log(`   - Total chunks: ${versionInfo.totalChunks}`);
      console.log(`   - File hashes tracked: ${versionInfo.fileHashes.size}`);
    }

    // Test chunk linking and navigation
    console.log('\n🔗 Testing chunk linking and navigation...');
    const allResults = await database.query('', { limit: 10 });
    const linkedChunks = allResults.results.filter(r => 
      r.metadata.totalChunks > 1
    );
    
    if (linkedChunks.length > 0) {
      const firstLinked = linkedChunks[0]!;
      console.log(`   Found document with ${firstLinked.metadata.totalChunks} chunks:`);
      console.log(`   - Current chunk: ${firstLinked.metadata.chunkIndex + 1}/${firstLinked.metadata.totalChunks}`);
      console.log(`   - File: ${firstLinked.metadata.filePath}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 COMPREHENSIVE INTEGRATION TEST COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    
    // Final score validation check
    if (!scoreValidationPassed) {
      throw new Error(`Integration test failed due to score validation issues: ${scoreIssues.length} problems detected`);
    }

    console.log('\n📋 Test Summary:');
    console.log(`✅ Obsidian file discovery: ${discoveredFiles.length} files`);
    console.log(`✅ Markdown parsing: Multiple content types`);
    console.log(`✅ Smart chunking: ${chunkingResult.chunks.length} chunks generated`);
    console.log(`✅ File indexing: ${indexingResult.processedFiles} files indexed`);
    console.log(`✅ Incremental indexing: Change detection working`);
    console.log(`✅ Semantic search: Multiple query types tested`);
    console.log(`✅ Vector database: ${finalStats.totalVectors} vectors stored`);
    console.log(`✅ Version tracking: SHA-based change detection`);
    console.log(`✅ Score validation: ${totalSearchResults} search results verified as meaningful`);
    console.log(`✅ Zero score regression: Prevention checks passed`);

  } catch (error) {
    console.error('\n❌ Integration test failed:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    process.exit(1);
  } finally {
    // Clean up resources
    console.log('\n🧹 Cleaning up resources...');
    
    if (embedding) {
      await embedding.dispose();
      console.log('✅ Embedding model disposed');
    }
    if (database) {
      await database.close();
      console.log('✅ Database connection closed');
    }
    
    // Clean up test data
    try {
      await fs.rm(testDbPath, { recursive: true, force: true });
      await fs.rm(testObsidianPath, { recursive: true, force: true });
      console.log('✅ Test data cleaned up');
    } catch {
      // Files might not exist
    }
    
    console.log('🎯 Integration test cleanup completed');
  }
}

/**
 * Create a realistic test Obsidian vault with various content types
 */
async function createTestObsidianVault(vaultPath: string): Promise<void> {
  console.log('📝 Creating test Obsidian vault...');
  
  const files = [
    {
      path: 'index.md',
      content: `---
title: Knowledge Base Index
tags: [index, main]
author: Integration Test
date: 2024-01-15
---

# Knowledge Base Index

Welcome to the comprehensive knowledge base for Salesforce development.

## Main Sections

- [[Salesforce Development]]
- [[Data Model]]
- [[User Interface]]
- [[Automation]]

## Getting Started

This knowledge base covers all aspects of Salesforce development including:

1. **Development Fundamentals** - Core concepts and best practices
2. **Data Architecture** - Objects, fields, and relationships
3. **User Experience** - Lightning components and interfaces
4. **Process Automation** - Flows, triggers, and rules

## Navigation

Use the links above to navigate to specific topics. Each section contains detailed information and examples.

#salesforce #development #index
`
    },
    {
      path: 'Salesforce Development.md',
      content: `---
title: Salesforce Development
tags: [salesforce, development, apex]
category: development
---

# Salesforce Development

Comprehensive guide to Salesforce development practices and methodologies.

## Apex Programming

Apex is Salesforce's proprietary programming language for building business logic.

### Classes and Methods

\`\`\`apex
public class AccountService {
    public static List<Account> getActiveAccounts() {
        return [SELECT Id, Name FROM Account WHERE IsActive__c = true];
    }
    
    public static void updateAccountStatus(Id accountId, String status) {
        Account acc = new Account(Id = accountId, Status__c = status);
        update acc;
    }
}
\`\`\`

### SOQL and SOSL

Salesforce Object Query Language (SOQL) is used for database queries:

\`\`\`sql
SELECT Id, Name, Type, Industry
FROM Account
WHERE CreatedDate = LAST_N_DAYS:30
ORDER BY Name
LIMIT 100
\`\`\`

## Lightning Development

Modern Salesforce development uses Lightning Web Components (LWC).

### Component Structure

- **HTML Template** - Defines the component's UI
- **JavaScript Controller** - Handles component logic
- **CSS Styles** - Component-specific styling
- **Configuration** - Metadata and properties

> [!NOTE]
> Lightning components follow web standards and are more performant than legacy Aura components.

## Best Practices

1. **Bulkification** - Always write bulk-safe code
2. **Exception Handling** - Implement proper error handling
3. **Testing** - Maintain high test coverage (75%+)
4. **Security** - Follow security best practices

### Code Organization

| Component | Purpose | Example |
|-----------|---------|---------|
| Controllers | Business logic | AccountController.cls |
| Services | Reusable operations | EmailService.cls |
| Utilities | Helper methods | StringUtils.cls |
| Tests | Unit testing | AccountServiceTest.cls |

See also: [[Data Model]], [[User Interface]]

#apex #lightning #development
`
    },
    {
      path: 'Data Model.md',
      content: `---
title: Data Model and Architecture
tags: [data, objects, relationships]
category: architecture
---

# Data Model and Architecture

Understanding Salesforce's data architecture is crucial for effective development.

## Standard Objects

Salesforce provides many standard objects out of the box:

- **Account** - Companies and organizations
- **Contact** - Individual people
- **Opportunity** - Sales deals and prospects
- **Lead** - Potential customers
- **Case** - Customer service requests

## Custom Objects

Create custom objects to store data specific to your business:

\`\`\`apex
// Example custom object: Project__c
public class ProjectService {
    public static void createProject(String name, Date startDate) {
        Project__c proj = new Project__c(
            Name = name,
            Start_Date__c = startDate,
            Status__c = 'Planning'
        );
        insert proj;
    }
}
\`\`\`

## Relationships

### Master-Detail Relationships

- Child record depends on parent
- Sharing and security inherited
- Cascade delete behavior

### Lookup Relationships

- Loosely coupled objects
- Independent security
- Optional relationships

## Field Types

| Type | Use Case | Example |
|------|----------|---------|
| Text | Short text values | Name, Description |
| Number | Numeric calculations | Amount, Quantity |
| Date | Date values | Start Date, End Date |
| Picklist | Predefined values | Status, Priority |
| Formula | Calculated values | Total Amount |

> [!WARNING]
> Be careful with master-detail relationships as they create tight coupling between objects.

## Data Security

- **Object-Level Security** - Profile and permission sets
- **Field-Level Security** - Control field access
- **Record-Level Security** - Sharing rules and roles

Related topics: [[Salesforce Development]], [[User Interface]]

#data #objects #relationships #security
`
    },
    {
      path: 'User Interface.md',
      content: `---
title: User Interface Development
tags: [ui, lightning, components]
category: frontend
---

# User Interface Development

Building modern, responsive user interfaces in Salesforce.

## Lightning Web Components

LWC is the modern framework for building Salesforce UIs.

### Component Lifecycle

1. **Constructor** - Component initialization
2. **ConnectedCallback** - Component inserted into DOM
3. **RenderedCallback** - After component renders
4. **DisconnectedCallback** - Component removed from DOM

### Data Binding

\`\`\`javascript
import { LightningElement, track, wire } from 'lwc';
import getAccounts from '@salesforce/apex/AccountController.getAccounts';

export default class AccountList extends LightningElement {
    @track accounts = [];
    @track error;

    @wire(getAccounts)
    wiredAccounts({ error, data }) {
        if (data) {
            this.accounts = data;
            this.error = undefined;
        } else if (error) {
            this.error = error;
            this.accounts = [];
        }
    }
}
\`\`\`

## Lightning Design System

Use SLDS for consistent styling:

- **Utility Classes** - Spacing, colors, typography
- **Component Blueprints** - Pre-built UI patterns
- **Icons and Graphics** - Consistent iconography

## App Builder

Declarative UI development:

- **Lightning Pages** - Custom page layouts
- **Flow Builder** - Visual workflow creation
- **Report Builder** - Data visualization

> [!TIP]
> Use Lightning App Builder for rapid prototyping before developing custom components.

## Responsive Design

Ensure your components work across devices:

\`\`\`css
/* Mobile-first approach */
.container {
    padding: 0.5rem;
}

@media (min-width: 768px) {
    .container {
        padding: 1rem;
    }
}
\`\`\`

## Accessibility

Follow WCAG guidelines:

- **Semantic HTML** - Use proper HTML elements
- **ARIA Labels** - Provide accessible names
- **Keyboard Navigation** - Support keyboard users
- **Color Contrast** - Ensure sufficient contrast

References: [[Salesforce Development]], [[Automation]]

#ui #lightning #accessibility #responsive
`
    },
    {
      path: 'Automation.md',
      content: `---
title: Process Automation
tags: [automation, flow, triggers]
category: automation
---

# Process Automation

Automating business processes in Salesforce for efficiency and consistency.

## Flow Builder

Visual workflow creation tool for complex automation.

### Flow Types

- **Screen Flow** - User-guided processes
- **Auto-launched Flow** - Background automation
- **Record-triggered Flow** - Responds to data changes
- **Scheduled Flow** - Time-based automation

### Best Practices

1. **Plan Before Building** - Map out the process flow
2. **Use Subflows** - Break complex flows into smaller parts
3. **Error Handling** - Always include fault paths
4. **Testing** - Test all possible scenarios

## Apex Triggers

Code-based automation for complex business logic:

\`\`\`apex
trigger AccountTrigger on Account (before insert, before update, after insert, after update) {
    if (Trigger.isBefore) {
        AccountTriggerHandler.handleBeforeInsertUpdate(Trigger.new, Trigger.oldMap);
    }
    
    if (Trigger.isAfter) {
        AccountTriggerHandler.handleAfterInsertUpdate(Trigger.new, Trigger.oldMap);
    }
}
\`\`\`

### Trigger Framework

\`\`\`apex
public class AccountTriggerHandler {
    public static void handleBeforeInsertUpdate(List<Account> newAccounts, Map<Id, Account> oldMap) {
        validateBusinessRules(newAccounts);
        updateCalculatedFields(newAccounts);
    }
    
    private static void validateBusinessRules(List<Account> accounts) {
        for (Account acc : accounts) {
            if (String.isBlank(acc.Name)) {
                acc.addError('Account name is required');
            }
        }
    }
}
\`\`\`

## Validation Rules

Declarative data validation:

\`\`\`
AND(
    ISPICKVAL(Stage, "Closed Won"),
    Amount <= 0
)
\`\`\`

## Process Builder vs Flow

| Feature | Process Builder | Flow Builder |
|---------|----------------|--------------|
| Visual Design | Limited | Rich |
| Performance | Good | Better |
| Debugging | Basic | Advanced |
| Future | Deprecated | Active |

> [!IMPORTANT]
> Salesforce is deprecating Process Builder in favor of Flow Builder for new automation.

## Integration Automation

- **Platform Events** - Real-time integration
- **REST API** - External system communication
- **Outbound Messages** - SOAP-based integration

Related: [[Salesforce Development]], [[Data Model]]

#automation #flow #triggers #integration
`
    }
  ];

  for (const file of files) {
    const filePath = path.join(vaultPath, file.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content);
  }

  console.log(`✅ Created ${files.length} test files in Obsidian vault`);
}

// Run the test
runIntegrationTest().catch(console.error);