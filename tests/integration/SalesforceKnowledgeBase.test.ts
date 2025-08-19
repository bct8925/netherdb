import { ObsidianManager } from '../../src/obsidian/indexing/ObsidianManager';
import { MarkdownParser } from '../../src/obsidian/parser/MarkdownParser';
import { Logger } from '../../src/utils/Logger';
import path from 'path';

describe('Salesforce Knowledge Base Integration', () => {
  let obsidianManager: ObsidianManager;
  let markdownParser: MarkdownParser;
  const salesforceKnowledgeBase = path.resolve('/Users/bri64/Documents/obsidian');

  beforeAll(async () => {
    const logger = new Logger('IntegrationTest');
    obsidianManager = new ObsidianManager(salesforceKnowledgeBase, undefined, logger);
    markdownParser = new MarkdownParser(logger);
    
    await obsidianManager.initialize();
  });

  it('should discover Salesforce markdown files', async () => {
    const files = await obsidianManager.discoverFiles({
      fileExtensions: ['.md'],
      includeHidden: false,
      ignorePaths: ['node_modules', '.git', 'dist', 'build', '.obsidian', 'netherdb'],
    });

    expect(files.length).toBeGreaterThan(0);
    
    // Should find the main Salesforce index file
    const salesforceIndex = files.find(f => f.path.includes('Salesforce') && f.name === 'Salesforce');
    expect(salesforceIndex).toBeDefined();
    
    console.log(`Discovered ${files.length} markdown files in Salesforce knowledge base`);
    console.log('Sample files:', files.slice(0, 5).map(f => f.path));
  });

  it('should parse Salesforce documentation with WikiLinks', async () => {
    // Find a Salesforce documentation file
    const files = await obsidianManager.discoverFiles({
      fileExtensions: ['.md'],
      includeHidden: false,
      ignorePaths: ['node_modules', '.git', 'dist', 'build', '.obsidian', 'netherdb'],
    });

    const salesforceFile = files.find(f => 
      f.path.includes('Salesforce') && 
      f.isMarkdown && 
      f.size > 100 // Find a file with actual content
    );

    if (!salesforceFile) {
      console.log('No suitable Salesforce file found for parsing test');
      return;
    }

    const fs = require('fs');
    const content = fs.readFileSync(salesforceFile.absolutePath, 'utf-8');
    
    const parsed = await markdownParser.parse(content);

    console.log(`Parsed file: ${salesforceFile.path}`);
    console.log(`Content length: ${content.length} characters`);
    console.log(`WikiLinks found: ${parsed.wikiLinks.length}`);
    console.log(`Tags found: ${parsed.tags.length}`);
    console.log(`Has frontmatter: ${parsed.hasFrontmatter}`);
    console.log(`Word count: ${parsed.metadata.wordCount}`);
    console.log(`Headings found: ${parsed.metadata.headings.length}`);

    // Verify the parser works with real Salesforce content
    expect(parsed.content).toBeDefined();
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.wordCount).toBeGreaterThan(0);
    
    if (parsed.wikiLinks.length > 0) {
      console.log('Sample WikiLinks:', parsed.wikiLinks.slice(0, 3).map(link => link.target));
    }
    
    if (parsed.tags.length > 0) {
      console.log('Sample tags:', parsed.tags.slice(0, 5));
    }
  });

  it('should handle Salesforce-specific patterns', async () => {
    // Test with a known Salesforce content pattern
    const salesforceContent = `---
title: Apex Classes
tags: [salesforce, apex, development]
---

# Apex Classes

Apex classes are the main building blocks of Salesforce applications.

## Key Concepts

- Classes define [[Object-Oriented Programming]] patterns
- They can implement [[Interfaces]] and extend other classes
- Access modifiers control [[Security]] and visibility

## Example

\`\`\`apex
public class MyClass {
    public void doSomething() {
        System.debug('Hello World');
    }
}
\`\`\`

See also:
- [[Triggers]]
- [[Governor Limits]]
- [[Test Classes]]

#apex #programming #salesforce-development`;

    const parsed = await markdownParser.parse(salesforceContent);

    // Verify Salesforce-specific parsing
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter.title).toBe('Apex Classes');
    expect(parsed.frontmatter.tags).toContain('salesforce');
    
    // Check WikiLinks extraction
    expect(parsed.wikiLinks.length).toBeGreaterThan(0);
    const wikiLinkTargets = parsed.wikiLinks.map(link => link.target);
    expect(wikiLinkTargets).toContain('Object-Oriented Programming');
    expect(wikiLinkTargets).toContain('Interfaces');
    expect(wikiLinkTargets).toContain('Security');
    
    // Check tags (from frontmatter and inline)
    expect(parsed.tags).toContain('salesforce');
    expect(parsed.tags).toContain('apex');
    expect(parsed.tags).toContain('programming');
    expect(parsed.tags).toContain('salesforce-development');
    
    // Check headings
    expect(parsed.metadata.headings.length).toBeGreaterThan(0);
    const headingTexts = parsed.metadata.headings.map(h => h.text);
    expect(headingTexts).toContain('Apex Classes');
    expect(headingTexts).toContain('Key Concepts');
    
    console.log('Successfully parsed Salesforce-specific content patterns');
  });

  it('should track repository status for knowledge base', async () => {
    const status = await obsidianManager.getRepositoryStatus();

    console.log('Repository status:', {
      isGitRepo: status.isGitRepo,
      currentSHA: status.currentSHA?.substring(0, 8) + '...',
      isClean: status.isClean,
      needsReindexing: status.needsReindexing,
      lastIndexedSHA: status.lastIndexedSHA?.substring(0, 8) + '...' || 'none',
    });

    expect(status.isGitRepo).toBe(true);
    expect(status.currentSHA).toBeTruthy();
    expect(typeof status.isClean).toBe('boolean');
    expect(typeof status.needsReindexing).toBe('boolean');
  });

  it('should get vault statistics', async () => {
    const stats = await obsidianManager.getVaultStats({
      fileExtensions: ['.md'],
      ignorePaths: ['node_modules', '.git', 'dist', 'build', '.obsidian', 'netherdb'],
    });

    console.log('Vault statistics:', {
      totalFiles: stats.totalFiles,
      markdownFiles: stats.markdownFiles,
      totalSizeMB: Math.round(stats.totalSize / (1024 * 1024) * 100) / 100,
      filesByExtension: Object.fromEntries(stats.filesByExtension),
    });

    expect(stats.totalFiles).toBeGreaterThan(0);
    expect(stats.markdownFiles).toBeGreaterThan(0);
    expect(stats.totalSize).toBeGreaterThan(0);
    expect(stats.filesByExtension.get('.md')).toBeGreaterThan(0);
  });
});