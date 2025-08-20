import { HeaderBasedChunker } from '../../src/obsidian/chunking/HeaderBasedChunker';
import { TokenCounter } from '../../src/obsidian/chunking/TokenCounter';
import { ContentPreserver } from '../../src/obsidian/chunking/ContentPreserver';
import { MarkdownParser } from '../../src/obsidian/parser/MarkdownParser';
import { ChunkStrategy } from '../../src/types/Common';
import { Logger } from '../../src/utils/Logger';
import { promises as fs } from 'fs';
import path from 'path';

describe('Phase 2.2 Integration with Salesforce Knowledge Base', () => {
  let chunker: HeaderBasedChunker;
  let contentPreserver: ContentPreserver;
  let markdownParser: MarkdownParser;
  let mockLogger: jest.Mocked<Logger>;

  const salesforceBasePath = '/Users/bri64/Documents/obsidian/Salesforce';

  const chunkStrategy: ChunkStrategy = {
    splitByHeaders: true,
    splitByParagraphs: true,
    maxTokens: 512,
    overlapTokens: 50,
    includeHeaders: true,
    preserveCodeBlocks: true,
    preserveTables: true,
    preserveCallouts: true,
  };

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as any;

    chunker = new HeaderBasedChunker(chunkStrategy, mockLogger);
    contentPreserver = new ContentPreserver(mockLogger);
    markdownParser = new MarkdownParser(mockLogger);
  });

  describe('real-world chunking scenarios', () => {
    it('should process Salesforce documentation files', async () => {
      const testFile = path.join(salesforceBasePath, 'Salesforce.md');
      
      // Check if file exists
      await fs.access(testFile);
      
      // Read and parse the main Salesforce index file
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content.length).toBeGreaterThan(0);

      // Parse the markdown
      const parsed = await markdownParser.parse(content);
      expect(parsed).toBeDefined();
      expect(parsed.content).toBeDefined();

      // Test chunking
      const chunkResult = await chunker.chunk(parsed, 'Salesforce.md');
      
      expect(chunkResult.chunks.length).toBeGreaterThan(0);
      expect(chunkResult.totalTokens).toBeGreaterThan(0);
      expect(chunkResult.warnings).toBeDefined();

      // Verify chunk quality
      for (const chunk of chunkResult.chunks) {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.tokens).toBeGreaterThan(0);
        expect(chunk.tokens).toBeLessThanOrEqual(chunkStrategy.maxTokens * 1.2); // Allow 20% variance
        expect(chunk.metadata).toBeDefined();
        expect(chunk.sourceFile).toBe('Salesforce.md');
      }

      console.log(`Successfully chunked Salesforce.md into ${chunkResult.chunks.length} chunks`);
    });

    it('should handle files with complex markdown features', async () => {
      // Look for files with various markdown features
      const testFiles = [
        'Examples.md',
        'Why Salesforce.md',
        'Apex/Apex.md',
        'LWC/LWC.md',
      ];

      for (const relativeFile of testFiles) {
        const testFile = path.join(salesforceBasePath, relativeFile);

        await fs.access(testFile);
        
        const content = await fs.readFile(testFile, 'utf-8');
        if (content.length === 0) continue;

        // Test content preservation
        const preservationResult = contentPreserver.preserveContent(content);
        expect(preservationResult).toBeDefined();

        // Test parsing
        const parsed = await markdownParser.parse(content);
        expect(parsed).toBeDefined();

        // Test chunking
        const chunkResult = await chunker.chunk(parsed, relativeFile);
        expect(chunkResult.chunks.length).toBeGreaterThan(0);

        // Verify WikiLinks are preserved in metadata
        const chunksWithWikiLinks = chunkResult.chunks.filter(c => c.metadata.wikiLinkTargets.length > 0);
        
        if (content.includes('[[') && content.includes(']]')) {
          expect(chunksWithWikiLinks.length).toBeGreaterThan(0);
          // Verify that extracted targets are non-empty strings
          chunksWithWikiLinks.forEach(chunk => {
            expect(chunk.metadata.wikiLinkTargets).toEqual(
              expect.arrayContaining([expect.any(String)])
            );
          });
        }

        console.log(`Successfully processed ${relativeFile}: ${chunkResult.chunks.length} chunks`);
      }
    });

    it('should maintain reasonable token counts across documents', async () => {
      const testFiles = [
        'Salesforce.md',
        'Examples.md',
      ];

      const allTokenCounts: number[] = [];

      for (const relativeFile of testFiles) {
        const testFile = path.join(salesforceBasePath, relativeFile);
        
        try {
          await fs.access(testFile);
          
          const content = await fs.readFile(testFile, 'utf-8');
          if (content.length === 0) continue;

          const parsed = await markdownParser.parse(content);
          const chunkResult = await chunker.chunk(parsed, relativeFile);

          for (const chunk of chunkResult.chunks) {
            allTokenCounts.push(chunk.tokens);
          }

        } catch (error) {
          if ((error as any).code !== 'ENOENT') {
            console.warn(`Could not process ${relativeFile}:`, error);
          }
        }
      }

      if (allTokenCounts.length > 0) {
        const avgTokens = allTokenCounts.reduce((a, b) => a + b, 0) / allTokenCounts.length;
        const maxTokens = Math.max(...allTokenCounts);
        const minTokens = Math.min(...allTokenCounts);

        console.log(`Token statistics: avg=${Math.round(avgTokens)}, min=${minTokens}, max=${maxTokens}`);

        // Most chunks should be within reasonable bounds
        const reasonableChunks = allTokenCounts.filter(t => t >= 50 && t <= chunkStrategy.maxTokens * 1.5);
        const reasonablePercentage = reasonableChunks.length / allTokenCounts.length;

        expect(reasonablePercentage).toBeGreaterThan(0.8); // 80% should be reasonable
        expect(maxTokens).toBeLessThan(chunkStrategy.maxTokens * 2); // No chunk should be more than 2x limit
      }
    });

    it('should preserve document structure in chunk hierarchy', async () => {
      const testFile = path.join(salesforceBasePath, 'Apex/Apex.md');

      await fs.access(testFile);
      
      const content = await fs.readFile(testFile, 'utf-8');
      if (content.length === 0) return;

      const parsed = await markdownParser.parse(content);
      const chunkResult = await chunker.chunk(parsed, 'Apex/Apex.md');

      // Check that chunks with headers maintain hierarchy
      const chunksWithHeaders = chunkResult.chunks.filter(c => c.headers.length > 0);
      
      if (chunksWithHeaders.length > 0) {
        for (const chunk of chunksWithHeaders) {
          expect(chunk.headers).toBeDefined();
          expect(Array.isArray(chunk.headers)).toBe(true);
          
          // Headers should not be empty strings
          for (const header of chunk.headers) {
            expect(header.length).toBeGreaterThan(0);
          }
        }

        console.log(`Processed Apex.md with hierarchical structure: ${chunksWithHeaders.length} chunks with headers`);
      }
    });

    it('should handle different token counting strategies consistently', async () => {
      const testFile = path.join(salesforceBasePath, 'Salesforce.md');

      await fs.access(testFile);
      
      const content = await fs.readFile(testFile, 'utf-8');
      if (content.length === 0) return;

      // Test with different token counting strategies
      const strategies = ['simple', 'whitespace', 'gpt-estimate'] as const;
      const results: Record<string, number> = {};

      for (const strategy of strategies) {
        const counter = new TokenCounter({ strategy });
        const tokens = counter.countTokens(content);
        results[strategy] = tokens;
      }

      // All strategies should return reasonable token counts
      for (const [strategy, tokens] of Object.entries(results)) {
        expect(tokens).toBeGreaterThan(0);
        expect(tokens).toBeLessThan(content.length); // Should be less than character count
        console.log(`${strategy} strategy: ${tokens} tokens`);
      }

      // Strategies should be in reasonable relationship to each other
      expect(results.simple).toBeDefined();
      expect(results.whitespace).toBeDefined();
      expect(results['gpt-estimate']).toBeDefined();
    });
  });

  describe('content preservation in real documents', () => {
    it('should identify and preserve code blocks in documentation', async () => {
      const testFile = path.join(salesforceBasePath, 'Examples.md');

      await fs.access(testFile);
      
      const content = await fs.readFile(testFile, 'utf-8');
      if (content.length === 0) return;

      const preservationResult = contentPreserver.preserveContent(content);
      
      if (content.includes('```') || content.includes('`')) {
        expect(preservationResult.preservedBlocks.length).toBeGreaterThan(0);
        
        const codeBlocks = preservationResult.preservedBlocks.filter(b => b.type === 'code');
        expect(codeBlocks.length).toBeGreaterThan(0);

        console.log(`Found ${codeBlocks.length} code blocks in Examples.md`);
      }
    });

    it('should preserve tables and structured content', async () => {
      // Look for files that might contain tables
      const possibleTableFiles = [
        'Salesforce.md',
        'Why Salesforce.md',
        'Examples.md',
      ];

      for (const relativeFile of possibleTableFiles) {
        const testFile = path.join(salesforceBasePath, relativeFile);
        
        try {
          await fs.access(testFile);
          
          const content = await fs.readFile(testFile, 'utf-8');
          if (content.length === 0) continue;

          const preservationResult = contentPreserver.preserveContent(content);
          
          if (content.includes('|') && content.includes('---')) {
            const tables = preservationResult.preservedBlocks.filter(b => b.type === 'table');
            if (tables.length > 0) {
              console.log(`Found ${tables.length} tables in ${relativeFile}`);
              
              for (const table of tables) {
                expect(table.metadata).toBeDefined();
                expect(table.metadata?.rows).toBeGreaterThan(0);
                expect(table.metadata?.columns).toBeGreaterThan(0);
              }
            }
          }

        } catch (error) {
          if ((error as any).code !== 'ENOENT') {
            console.warn(`Could not process ${relativeFile} for table test:`, error);
          }
        }
      }
    });
  });

  describe('performance characteristics', () => {
    it('should process documents efficiently', async () => {
      const testFile = path.join(salesforceBasePath, 'Salesforce.md');
      
      await fs.access(testFile);
      
      const content = await fs.readFile(testFile, 'utf-8');
      if (content.length === 0) return;

      const startTime = Date.now();
      
      const parsed = await markdownParser.parse(content);
      const chunkResult = await chunker.chunk(parsed, 'Salesforce.md');
      
      const processingTime = Date.now() - startTime;
      
      // Processing should be reasonably fast
      expect(processingTime).toBeLessThan(10000); // Less than 10 seconds
      
      // Should have reasonable processing metrics
      expect(chunkResult.processingTime).toBeGreaterThanOrEqual(0);
      expect(chunkResult.processingTime).toBeLessThanOrEqual(processingTime);

      console.log(`Processed Salesforce.md in ${processingTime}ms (${chunkResult.chunks.length} chunks)`);
    });
  });
});