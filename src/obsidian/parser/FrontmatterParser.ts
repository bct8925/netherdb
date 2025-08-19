import matter from 'gray-matter';
import { Logger } from '../../utils/Logger';

/**
 * Frontmatter data structure
 */
export interface Frontmatter {
  [key: string]: unknown;
}

/**
 * Result of parsing a markdown file with frontmatter
 */
export interface ParsedMarkdown {
  frontmatter: Frontmatter;
  content: string;
  hasFrontmatter: boolean;
}

/**
 * Frontmatter extraction and parsing utilities
 */
export class FrontmatterParser {
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('FrontmatterParser');
  }

  /**
   * Parse markdown content and extract frontmatter
   */
  parse(markdown: string): ParsedMarkdown {
    try {
      // Use gray-matter for robust frontmatter parsing
      const parsed = matter(markdown);
      
      return {
        frontmatter: parsed.data || {},
        content: parsed.content,
        hasFrontmatter: Object.keys(parsed.data || {}).length > 0,
      };
    } catch (error) {
      this.logger.warn('Failed to parse frontmatter, treating as regular content:', error);
      
      // Return original content if parsing fails
      return {
        frontmatter: {},
        content: markdown,
        hasFrontmatter: false,
      };
    }
  }

  /**
   * Extract tags from frontmatter
   */
  extractTags(frontmatter: Frontmatter): string[] {
    const tags: string[] = [];

    // Common frontmatter tag fields
    const tagFields = ['tags', 'tag', 'categories', 'category'];

    for (const field of tagFields) {
      const value = frontmatter[field];
      if (value) {
        if (Array.isArray(value)) {
          // Handle array of tags
          for (const tag of value) {
            if (typeof tag === 'string') {
              tags.push(this.normalizeTag(tag));
            }
          }
        } else if (typeof value === 'string') {
          // Handle comma-separated or space-separated tags
          const splitTags = value.split(/[,\s]+/).filter(tag => tag.trim());
          for (const tag of splitTags) {
            tags.push(this.normalizeTag(tag.trim()));
          }
        }
      }
    }

    // Remove duplicates and return
    return Array.from(new Set(tags));
  }

  /**
   * Extract title from frontmatter
   */
  extractTitle(frontmatter: Frontmatter): string | null {
    const titleFields = ['title', 'name', 'subject', 'heading'];
    
    for (const field of titleFields) {
      const value = frontmatter[field];
      if (value && typeof value === 'string') {
        return value.trim();
      }
    }

    return null;
  }

  /**
   * Extract description from frontmatter
   */
  extractDescription(frontmatter: Frontmatter): string | null {
    const descriptionFields = ['description', 'summary', 'excerpt', 'abstract'];
    
    for (const field of descriptionFields) {
      const value = frontmatter[field];
      if (value && typeof value === 'string') {
        return value.trim();
      }
    }

    return null;
  }

  /**
   * Extract date from frontmatter
   */
  extractDate(frontmatter: Frontmatter): Date | null {
    const dateFields = ['date', 'created', 'updated', 'modified', 'published'];
    
    for (const field of dateFields) {
      const value = frontmatter[field];
      if (value) {
        const date = this.parseDate(value);
        if (date) {
          return date;
        }
      }
    }

    return null;
  }

  /**
   * Extract author from frontmatter
   */
  extractAuthor(frontmatter: Frontmatter): string | null {
    const authorFields = ['author', 'authors', 'creator', 'by'];
    
    for (const field of authorFields) {
      const value = frontmatter[field];
      if (value) {
        if (typeof value === 'string') {
          return value.trim();
        } else if (Array.isArray(value) && value.length > 0) {
          const firstAuthor = value[0];
          if (typeof firstAuthor === 'string') {
            return firstAuthor.trim();
          } else if (typeof firstAuthor === 'object' && firstAuthor.name) {
            return firstAuthor.name.trim();
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract custom metadata fields
   */
  extractCustomFields(frontmatter: Frontmatter, fields: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const field of fields) {
      if (frontmatter[field] !== undefined) {
        result[field] = frontmatter[field];
      }
    }

    return result;
  }

  /**
   * Check if frontmatter indicates content should be hidden/private
   */
  isHidden(frontmatter: Frontmatter): boolean {
    const hiddenFields = ['hidden', 'private', 'draft', 'unpublished'];
    
    for (const field of hiddenFields) {
      const value = frontmatter[field];
      if (value === true || value === 'true' || value === 1) {
        return true;
      }
    }

    // Check if tags include hidden indicators
    const tags = this.extractTags(frontmatter);
    const hiddenTags = ['hidden', 'private', 'draft'];
    
    return tags.some(tag => hiddenTags.includes(tag.toLowerCase()));
  }

  /**
   * Get all frontmatter as metadata object
   */
  extractAllMetadata(frontmatter: Frontmatter): {
    title?: string;
    description?: string;
    tags: string[];
    date?: Date;
    author?: string;
    custom: Record<string, unknown>;
    isHidden: boolean;
  } {
    // Extract known fields
    const title = this.extractTitle(frontmatter);
    const description = this.extractDescription(frontmatter);
    const tags = this.extractTags(frontmatter);
    const date = this.extractDate(frontmatter);
    const author = this.extractAuthor(frontmatter);
    const isHidden = this.isHidden(frontmatter);

    // Extract custom fields (everything not already extracted)
    const knownFields = ['title', 'name', 'subject', 'heading', 'description', 'summary', 
                        'excerpt', 'abstract', 'tags', 'tag', 'categories', 'category',
                        'date', 'created', 'updated', 'modified', 'published', 'author', 
                        'authors', 'creator', 'by', 'hidden', 'private', 'draft', 'unpublished'];
    
    const custom: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(frontmatter)) {
      if (!knownFields.includes(key.toLowerCase())) {
        custom[key] = value;
      }
    }

    const result: {
      title?: string;
      description?: string;
      tags: string[];
      date?: Date;
      author?: string;
      custom: Record<string, unknown>;
      isHidden: boolean;
    } = {
      tags,
      custom,
      isHidden,
    };
    
    if (title) result.title = title;
    if (description) result.description = description;
    if (date) result.date = date;
    if (author) result.author = author;
    
    return result;
  }

  // Private helper methods

  /**
   * Normalize tag format
   */
  private normalizeTag(tag: string): string {
    return tag
      .trim()
      .replace(/^#/, '') // Remove leading #
      .toLowerCase()
      .replace(/\s+/g, '-'); // Replace spaces with hyphens
  }

  /**
   * Parse various date formats
   */
  private parseDate(value: unknown): Date | null {
    if (!value) return null;

    // If already a Date object
    if (value instanceof Date) {
      return value;
    }

    // If it's a string, try to parse it
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // If it's a number (timestamp)
    if (typeof value === 'number') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  }
}