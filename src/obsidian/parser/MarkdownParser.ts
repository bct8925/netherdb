import { marked } from 'marked';
import { FrontmatterParser, ParsedMarkdown } from './FrontmatterParser';
import { WikiLinkParser, WikiLink, TagReference, ParseResult } from './WikiLinkParser';
import { Logger } from '../../utils/Logger';

// Re-export ParsedMarkdown for external use
export type { ParsedMarkdown } from './FrontmatterParser';

/**
 * Complete parsed markdown document
 */
export interface ParsedDocument {
  /** Original raw content */
  raw: string;
  /** Frontmatter data */
  frontmatter: Record<string, unknown>;
  /** Content without frontmatter */
  content: string;
  /** Whether frontmatter was present */
  hasFrontmatter: boolean;
  /** WikiLinks found in content */
  wikiLinks: WikiLink[];
  /** Tags found in content */
  tags: string[];
  /** Tag references with positions */
  tagReferences: TagReference[];
  /** Content with WikiLinks/tags replaced for processing */
  processedContent: string;
  /** HTML version of the content */
  html: string;
  /** Plain text version (no markdown formatting) */
  plainText: string;
  /** Extracted metadata */
  metadata: DocumentMetadata;
}

/**
 * Extracted document metadata
 */
export interface DocumentMetadata {
  title?: string;
  description?: string;
  tags: string[];
  date?: Date;
  author?: string;
  wordCount: number;
  readingTime: number; // minutes
  headings: Heading[];
  links: WikiLink[];
  isHidden: boolean;
  custom: Record<string, unknown>;
}

/**
 * Document heading information
 */
export interface Heading {
  level: number;
  text: string;
  anchor: string;
  position: number;
}

/**
 * Markdown parsing options
 */
export interface ParsingOptions {
  /** Whether to parse HTML content */
  generateHtml: boolean;
  /** Whether to extract plain text */
  extractPlainText: boolean;
  /** Whether to process WikiLinks */
  processWikiLinks: boolean;
  /** Whether to extract tags */
  extractTags: boolean;
  /** Whether to extract headings */
  extractHeadings: boolean;
  /** Custom frontmatter fields to extract */
  customFields: string[];
}

/**
 * Comprehensive Obsidian markdown parser
 */
export class MarkdownParser {
  private readonly frontmatterParser: FrontmatterParser;
  private readonly wikiLinkParser: WikiLinkParser;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('MarkdownParser');
    this.frontmatterParser = new FrontmatterParser(this.logger);
    this.wikiLinkParser = new WikiLinkParser(this.logger);
  }

  /**
   * Parse a complete markdown document
   */
  async parse(content: string, options: Partial<ParsingOptions> = {}): Promise<ParsedDocument> {
    const opts: ParsingOptions = {
      generateHtml: true,
      extractPlainText: true,
      processWikiLinks: true,
      extractTags: true,
      extractHeadings: true,
      customFields: [],
      ...options,
    };

    try {
      // Parse frontmatter
      const frontmatterResult = this.frontmatterParser.parse(content);
      
      // Parse WikiLinks and tags
      let wikiLinkResult: ParseResult = {
        wikiLinks: [],
        tags: [],
        processedContent: frontmatterResult.content,
      };

      if (opts.processWikiLinks || opts.extractTags) {
        wikiLinkResult = this.wikiLinkParser.parse(frontmatterResult.content);
      }

      // Generate HTML
      let html = '';
      if (opts.generateHtml) {
        html = await this.generateHtml(wikiLinkResult.processedContent);
      }

      // Extract plain text
      let plainText = '';
      if (opts.extractPlainText) {
        plainText = this.extractPlainText(wikiLinkResult.processedContent);
      }

      // Extract headings
      let headings: Heading[] = [];
      if (opts.extractHeadings) {
        headings = this.extractHeadings(frontmatterResult.content);
      }

      // Extract all tags (from frontmatter and content)
      const allTags = this.extractAllTags(frontmatterResult, wikiLinkResult);

      // Create metadata
      const metadata = this.createMetadata(
        frontmatterResult,
        wikiLinkResult,
        allTags,
        headings,
        plainText,
        opts.customFields
      );

      return {
        raw: content,
        frontmatter: frontmatterResult.frontmatter,
        content: frontmatterResult.content,
        hasFrontmatter: frontmatterResult.hasFrontmatter,
        wikiLinks: wikiLinkResult.wikiLinks,
        tags: allTags,
        tagReferences: wikiLinkResult.tags,
        processedContent: wikiLinkResult.processedContent,
        html,
        plainText,
        metadata,
      };
    } catch (error) {
      this.logger.error('Error parsing markdown document:', error);
      throw error;
    }
  }

  /**
   * Parse multiple documents in batch
   */
  async parseBatch(documents: Array<{ content: string; path?: string }>, options?: Partial<ParsingOptions>): Promise<ParsedDocument[]> {
    const results: ParsedDocument[] = [];
    
    for (const doc of documents) {
      try {
        const parsed = await this.parse(doc.content, options);
        results.push(parsed);
      } catch (error) {
        this.logger.error(`Error parsing document ${doc.path || 'unknown'}:`, error);
        // Continue with other documents
      }
    }

    return results;
  }

  /**
   * Extract just the WikiLinks from content
   */
  extractWikiLinks(content: string): WikiLink[] {
    return this.wikiLinkParser.extractWikiLinks(content);
  }

  /**
   * Extract just the tags from content
   */
  extractTags(content: string): string[] {
    return this.wikiLinkParser.getAllTags(content);
  }

  /**
   * Parse only frontmatter
   */
  parseFrontmatter(content: string): ParsedMarkdown {
    return this.frontmatterParser.parse(content);
  }

  // Private methods

  /**
   * Generate HTML from markdown
   */
  private async generateHtml(content: string): Promise<string> {
    try {
      // Configure marked for better Obsidian compatibility
      marked.setOptions({
        gfm: true, // GitHub Flavored Markdown
        breaks: true, // Convert \n to <br>
      });

      return marked(content);
    } catch (error) {
      this.logger.warn('Error generating HTML:', error);
      return '';
    }
  }

  /**
   * Extract plain text from markdown
   */
  private extractPlainText(content: string): string {
    try {
      // Remove markdown formatting
      let text = content
        // Remove headers
        .replace(/^#{1,6}\s+/gm, '')
        // Remove emphasis
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove strikethrough
        .replace(/~~([^~]+)~~/g, '$1')
        // Remove inline code
        .replace(/`([^`]+)`/g, '$1')
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        // Remove blockquotes
        .replace(/^>\s+/gm, '')
        // Remove lists
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        // Remove links
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove horizontal rules
        .replace(/^---+$/gm, '')
        // Remove tables
        .replace(/\|[^|\n]*\|/g, '')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim();

      return text;
    } catch (error) {
      this.logger.warn('Error extracting plain text:', error);
      return content;
    }
  }

  /**
   * Extract headings from content
   */
  private extractHeadings(content: string): Heading[] {
    const headings: Heading[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (match && match[1] && match[2]) {
        const level = match[1].length;
        const text = match[2].trim();
        const anchor = this.createAnchor(text);
        
        headings.push({
          level,
          text,
          anchor,
          position: i,
        });
      }
    }

    return headings;
  }

  /**
   * Create anchor ID from heading text
   */
  private createAnchor(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Extract all tags from frontmatter and content
   */
  private extractAllTags(frontmatterResult: ParsedMarkdown, wikiLinkResult: ParseResult): string[] {
    const tags = new Set<string>();

    // Tags from frontmatter
    const frontmatterTags = this.frontmatterParser.extractTags(frontmatterResult.frontmatter);
    frontmatterTags.forEach(tag => tags.add(tag));

    // Tags from content
    const contentTags = wikiLinkResult.tags.map(ref => ref.tag);
    contentTags.forEach(tag => tags.add(tag));

    // Also add parent tags for nested tags
    for (const tagRef of wikiLinkResult.tags) {
      tagRef.parents.forEach(parent => tags.add(parent));
    }

    return Array.from(tags).sort();
  }

  /**
   * Create comprehensive metadata object
   */
  private createMetadata(
    frontmatterResult: ParsedMarkdown,
    wikiLinkResult: ParseResult,
    allTags: string[],
    headings: Heading[],
    plainText: string,
    customFields: string[]
  ): DocumentMetadata {
    const frontmatterMetadata = this.frontmatterParser.extractAllMetadata(frontmatterResult.frontmatter);
    const wordCount = this.calculateWordCount(plainText);
    const readingTime = this.calculateReadingTime(wordCount);

    const metadata: DocumentMetadata = {
      tags: allTags,
      wordCount,
      readingTime,
      headings,
      links: wikiLinkResult.wikiLinks,
      isHidden: frontmatterMetadata.isHidden,
      custom: {
        ...frontmatterMetadata.custom,
        ...this.frontmatterParser.extractCustomFields(frontmatterResult.frontmatter, customFields),
      },
    };
    
    if (frontmatterMetadata.title) {
      metadata.title = frontmatterMetadata.title;
    }
    if (frontmatterMetadata.description) {
      metadata.description = frontmatterMetadata.description;
    }
    if (frontmatterMetadata.date) {
      metadata.date = frontmatterMetadata.date;
    }
    if (frontmatterMetadata.author) {
      metadata.author = frontmatterMetadata.author;
    }
    
    return metadata;
  }

  /**
   * Calculate word count
   */
  private calculateWordCount(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Calculate reading time in minutes
   */
  private calculateReadingTime(wordCount: number): number {
    const wordsPerMinute = 200; // Average reading speed
    return Math.ceil(wordCount / wordsPerMinute);
  }
}