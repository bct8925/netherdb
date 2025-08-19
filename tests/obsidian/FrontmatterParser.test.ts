import { FrontmatterParser, Frontmatter } from '../../src/obsidian/parser/FrontmatterParser';
import { Logger } from '../../src/utils/Logger';

describe('FrontmatterParser', () => {
  let parser: FrontmatterParser;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    parser = new FrontmatterParser(mockLogger);
  });

  describe('parse', () => {
    it('should parse markdown with frontmatter', () => {
      const markdown = `---
title: Test Document
tags:
  - test
  - example
date: 2023-01-01
---

# Main Content

This is the content of the document.`;

      const result = parser.parse(markdown);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.frontmatter).toEqual({
        title: 'Test Document',
        tags: ['test', 'example'],
        date: new Date('2023-01-01'),
      });
      expect(result.content).toBe('\n# Main Content\n\nThis is the content of the document.');
    });

    it('should handle markdown without frontmatter', () => {
      const markdown = `# Main Content

This is just regular markdown content.`;

      const result = parser.parse(markdown);

      expect(result.hasFrontmatter).toBe(false);
      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe(markdown);
    });

    it('should handle empty frontmatter', () => {
      const markdown = `---
---

# Content`;

      const result = parser.parse(markdown);

      expect(result.hasFrontmatter).toBe(false);
      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe('\n# Content');
    });

    it('should handle malformed frontmatter gracefully', () => {
      const markdown = `---
invalid: yaml: content: here
---

# Content`;

      const result = parser.parse(markdown);

      expect(result.hasFrontmatter).toBe(false);
      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe(markdown);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse frontmatter, treating as regular content:',
        expect.any(Error)
      );
    });

    it('should handle frontmatter with special characters', () => {
      const markdown = `---
title: "Title with: special characters & symbols"
description: |
  Multi-line description
  with multiple lines
tags: [tag1, tag2, "tag with spaces"]
---

Content here.`;

      const result = parser.parse(markdown);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.frontmatter.title).toBe('Title with: special characters & symbols');
      expect(result.frontmatter.description).toContain('Multi-line description');
      expect(result.frontmatter.tags).toEqual(['tag1', 'tag2', 'tag with spaces']);
    });
  });

  describe('extractTags', () => {
    it('should extract tags from array field', () => {
      const frontmatter: Frontmatter = {
        tags: ['javascript', 'react', 'frontend'],
      };

      const tags = parser.extractTags(frontmatter);

      expect(tags).toEqual(['javascript', 'react', 'frontend']);
    });

    it('should extract tags from string field', () => {
      const frontmatter: Frontmatter = {
        tags: 'javascript, react, frontend',
      };

      const tags = parser.extractTags(frontmatter);

      expect(tags).toEqual(['javascript', 'react', 'frontend']);
    });

    it('should extract tags from multiple fields', () => {
      const frontmatter: Frontmatter = {
        tags: ['javascript', 'react'],
        categories: ['frontend', 'development'],
      };

      const tags = parser.extractTags(frontmatter);

      expect(tags).toEqual(['javascript', 'react', 'frontend', 'development']);
    });

    it('should normalize tag format', () => {
      const frontmatter: Frontmatter = {
        tags: ['#JavaScript', 'React Components', 'front-end'],
      };

      const tags = parser.extractTags(frontmatter);

      expect(tags).toEqual(['javascript', 'react-components', 'front-end']);
    });

    it('should remove duplicate tags', () => {
      const frontmatter: Frontmatter = {
        tags: ['javascript', 'react'],
        categories: ['javascript', 'frontend'],
      };

      const tags = parser.extractTags(frontmatter);

      expect(tags).toEqual(['javascript', 'react', 'frontend']);
    });

    it('should handle empty or invalid tag fields', () => {
      const frontmatter: Frontmatter = {
        tags: null,
        categories: [],
        emptyString: '',
      };

      const tags = parser.extractTags(frontmatter);

      expect(tags).toEqual([]);
    });
  });

  describe('extractTitle', () => {
    it('should extract title from title field', () => {
      const frontmatter: Frontmatter = {
        title: 'My Document Title',
      };

      const title = parser.extractTitle(frontmatter);

      expect(title).toBe('My Document Title');
    });

    it('should try alternative field names', () => {
      const frontmatter: Frontmatter = {
        name: 'Document Name',
      };

      const title = parser.extractTitle(frontmatter);

      expect(title).toBe('Document Name');
    });

    it('should return null when no title field exists', () => {
      const frontmatter: Frontmatter = {
        description: 'Just a description',
      };

      const title = parser.extractTitle(frontmatter);

      expect(title).toBeNull();
    });

    it('should trim whitespace from title', () => {
      const frontmatter: Frontmatter = {
        title: '  Whitespace Title  ',
      };

      const title = parser.extractTitle(frontmatter);

      expect(title).toBe('Whitespace Title');
    });
  });

  describe('extractDescription', () => {
    it('should extract description from description field', () => {
      const frontmatter: Frontmatter = {
        description: 'This is a document description.',
      };

      const description = parser.extractDescription(frontmatter);

      expect(description).toBe('This is a document description.');
    });

    it('should try alternative field names', () => {
      const frontmatter: Frontmatter = {
        summary: 'Document summary',
      };

      const description = parser.extractDescription(frontmatter);

      expect(description).toBe('Document summary');
    });

    it('should return null when no description field exists', () => {
      const frontmatter: Frontmatter = {
        title: 'Just a title',
      };

      const description = parser.extractDescription(frontmatter);

      expect(description).toBeNull();
    });
  });

  describe('extractDate', () => {
    it('should extract date from date field', () => {
      const frontmatter: Frontmatter = {
        date: '2023-01-01',
      };

      const date = parser.extractDate(frontmatter);

      expect(date).toEqual(new Date('2023-01-01'));
    });

    it('should handle Date objects', () => {
      const dateObj = new Date('2023-01-01');
      const frontmatter: Frontmatter = {
        date: dateObj,
      };

      const date = parser.extractDate(frontmatter);

      expect(date).toBe(dateObj);
    });

    it('should handle timestamp numbers', () => {
      const timestamp = 1672531200000; // 2023-01-01
      const frontmatter: Frontmatter = {
        date: timestamp,
      };

      const date = parser.extractDate(frontmatter);

      expect(date).toEqual(new Date(timestamp));
    });

    it('should try alternative field names', () => {
      const frontmatter: Frontmatter = {
        created: '2023-01-01',
      };

      const date = parser.extractDate(frontmatter);

      expect(date).toEqual(new Date('2023-01-01'));
    });

    it('should return null for invalid dates', () => {
      const frontmatter: Frontmatter = {
        date: 'invalid-date',
      };

      const date = parser.extractDate(frontmatter);

      expect(date).toBeNull();
    });
  });

  describe('extractAuthor', () => {
    it('should extract string author', () => {
      const frontmatter: Frontmatter = {
        author: 'John Doe',
      };

      const author = parser.extractAuthor(frontmatter);

      expect(author).toBe('John Doe');
    });

    it('should extract first author from array', () => {
      const frontmatter: Frontmatter = {
        authors: ['John Doe', 'Jane Smith'],
      };

      const author = parser.extractAuthor(frontmatter);

      expect(author).toBe('John Doe');
    });

    it('should extract author name from object', () => {
      const frontmatter: Frontmatter = {
        authors: [{ name: 'John Doe', email: 'john@example.com' }],
      };

      const author = parser.extractAuthor(frontmatter);

      expect(author).toBe('John Doe');
    });

    it('should return null when no author field exists', () => {
      const frontmatter: Frontmatter = {
        title: 'Document without author',
      };

      const author = parser.extractAuthor(frontmatter);

      expect(author).toBeNull();
    });
  });

  describe('isHidden', () => {
    it('should detect hidden from boolean field', () => {
      const frontmatter: Frontmatter = {
        hidden: true,
      };

      const isHidden = parser.isHidden(frontmatter);

      expect(isHidden).toBe(true);
    });

    it('should detect hidden from string field', () => {
      const frontmatter: Frontmatter = {
        private: 'true',
      };

      const isHidden = parser.isHidden(frontmatter);

      expect(isHidden).toBe(true);
    });

    it('should detect hidden from draft field', () => {
      const frontmatter: Frontmatter = {
        draft: 1,
      };

      const isHidden = parser.isHidden(frontmatter);

      expect(isHidden).toBe(true);
    });

    it('should detect hidden from tags', () => {
      const frontmatter: Frontmatter = {
        tags: ['public', 'hidden', 'tutorial'],
      };

      const isHidden = parser.isHidden(frontmatter);

      expect(isHidden).toBe(true);
    });

    it('should return false for non-hidden documents', () => {
      const frontmatter: Frontmatter = {
        title: 'Public Document',
        tags: ['public', 'tutorial'],
      };

      const isHidden = parser.isHidden(frontmatter);

      expect(isHidden).toBe(false);
    });
  });

  describe('extractAllMetadata', () => {
    it('should extract all metadata fields', () => {
      const frontmatter: Frontmatter = {
        title: 'Test Document',
        description: 'A test document',
        tags: ['test', 'example'],
        date: '2023-01-01',
        author: 'John Doe',
        hidden: false,
        customField: 'custom value',
        priority: 'high',
      };

      const metadata = parser.extractAllMetadata(frontmatter);

      expect(metadata).toEqual({
        title: 'Test Document',
        description: 'A test document',
        tags: ['test', 'example'],
        date: new Date('2023-01-01'),
        author: 'John Doe',
        isHidden: false,
        custom: {
          customField: 'custom value',
          priority: 'high',
        },
      });
    });

    it('should handle missing optional fields', () => {
      const frontmatter: Frontmatter = {
        tags: ['minimal'],
      };

      const metadata = parser.extractAllMetadata(frontmatter);

      expect(metadata).toEqual({
        title: undefined,
        description: undefined,
        tags: ['minimal'],
        date: undefined,
        author: undefined,
        isHidden: false,
        custom: {},
      });
    });
  });

  describe('extractCustomFields', () => {
    it('should extract specified custom fields', () => {
      const frontmatter: Frontmatter = {
        title: 'Document',
        priority: 'high',
        project: 'myproject',
        status: 'draft',
        unrelated: 'value',
      };

      const custom = parser.extractCustomFields(frontmatter, ['priority', 'project', 'status']);

      expect(custom).toEqual({
        priority: 'high',
        project: 'myproject',
        status: 'draft',
      });
    });

    it('should handle missing custom fields', () => {
      const frontmatter: Frontmatter = {
        title: 'Document',
        priority: 'high',
      };

      const custom = parser.extractCustomFields(frontmatter, ['priority', 'missing', 'alsomissing']);

      expect(custom).toEqual({
        priority: 'high',
      });
    });
  });
});