import { WikiLinkParser } from '../../src/obsidian/parser/WikiLinkParser';
import { Logger } from '../../src/utils/Logger';

describe('WikiLinkParser', () => {
  let parser: WikiLinkParser;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    parser = new WikiLinkParser(mockLogger);
  });

  describe('extractWikiLinks', () => {
    it('should extract basic WikiLinks', () => {
      const content = 'Check out [[Note Title]] and [[Another Note]].';

      const links = parser.extractWikiLinks(content);

      expect(links).toHaveLength(2);
      expect(links[0]).toEqual({
        original: '[[Note Title]]',
        target: 'Note Title',
        displayText: undefined,
        anchor: undefined,
        position: { start: 10, end: 24 },
        isEmbed: false,
      });
      expect(links[1]).toEqual({
        original: '[[Another Note]]',
        target: 'Another Note',
        displayText: undefined,
        anchor: undefined,
        position: { start: 29, end: 45 },
        isEmbed: false,
      });
    });

    it('should extract WikiLinks with display text', () => {
      const content = 'See [[Note Title|Custom Display Text]] for details.';

      const links = parser.extractWikiLinks(content);

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        original: '[[Note Title|Custom Display Text]]',
        target: 'Note Title',
        displayText: 'Custom Display Text',
        anchor: undefined,
        position: { start: 4, end: 38 },
        isEmbed: false,
      });
    });

    it('should extract WikiLinks with anchors', () => {
      const content = 'Reference [[Note Title#Section Name]] section.';

      const links = parser.extractWikiLinks(content);

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        original: '[[Note Title#Section Name]]',
        target: 'Note Title',
        displayText: undefined,
        anchor: 'Section Name',
        position: { start: 10, end: 37 },
        isEmbed: false,
      });
    });

    it('should extract WikiLinks with both anchor and display text', () => {
      const content = 'See [[Note Title#Section|Display Text]] here.';

      const links = parser.extractWikiLinks(content);

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        original: '[[Note Title#Section|Display Text]]',
        target: 'Note Title',
        displayText: 'Display Text',
        anchor: 'Section',
        position: { start: 4, end: 39 },
        isEmbed: false,
      });
    });

    it('should extract embedded WikiLinks', () => {
      const content = 'Embed this image: ![[image.png]] in the document.';

      const links = parser.extractWikiLinks(content);

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        original: '![[image.png]]',
        target: 'image.png',
        displayText: undefined,
        anchor: undefined,
        position: { start: 18, end: 32 },
        isEmbed: true,
      });
    });

    it('should handle complex nested content', () => {
      const content = `
# Header

Here's a link to [[Main Note]] and an embed ![[diagram.png|Diagram]].

Also see [[Other Note#Section|Link Text]] for more info.
`;

      const links = parser.extractWikiLinks(content);

      expect(links).toHaveLength(3);
      expect(links[0]!.target).toBe('Main Note');
      expect(links[1]!.target).toBe('diagram.png');
      expect(links[1]!.isEmbed).toBe(true);
      expect(links[2]!.target).toBe('Other Note');
      expect(links[2]!.anchor).toBe('Section');
    });

    it('should preserve special characters in WikiLink targets', () => {
      const content = `
Reference [[Map<K,V>]] and [[List<T>]] for generic types.
Also see [[Data Type: String]] and [[Field "Name"]] with special chars.
Check [[Path/To/File]] and [[User@domain.com]] formats.
`;

      const links = parser.extractWikiLinks(content);

      expect(links).toHaveLength(6);
      
      // Test angle brackets are preserved (not converted to dashes)
      expect(links[0]).toEqual({
        original: '[[Map<K,V>]]',
        target: 'Map<K,V>',
        displayText: undefined,
        anchor: undefined,
        position: expect.any(Object),
        isEmbed: false,
      });
      
      expect(links[1]).toEqual({
        original: '[[List<T>]]',
        target: 'List<T>',
        displayText: undefined,
        anchor: undefined,
        position: expect.any(Object),
        isEmbed: false,
      });
      
      // Test colon is preserved
      expect(links[2]!.target).toBe('Data Type: String');
      
      // Test quotes are preserved
      expect(links[3]!.target).toBe('Field "Name"');
      
      // Test slashes are preserved
      expect(links[4]!.target).toBe('Path/To/File');
      
      // Test @ symbol is preserved
      expect(links[5]!.target).toBe('User@domain.com');
    });
  });

  describe('extractTags', () => {
    it('should extract basic tags', () => {
      const content = 'This is #tagged content with #multiple #tags.';

      const tags = parser.extractTags(content);

      expect(tags).toHaveLength(3);
      expect(tags[0]).toEqual({
        original: '#tagged',
        tag: 'tagged',
        position: { start: 8, end: 15 },
        isNested: false,
        parents: [],
      });
      expect(tags[1]).toEqual({
        original: '#multiple',
        tag: 'multiple',
        position: { start: 29, end: 38 },
        isNested: false,
        parents: [],
      });
      expect(tags[2]).toEqual({
        original: '#tags',
        tag: 'tags',
        position: { start: 39, end: 44 },
        isNested: false,
        parents: [],
      });
    });

    it('should extract nested tags', () => {
      const content = 'Project notes #project/web-dev #project/web-dev/frontend';

      const tags = parser.extractTags(content);

      expect(tags).toHaveLength(2);
      expect(tags[0]).toEqual({
        original: '#project/web-dev',
        tag: 'project/web-dev',
        position: { start: 14, end: 30 },
        isNested: true,
        parents: ['project'],
      });
      expect(tags[1]).toEqual({
        original: '#project/web-dev/frontend',
        tag: 'project/web-dev/frontend',
        position: { start: 31, end: 56 },
        isNested: true,
        parents: ['project', 'project/web-dev'],
      });
    });

    it('should handle tags with numbers and special characters', () => {
      const content = 'Tags: #tag-with-dashes #tag_with_underscores #tag123 #tag/2023';

      const tags = parser.extractTags(content);

      expect(tags).toHaveLength(4);
      expect(tags[0]!.tag).toBe('tag-with-dashes');
      expect(tags[1]!.tag).toBe('tag_with_underscores');
      expect(tags[2]!.tag).toBe('tag123');
      expect(tags[3]!.tag).toBe('tag/2023');
    });

    it('should ignore tags in code blocks', () => {
      const content = `
This has #real-tag.

\`\`\`javascript
// This has #fake-tag in code
console.log('#another-fake-tag');
\`\`\`

And \`#inline-fake-tag\` here.

But #another-real-tag here.
`;

      const tags = parser.extractTags(content);

      expect(tags).toHaveLength(2);
      expect(tags[0]!.tag).toBe('real-tag');
      expect(tags[1]!.tag).toBe('another-real-tag');
    });
  });

  describe('parse', () => {
    it('should parse content with both WikiLinks and tags', () => {
      const content = `# Document Title

This document references [[Other Note]] and has #tags.

It also embeds ![[image.png]] and uses #nested/tag.

See [[Note|Link Text]] for details.`;

      const result = parser.parse(content);

      expect(result.wikiLinks).toHaveLength(3);
      expect(result.tags).toHaveLength(2);
      // processedContent should now be the same as original content (no placeholders)
      expect(result.processedContent).toBe(content);
      expect(result.processedContent).toContain('[[Other Note]]');
      expect(result.processedContent).toContain('#tags');
    });

    it('should handle empty content', () => {
      const content = '';

      const result = parser.parse(content);

      expect(result).toEqual({
        wikiLinks: [],
        tags: [],
        processedContent: '',
      });
    });

    it('should handle content with no WikiLinks or tags', () => {
      const content = 'This is just plain text content.';

      const result = parser.parse(content);

      expect(result).toEqual({
        wikiLinks: [],
        tags: [],
        processedContent: content,
      });
    });
  });

  describe('getWikiLinkTargets', () => {
    it('should return unique targets', () => {
      const content = 'Links: [[Note A]], [[Note B]], [[Note A|Different Text]]';

      const targets = parser.getWikiLinkTargets(content);

      expect(targets).toEqual(['Note A', 'Note B']);
    });
  });

  describe('getAllTags', () => {
    it('should return all unique tags including parents', () => {
      const content = 'Tags: #simple #nested/child #nested/child/grandchild';

      const tags = parser.getAllTags(content);

      expect(tags).toEqual(['simple', 'nested/child', 'nested', 'nested/child/grandchild']);
    });
  });

  describe('resolveWikiLink', () => {
    it('should resolve WikiLink to possible file paths', () => {
      const target = 'My Note';
      const vaultPath = '/vault';

      const paths = parser.resolveWikiLink(target, vaultPath);

      expect(paths).toContain('My Note.md');
      expect(paths).toContain('My Note.markdown');
      expect(paths).toContain('My Note');
      expect(paths).toContain('/vault/My Note.md');
    });

    it('should handle nested paths', () => {
      const target = 'subfolder/My Note';
      const vaultPath = '/vault';

      const paths = parser.resolveWikiLink(target, vaultPath);

      expect(paths).toContain('My Note.md');
      expect(paths).toContain('subfolder/My Note.md');
      expect(paths).toContain('/vault/subfolder/My Note.md');
    });

    it('should strip anchors when resolving', () => {
      const target = 'My Note#Section';
      const vaultPath = '/vault';

      const paths = parser.resolveWikiLink(target, vaultPath);

      expect(paths.every(path => !path.includes('#'))).toBe(true);
      expect(paths).toContain('My Note.md');
    });
  });

  describe('createBacklinks', () => {
    it('should create backlink information', () => {
      const content = 'Links to [[Target Note]] and [[Other Note|Display]].';
      const sourceFile = 'source.md';

      const backlinks = parser.createBacklinks(content, sourceFile);

      expect(backlinks).toHaveLength(2);
      expect(backlinks[0]).toEqual({
        sourceFile: 'source.md',
        target: 'Target Note',
        displayText: undefined,
        anchor: undefined,
        isEmbed: false,
      });
      expect(backlinks[1]).toEqual({
        sourceFile: 'source.md',
        target: 'Other Note',
        displayText: 'Display',
        anchor: undefined,
        isEmbed: false,
      });
    });
  });

});