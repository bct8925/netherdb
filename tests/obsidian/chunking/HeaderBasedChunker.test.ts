import { HeaderBasedChunker } from '../../../src/obsidian/chunking/HeaderBasedChunker';
import { ChunkStrategy } from '../../../src/types/Common';
import { Logger } from '../../../src/utils/Logger';

// Create a test interface that extends the actual ParsedMarkdown with test fields
interface TestParsedDocument {
  raw: string;
  content: string;
  frontmatter: any;
  hasFrontmatter: boolean;
  // Test-specific fields that match the full MarkdownParser interface
  wikiLinks: any[];
  tags: string[];
  tagReferences: any[];
  processedContent: string;
  html: string;
  plainText: string;
  metadata: {
    title?: string;
    description?: string;
    tags: string[];
    date?: Date;
    author?: string;
    wordCount: number;
    readingTime: number;
    headings: Array<{ level: number; text: string; anchor: string; position: number }>;
    links: any[];
    isHidden: boolean;
    custom: Record<string, any>;
  };
}

describe('HeaderBasedChunker', () => {
  let chunker: HeaderBasedChunker;
  let mockLogger: jest.Mocked<Logger>;

  const defaultStrategy: ChunkStrategy = {
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
    } as any;

    chunker = new HeaderBasedChunker(defaultStrategy, mockLogger);
  });

  describe('chunk', () => {
    it('should chunk document by headers', async () => {
      const content = `# Main Title

This is the introduction paragraph.

## Section One

Content for section one with multiple paragraphs.

Second paragraph in section one.

## Section Two

Content for section two.

### Subsection

Subsection content here.

## Section Three

Final section content.`;

      const document: TestParsedDocument = {
        raw: content,
        content: content,
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: [],
        tags: [],
        tagReferences: [],
        processedContent: content,
        html: '',
        plainText: content,
        metadata: {
          tags: [],
          wordCount: 45,
          readingTime: 1,
          links: [],
          headings: [
            { level: 1, text: 'Main Title', anchor: 'main-title', position: 0 },
            { level: 2, text: 'Section One', anchor: 'section-one', position: 2 },
            { level: 2, text: 'Section Two', anchor: 'section-two', position: 4 },
            { level: 3, text: 'Subsection', anchor: 'subsection', position: 6 },
            { level: 2, text: 'Section Three', anchor: 'section-three', position: 8 },
          ],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunker.chunk(document as any, 'test.md');

      expect(result.chunks.length).toBeGreaterThan(1);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.chunkingStrategy).toEqual(defaultStrategy);
      expect(result.warnings).toBeDefined();

      // Check chunk structure
      for (const chunk of result.chunks) {
        expect(chunk.id).toBeDefined();
        expect(chunk.content).toBeDefined();
        expect(chunk.tokens).toBeGreaterThan(0);
        expect(chunk.sourceFile).toBe('test.md');
        expect(chunk.metadata).toBeDefined();
        expect(chunk.metadata.type).toBeDefined();
      }
    });

    it('should handle document without headers', async () => {
      const content = `This is a simple document without any headers.

It has multiple paragraphs of content.

But no heading structure to split on.`;

      const document: TestParsedDocument = {
        raw: content,
        content: content,
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: [],
        tags: [],
        tagReferences: [],
        processedContent: content,
        html: '',
        plainText: content,
        metadata: {
          tags: [],
          wordCount: 20,
          readingTime: 1,
          links: [],
          headings: [],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunker.chunk(document as any, 'simple.md');

      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0]!.content).toBe(content);
      expect(result.chunks[0]!.headers).toEqual([]);
    });

    it('should split large sections that exceed token limit', async () => {
      // Create content that exceeds token limit
      const longContent = 'This is a very long paragraph. '.repeat(100); // ~500+ tokens
      
      const content = `# Large Section

${longContent}

More content that continues the section.

${longContent}

Even more content in this section.`;

      const document: TestParsedDocument = {
        raw: content,
        content: content,
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: [],
        tags: [],
        tagReferences: [],
        processedContent: content,
        html: '',
        plainText: content,
        metadata: {
          tags: [],
          wordCount: 400,
          readingTime: 2,
          links: [],
          headings: [
            { level: 1, text: 'Large Section', anchor: 'large-section', position: 0 },
          ],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunker.chunk(document as any, 'large.md');

      // Should create multiple chunks due to size
      expect(result.chunks.length).toBeGreaterThan(1);
      
      // Each chunk should be within token limit
      for (const chunk of result.chunks) {
        expect(chunk.tokens).toBeLessThanOrEqual(defaultStrategy.maxTokens);
      }
    });

    it('should preserve header hierarchy in chunks', async () => {
      const content = `# Main Title

Introduction content.

## Section A

Content for section A.

### Subsection A1

Content for subsection A1.

### Subsection A2

Content for subsection A2.

## Section B

Content for section B.`;

      const document: TestParsedDocument = {
        raw: content,
        content: content,
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: [],
        tags: [],
        tagReferences: [],
        processedContent: content,
        html: '',
        plainText: content,
        metadata: {
          tags: [],
          wordCount: 30,
          readingTime: 1,
          links: [],
          headings: [
            { level: 1, text: 'Main Title', anchor: 'main-title', position: 0 },
            { level: 2, text: 'Section A', anchor: 'section-a', position: content.indexOf('## Section A') },
            { level: 3, text: 'Subsection A1', anchor: 'subsection-a1', position: content.indexOf('### Subsection A1') },
            { level: 3, text: 'Subsection A2', anchor: 'subsection-a2', position: content.indexOf('### Subsection A2') },
            { level: 2, text: 'Section B', anchor: 'section-b', position: content.indexOf('## Section B') },
          ],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunker.chunk(document as any, 'hierarchy.md');

      // Find chunk for subsection A1
      const subsectionChunk = result.chunks.find(c => 
        c.content.includes('Subsection A1')
      );

      expect(subsectionChunk).toBeDefined();
      expect(subsectionChunk!.headers).toContain('Subsection A1');
    });

    it('should handle empty content gracefully', async () => {
      const document: TestParsedDocument = {
        raw: '',
        content: '',
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: [],
        tags: [],
        tagReferences: [],
        processedContent: '',
        html: '',
        plainText: '',
        metadata: {
          tags: [],
          wordCount: 0,
          readingTime: 0,
          links: [],
          headings: [],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunker.chunk(document as any, 'empty.md');

      expect(result.chunks).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
      expect(result.warnings).toContain('Document has no content to chunk');
    });

    it('should detect different chunk types correctly', async () => {
      const content = `# Code Example

Here's some regular text.

\`\`\`javascript
function hello() {
  console.log('Hello, World!');
}
\`\`\`

## Table Section

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

## Callout Section

> [!info] Information
> This is an informational callout.

Regular paragraph content.`;

      const document: TestParsedDocument = {
        raw: content,
        content: content,
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: [],
        tags: [],
        tagReferences: [],
        processedContent: content,
        html: '',
        plainText: content,
        metadata: {
          tags: [],
          wordCount: 50,
          readingTime: 1,
          links: [],
          headings: [
            { level: 1, text: 'Code Example', anchor: 'code-example', position: 0 },
            { level: 2, text: 'Table Section', anchor: 'table-section', position: 2 },
            { level: 2, text: 'Callout Section', anchor: 'callout-section', position: 4 },
          ],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunker.chunk(document as any, 'types.md');

      expect(result.chunks.length).toBeGreaterThan(0);

      // Check that chunks have appropriate metadata flags
      const chunks = result.chunks;
      const hasCodeChunk = chunks.some(c => c.metadata.hasCodeBlocks);
      const hasTableChunk = chunks.some(c => c.metadata.hasTables);
      const hasCalloutChunk = chunks.some(c => c.metadata.hasCallouts);

      expect(hasCodeChunk).toBe(true);
      expect(hasTableChunk).toBe(true);
      expect(hasCalloutChunk).toBe(true);
    });

    it('should link chunks together', async () => {
      const content = `# Section One

Content for section one.

# Section Two

Content for section two.

# Section Three

Content for section three.`;

      const document: TestParsedDocument = {
        raw: content,
        content: content,
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: [],
        tags: [],
        tagReferences: [],
        processedContent: content,
        html: '',
        plainText: content,
        metadata: {
          tags: [],
          wordCount: 18,
          readingTime: 1,
          links: [],
          headings: [
            { level: 1, text: 'Section One', anchor: 'section-one', position: 0 },
            { level: 1, text: 'Section Two', anchor: 'section-two', position: 2 },
            { level: 1, text: 'Section Three', anchor: 'section-three', position: 4 },
          ],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunker.chunk(document as any, 'linked.md');

      expect(result.chunks.length).toBeGreaterThanOrEqual(3);

      // Check linking
      const firstChunk = result.chunks[0]!;
      const middleChunk = result.chunks[1]!;
      const lastChunk = result.chunks[result.chunks.length - 1]!;

      expect(firstChunk.previousChunkId).toBeUndefined();
      expect(firstChunk.nextChunkId).toBeDefined();

      expect(middleChunk.previousChunkId).toBeDefined();
      expect(middleChunk.nextChunkId).toBeDefined();

      expect(lastChunk.previousChunkId).toBeDefined();
      expect(lastChunk.nextChunkId).toBeUndefined();
    });

    it('should respect chunking strategy options', async () => {
      const customStrategy: ChunkStrategy = {
        splitByHeaders: false,
        splitByParagraphs: true,
        maxTokens: 100, // Very small for testing
        overlapTokens: 0,
        includeHeaders: false,
        preserveCodeBlocks: false,
        preserveTables: false,
        preserveCallouts: false,
      };

      const chunkerCustom = new HeaderBasedChunker(customStrategy);

      const content = `# Header Should Be Ignored

This is paragraph one with enough content to exceed token limit. This paragraph has been made longer to ensure it exceeds the 100 token limit when combined with other content. We need to make sure this is substantial enough to trigger splitting.

This is paragraph two with more content. This paragraph also needs to be longer so that when combined with the first paragraph, it will definitely exceed the 100 token limit and force the chunker to split the content into multiple chunks.

This is paragraph three with even more content. This final paragraph adds additional content to ensure that we have enough total content to create multiple chunks when the token limit is only 100 tokens.`;

      const document: TestParsedDocument = {
        raw: content,
        content: content,
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: [],
        tags: [],
        tagReferences: [],
        processedContent: content,
        html: '',
        plainText: content,
        metadata: {
          tags: [],
          wordCount: 150,
          readingTime: 1,
          links: [],
          headings: [
            { level: 1, text: 'Header Should Be Ignored', anchor: 'header', position: 0 },
          ],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunkerCustom.chunk(document, 'custom.md');

      // Should create multiple small chunks
      expect(result.chunks.length).toBeGreaterThan(1);
      
      // Each chunk should be within custom token limit
      for (const chunk of result.chunks) {
        expect(chunk.tokens).toBeLessThanOrEqual(customStrategy.maxTokens);
      }

      // Headers should not be included in chunk headers
      for (const chunk of result.chunks) {
        expect(chunk.headers).toEqual([]);
      }
    });

    it('should extract WikiLink targets in chunk metadata', async () => {
      const content = `# Generic Types

Reference [[Map<K,V>]] and [[List<T>]] for collections.
Also see [[Data Type: String]] for text handling.

## Advanced Types

Check [[Optional<T>]] and [[Result<T,E>]] patterns.`;

      const wikiLinks = [
        { original: '[[Map<K,V>]]', target: 'Map<K,V>', position: { start: 10, end: 22 }, isEmbed: false },
        { original: '[[List<T>]]', target: 'List<T>', position: { start: 27, end: 38 }, isEmbed: false },
        { original: '[[Data Type: String]]', target: 'Data Type: String', position: { start: 55, end: 76 }, isEmbed: false },
        { original: '[[Optional<T>]]', target: 'Optional<T>', position: { start: 105, end: 120 }, isEmbed: false },
        { original: '[[Result<T,E>]]', target: 'Result<T,E>', position: { start: 125, end: 140 }, isEmbed: false },
      ];

      const document: TestParsedDocument = {
        raw: content,
        content: content,
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: wikiLinks,
        tags: [],
        tagReferences: [],
        processedContent: content,
        html: '',
        plainText: content,
        metadata: {
          tags: [],
          wordCount: 50,
          readingTime: 1,
          links: [],
          headings: [
            { level: 1, text: 'Generic Types', anchor: 'generic-types', position: 0 },
            { level: 2, text: 'Advanced Types', anchor: 'advanced-types', position: 100 },
          ],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunker.chunk(document as any, 'types.md');

      expect(result.chunks.length).toBeGreaterThan(0);
      
      // Find chunks with WikiLinks
      const chunksWithWikiLinks = result.chunks.filter(chunk => 
        chunk.metadata.wikiLinkTargets && chunk.metadata.wikiLinkTargets.length > 0
      );
      
      expect(chunksWithWikiLinks.length).toBeGreaterThan(0);
      
      // Check that WikiLink targets are preserved with special characters
      const allTargets = chunksWithWikiLinks.flatMap(chunk => chunk.metadata.wikiLinkTargets);
      
      // Should contain at least some of our special character WikiLinks
      expect(allTargets.some(target => target.includes('<') && target.includes('>'))).toBe(true);
      
      // Specifically check for angle bracket preservation
      const angleTargets = allTargets.filter(target => target.includes('<') && target.includes('>'));
      expect(angleTargets.length).toBeGreaterThan(0);
      
      // Ensure no targets were corrupted (no dashes replacing special chars)
      allTargets.forEach(target => {
        expect(target).not.toMatch(/-K,V-/);
        expect(target).not.toMatch(/-T-/);
        expect(target).not.toMatch(/- /);
      });
    });

    it('should handle empty WikiLink arrays', async () => {
      const content = `# Regular Content

Just regular text without any WikiLinks.`;

      const document: TestParsedDocument = {
        raw: content,
        content: content,
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: [], // No WikiLinks
        tags: [],
        tagReferences: [],
        processedContent: content,
        html: '',
        plainText: content,
        metadata: {
          tags: [],
          wordCount: 20,
          readingTime: 1,
          links: [],
          headings: [
            { level: 1, text: 'Regular Content', anchor: 'regular-content', position: 0 },
          ],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunker.chunk(document as any, 'regular.md');

      expect(result.chunks.length).toBeGreaterThan(0);
      
      // All chunks should have empty wikiLinkTargets arrays
      result.chunks.forEach(chunk => {
        expect(chunk.metadata.wikiLinkTargets).toEqual([]);
      });
    });
  });

  describe('token estimation', () => {
    it('should provide reasonable token estimates', async () => {
      const content = 'This is a test sentence with eight words exactly.';
      
      const document: TestParsedDocument = {
        raw: content,
        content: content,
        frontmatter: {},
        hasFrontmatter: false,
        wikiLinks: [],
        tags: [],
        tagReferences: [],
        processedContent: content,
        html: '',
        plainText: content,
        metadata: {
          tags: [],
          wordCount: 8,
          readingTime: 1,
          links: [],
          headings: [],
          isHidden: false,
          custom: {},
        },
      };

      const result = await chunker.chunk(document as any, 'tokens.md');

      expect(result.chunks).toHaveLength(1);
      
      const chunk = result.chunks[0]!;
      // Should be roughly 8-16 tokens for this content
      expect(chunk.tokens).toBeGreaterThan(5);
      expect(chunk.tokens).toBeLessThan(20);
    });
  });
});