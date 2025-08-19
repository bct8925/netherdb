import { ContentPreserver } from '../../../src/obsidian/chunking/ContentPreserver';
import { Logger } from '../../../src/utils/Logger';

describe('ContentPreserver', () => {
  let preserver: ContentPreserver;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    preserver = new ContentPreserver(mockLogger);
  });

  describe('preserveContent', () => {
    it('should preserve code blocks', () => {
      const content = `Here's some text.

\`\`\`javascript
function hello() {
  console.log('Hello, World!');
}
\`\`\`

More text here.

Inline \`code\` should also be preserved.`;

      const result = preserver.preserveContent(content);

      expect(result.preservedBlocks.length).toBe(2); // Fenced + inline code
      expect(result.placeholders.size).toBe(2);
      
      const codeBlock = result.preservedBlocks.find(b => b.type === 'code' && b.content.includes('function'));
      expect(codeBlock).toBeDefined();
      expect(codeBlock!.metadata?.language).toBe('javascript');
      
      const inlineCode = result.preservedBlocks.find(b => b.type === 'code' && b.content === '`code`');
      expect(inlineCode).toBeDefined();
    });

    it('should preserve markdown tables', () => {
      const content = `Here's a table:

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |

End of table.`;

      const result = preserver.preserveContent(content);

      expect(result.preservedBlocks.length).toBe(1);
      expect(result.preservedBlocks[0]!.type).toBe('table');
      expect(result.preservedBlocks[0]!.metadata?.rows).toBe(3); // Including all table rows
      expect(result.preservedBlocks[0]!.metadata?.columns).toBe(3); // Pipe count - 1
    });

    it('should preserve Obsidian callouts', () => {
      const content = `Regular text here.

> [!info] Information Callout
> This is important information
> that spans multiple lines.

> [!warning] Warning
> Be careful with this!

More text.`;

      const result = preserver.preserveContent(content);

      expect(result.preservedBlocks.length).toBe(2);
      
      const infoCallout = result.preservedBlocks.find(b => 
        b.content.includes('[!info]')
      );
      expect(infoCallout).toBeDefined();
      expect(infoCallout!.type).toBe('callout');
      expect(infoCallout!.metadata?.calloutType).toBe('info');
      
      const warningCallout = result.preservedBlocks.find(b => 
        b.content.includes('[!warning]')
      );
      expect(warningCallout).toBeDefined();
      expect(warningCallout!.metadata?.calloutType).toBe('warning');
    });

    it('should preserve math blocks', () => {
      const content = `Here's some math:

$$
E = mc^2
$$

And inline math: $x = y + z$.

More content.`;

      const result = preserver.preserveContent(content);

      expect(result.preservedBlocks.length).toBe(1); // Only block math, inline math is shorter
      expect(result.preservedBlocks[0]!.type).toBe('math');
      expect(result.preservedBlocks[0]!.content).toContain('E = mc^2');
    });

    it('should preserve images', () => {
      const content = `Text with images:

![[diagram.png]]

![Alt text](image.jpg)

![[folder/image.png|Custom Caption]]

More text.`;

      const result = preserver.preserveContent(content);

      expect(result.preservedBlocks.length).toBe(3);
      
      const obsidianEmbed = result.preservedBlocks.find(b => 
        b.content.includes('[[diagram.png]]')
      );
      expect(obsidianEmbed).toBeDefined();
      expect(obsidianEmbed!.type).toBe('image');
      expect(obsidianEmbed!.metadata?.fileName).toBe('diagram.png');
      
      const markdownImage = result.preservedBlocks.find(b => 
        b.content.includes('![Alt text]')
      );
      expect(markdownImage).toBeDefined();
      expect(markdownImage!.metadata?.altText).toBe('Alt text');
      expect(markdownImage!.metadata?.url).toBe('image.jpg');
    });

    it('should handle complex mixed content', () => {
      const content = `# Complex Document

Here's mixed content:

\`\`\`python
def calculate():
    return 42
\`\`\`

| Feature | Status |
|---------|--------|
| Code    | ✓      |
| Tables  | ✓      |

> [!note] Important
> This is a callout with \`inline code\`.

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

![[chart.png|Chart]]

Regular text continues.`;

      const result = preserver.preserveContent(content);

      expect(result.preservedBlocks.length).toBeGreaterThan(4);
      
      const types = new Set(result.preservedBlocks.map(b => b.type));
      expect(types).toContain('code');
      expect(types).toContain('table');
      expect(types).toContain('callout');
      expect(types).toContain('math');
      expect(types).toContain('image');
    });

    it('should handle empty content', () => {
      const result = preserver.preserveContent('');
      
      expect(result.preservedBlocks).toHaveLength(0);
      expect(result.placeholders.size).toBe(0);
      expect(result.processedContent).toBe('');
    });

    it('should handle content without special blocks', () => {
      const content = 'Just regular markdown text with **bold** and *italic* formatting.';
      
      const result = preserver.preserveContent(content);
      
      expect(result.preservedBlocks).toHaveLength(0);
      expect(result.processedContent).toBe(content);
    });
  });

  describe('restoreContent', () => {
    it('should restore preserved content from placeholders', () => {
      const originalContent = `Text with code:

\`\`\`javascript
console.log('test');
\`\`\`

And a table:

| A | B |
|---|---|
| 1 | 2 |

End.`;

      const preserved = preserver.preserveContent(originalContent);
      const restored = preserver.restoreContent(
        preserved.processedContent,
        preserved.placeholders
      );

      expect(restored).toBe(originalContent);
    });

    it('should handle partial restoration', () => {
      const content = 'Code: `test` and more code: `another`';
      
      const preserved = preserver.preserveContent(content);
      expect(preserved.placeholders.size).toBe(2);
      
      // Remove one placeholder manually
      const placeholderKeys = Array.from(preserved.placeholders.keys());
      const firstKey = placeholderKeys[0]!;
      preserved.placeholders.delete(firstKey);
      
      const restored = preserver.restoreContent(
        preserved.processedContent,
        preserved.placeholders
      );
      
      // Should still have one placeholder unreplaced
      expect(restored).toContain('__PRESERVED_');
      // One should be restored, one should remain as placeholder
      expect(restored.includes('`another`') || restored.includes('`test`')).toBe(true);
    });
  });

  describe('hasPreservedContent', () => {
    it('should detect code blocks', () => {
      expect(preserver.hasPreservedContent('```code```')).toBe(true);
      expect(preserver.hasPreservedContent('`inline`')).toBe(true);
      expect(preserver.hasPreservedContent('no code here')).toBe(false);
    });

    it('should detect tables', () => {
      expect(preserver.hasPreservedContent('| A | B |\n|---|---|')).toBe(true);
      expect(preserver.hasPreservedContent('just text')).toBe(false);
    });

    it('should detect callouts', () => {
      expect(preserver.hasPreservedContent('> [!note] Test')).toBe(true);
      expect(preserver.hasPreservedContent('> regular quote')).toBe(false);
    });

    it('should detect math', () => {
      expect(preserver.hasPreservedContent('$$x = y$$')).toBe(true);
      expect(preserver.hasPreservedContent('\\[equation\\]')).toBe(true);
      expect(preserver.hasPreservedContent('no math')).toBe(false);
    });

    it('should detect images', () => {
      expect(preserver.hasPreservedContent('![[image.png]]')).toBe(true);
      expect(preserver.hasPreservedContent('![alt](url.jpg)')).toBe(true);
      expect(preserver.hasPreservedContent('no images')).toBe(false);
    });
  });

  describe('getPreservationSummary', () => {
    it('should summarize preserved blocks', () => {
      const content = `\`\`\`code\`\`\`
      
| table |
|-------|
| data  |

> [!note] callout

$$math$$

![[image.png]]`;

      const result = preserver.preserveContent(content);
      const summary = preserver.getPreservationSummary(result.preservedBlocks);

      expect(summary.code).toBe(1);
      expect(summary.table).toBe(1);
      expect(summary.callout).toBe(1);
      expect(summary.math).toBe(1);
      expect(summary.image).toBe(1);
    });

    it('should handle empty blocks', () => {
      const summary = preserver.getPreservationSummary([]);
      expect(Object.keys(summary)).toHaveLength(0);
    });

    it('should count multiple blocks of same type', () => {
      const content = '`code1` and `code2` and `code3`';
      
      const result = preserver.preserveContent(content);
      const summary = preserver.getPreservationSummary(result.preservedBlocks);
      
      expect(summary.code).toBe(3);
    });
  });

  describe('shouldKeepIntact', () => {
    it('should recommend keeping mostly-preserved content intact', () => {
      const content = `\`\`\`
large code block
with multiple lines
of content
\`\`\`

Small text.`;

      const result = preserver.preserveContent(content);
      const shouldKeep = preserver.shouldKeepIntact(content, result);
      
      // Since most content is preserved, should keep intact
      expect(shouldKeep).toBe(true);
    });

    it('should not recommend keeping mostly-text content intact', () => {
      const content = `This is a long paragraph with lots of regular text content.

\`small code\`

More text that makes up the majority of the content.`;

      const result = preserver.preserveContent(content);
      const shouldKeep = preserver.shouldKeepIntact(content, result);
      
      // Since most content is regular text, should allow chunking
      expect(shouldKeep).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle nested code in callouts', () => {
      const content = `> [!tip] Code Example
> Here's some code: \`example\`
> 
> \`\`\`javascript
> function test() {}
> \`\`\``;

      const result = preserver.preserveContent(content);
      
      // Should preserve the callout, and code within it should be preserved separately
      expect(result.preservedBlocks.length).toBeGreaterThan(1);
      expect(result.preservedBlocks.some(b => b.type === 'callout')).toBe(true);
    });

    it('should handle malformed markdown gracefully', () => {
      const content = `Broken table:
| incomplete

\`\`\`
unclosed code block

> [!invalid callout structure`;

      // Should not throw errors
      const result = preserver.preserveContent(content);
      expect(result).toBeDefined();
      expect(result.preservedBlocks).toBeDefined();
    });

    it('should generate unique block IDs', () => {
      const content = '`code1` `code2` `code3`';
      
      const result = preserver.preserveContent(content);
      const ids = result.preservedBlocks.map(b => b.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length); // All IDs should be unique
    });
  });
});