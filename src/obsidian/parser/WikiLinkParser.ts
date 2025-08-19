import path from 'path';
import { Logger } from '../../utils/Logger';

/**
 * WikiLink reference information
 */
export interface WikiLink {
  /** Original link text as found in the document */
  original: string;
  /** The target file/page being linked to */
  target: string;
  /** Display text for the link (if different from target) */
  displayText?: string;
  /** Anchor/section reference within the target */
  anchor?: string;
  /** Position in the source text */
  position: {
    start: number;
    end: number;
  };
  /** Whether this is an embedded link (![[...]]) */
  isEmbed: boolean;
}

/**
 * Tag reference information
 */
export interface TagReference {
  /** Original tag text including # */
  original: string;
  /** Tag name without # */
  tag: string;
  /** Position in the source text */
  position: {
    start: number;
    end: number;
  };
  /** Whether this is a nested tag (contains /) */
  isNested: boolean;
  /** Parent tags for nested tags */
  parents: string[];
}

/**
 * Result of parsing WikiLinks and tags from content
 */
export interface ParseResult {
  /** All WikiLinks found in the content */
  wikiLinks: WikiLink[];
  /** All tags found in the content */
  tags: TagReference[];
  /** Content with WikiLinks and tags replaced with placeholders */
  processedContent: string;
}

/**
 * Parser for Obsidian WikiLinks and tags
 */
export class WikiLinkParser {
  private readonly logger: Logger;

  // Regular expressions for parsing
  private readonly wikiLinkRegex = /(!?)\[\[([^\]]+)\]\]/g;
  private readonly tagRegex = /#([a-zA-Z0-9/_-]+)/g;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('WikiLinkParser');
  }

  /**
   * Parse content and extract all WikiLinks and tags
   */
  parse(content: string): ParseResult {
    const wikiLinks: WikiLink[] = [];
    const tags: TagReference[] = [];
    let processedContent = content;

    // Extract WikiLinks
    wikiLinks.push(...this.extractWikiLinks(content));

    // Extract tags
    tags.push(...this.extractTags(content));

    // Replace WikiLinks with placeholders to avoid interfering with content processing
    processedContent = this.replaceWikiLinksWithPlaceholders(processedContent, wikiLinks);

    // Replace tags with placeholders
    processedContent = this.replaceTagsWithPlaceholders(processedContent, tags);

    return {
      wikiLinks,
      tags,
      processedContent,
    };
  }

  /**
   * Extract all WikiLinks from content
   */
  extractWikiLinks(content: string): WikiLink[] {
    const links: WikiLink[] = [];
    let match;

    // Reset regex state
    this.wikiLinkRegex.lastIndex = 0;

    while ((match = this.wikiLinkRegex.exec(content)) !== null) {
      const [fullMatch, embedPrefix, linkContent] = match;
      if (!linkContent) continue;
      
      const isEmbed = embedPrefix === '!';
      const position = {
        start: match.index,
        end: match.index + fullMatch.length,
      };

      // Parse the link content
      const parsed = this.parseWikiLinkContent(linkContent);

      const wikiLink: WikiLink = {
        original: fullMatch,
        target: parsed.target,
        position,
        isEmbed,
      };
      
      if (parsed.displayText) {
        wikiLink.displayText = parsed.displayText;
      }
      if (parsed.anchor) {
        wikiLink.anchor = parsed.anchor;
      }

      links.push(wikiLink);
    }

    return links;
  }

  /**
   * Extract all tags from content
   */
  extractTags(content: string): TagReference[] {
    const tags: TagReference[] = [];
    let match;

    // Reset regex state
    this.tagRegex.lastIndex = 0;

    while ((match = this.tagRegex.exec(content)) !== null) {
      const [fullMatch, tagName] = match;
      if (!tagName) continue;
      
      const position = {
        start: match.index,
        end: match.index + fullMatch.length,
      };

      // Check if this is inside a code block or inline code
      if (this.isInsideCodeBlock(content, match.index)) {
        continue;
      }

      const isNested = tagName.includes('/');
      const parents = isNested ? this.getTagParents(tagName) : [];

      tags.push({
        original: fullMatch,
        tag: tagName,
        position,
        isNested,
        parents,
      });
    }

    return tags;
  }

  /**
   * Get all unique WikiLink targets from content
   */
  getWikiLinkTargets(content: string): string[] {
    const links = this.extractWikiLinks(content);
    const targets = new Set<string>();

    for (const link of links) {
      targets.add(link.target);
    }

    return Array.from(targets);
  }

  /**
   * Get all unique tags from content
   */
  getAllTags(content: string): string[] {
    const tagRefs = this.extractTags(content);
    const tags = new Set<string>();

    for (const tagRef of tagRefs) {
      tags.add(tagRef.tag);
      // Also add parent tags for nested tags
      for (const parent of tagRef.parents) {
        tags.add(parent);
      }
    }

    return Array.from(tags);
  }

  /**
   * Resolve WikiLink target to potential file paths
   */
  resolveWikiLink(target: string, vaultPath: string): string[] {
    const possiblePaths: string[] = [];

    // Remove anchor if present
    const cleanTarget = target.split('#')[0] || target;

    // Common markdown extensions to try
    const extensions = ['.md', '.markdown', ''];

    for (const ext of extensions) {
      const filename = cleanTarget + ext;
      
      // Try as direct path
      possiblePaths.push(filename);
      
      // Try with vault path
      possiblePaths.push(path.join(vaultPath, filename));
      
      // For nested paths, try different combinations
      if (cleanTarget.includes('/')) {
        const parts = cleanTarget.split('/');
        const fileName = (parts[parts.length - 1] || '') + ext;
        possiblePaths.push(fileName);
      }
    }

    return possiblePaths;
  }

  /**
   * Create backlink information for a target file
   */
  createBacklinks(content: string, sourceFile: string): Array<{
    sourceFile: string;
    target: string;
    displayText?: string;
    anchor?: string;
    isEmbed: boolean;
  }> {
    const links = this.extractWikiLinks(content);
    
    return links.map(link => {
      const backlink: {
        sourceFile: string;
        target: string;
        displayText?: string;
        anchor?: string;
        isEmbed: boolean;
      } = {
        sourceFile,
        target: link.target,
        isEmbed: link.isEmbed,
      };
      
      if (link.displayText) {
        backlink.displayText = link.displayText;
      }
      if (link.anchor) {
        backlink.anchor = link.anchor;
      }
      
      return backlink;
    });
  }

  // Private helper methods

  /**
   * Parse WikiLink content to extract target, display text, and anchor
   */
  private parseWikiLinkContent(linkContent: string): {
    target: string;
    displayText?: string;
    anchor?: string;
  } {
    // Handle display text: [[target|display text]]
    let target = linkContent;
    let displayText: string | undefined;

    if (linkContent.includes('|')) {
      const parts = linkContent.split('|');
      target = (parts[0] || '').trim();
      displayText = parts.slice(1).join('|').trim() || undefined;
    }

    // Handle anchor: [[target#anchor]] or [[target#anchor|display]]
    let anchor: string | undefined;
    if (target.includes('#')) {
      const parts = target.split('#');
      target = (parts[0] || '').trim();
      anchor = parts.slice(1).join('#').trim() || undefined;
    }

    const result: {
      target: string;
      displayText?: string;
      anchor?: string;
    } = {
      target: this.normalizeTarget(target),
    };
    
    if (displayText) {
      result.displayText = displayText;
    }
    if (anchor) {
      result.anchor = anchor;
    }
    
    return result;
  }

  /**
   * Normalize WikiLink target
   */
  private normalizeTarget(target: string): string {
    return target
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[<>:"/\\|?*]/g, '-'); // Replace invalid filename chars
  }

  /**
   * Get parent tags for nested tags
   */
  private getTagParents(tagName: string): string[] {
    const parts = tagName.split('/');
    const parents: string[] = [];

    for (let i = 1; i < parts.length; i++) {
      parents.push(parts.slice(0, i).join('/'));
    }

    return parents;
  }

  /**
   * Check if position is inside a code block
   */
  private isInsideCodeBlock(content: string, position: number): boolean {
    const beforeContent = content.substring(0, position);
    
    // Check for inline code (single backticks)
    const inlineCodeMatches = beforeContent.match(/`/g) || [];
    if (inlineCodeMatches.length % 2 === 1) {
      return true; // Inside inline code
    }

    // Check for code blocks (triple backticks or indented blocks)
    const lines = beforeContent.split('\n');
    let inCodeBlock = false;

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }
    }

    return inCodeBlock;
  }

  /**
   * Replace WikiLinks with placeholders
   */
  private replaceWikiLinksWithPlaceholders(content: string, links: WikiLink[]): string {
    let result = content;
    
    // Sort links by position (descending) to avoid position shifts
    const sortedLinks = [...links].sort((a, b) => b.position.start - a.position.start);

    for (let i = 0; i < sortedLinks.length; i++) {
      const link = sortedLinks[i];
      if (!link) continue;
      
      const placeholder = `__WIKILINK_${i}__`;
      
      result = result.substring(0, link.position.start) + 
               placeholder + 
               result.substring(link.position.end);
    }

    return result;
  }

  /**
   * Replace tags with placeholders
   */
  private replaceTagsWithPlaceholders(content: string, tags: TagReference[]): string {
    let result = content;
    
    // Sort tags by position (descending) to avoid position shifts
    const sortedTags = [...tags].sort((a, b) => b.position.start - a.position.start);

    for (let i = 0; i < sortedTags.length; i++) {
      const tag = sortedTags[i];
      if (!tag) continue;
      
      const placeholder = `__TAG_${i}__`;
      
      result = result.substring(0, tag.position.start) + 
               placeholder + 
               result.substring(tag.position.end);
    }

    return result;
  }

  /**
   * Restore WikiLinks and tags from placeholders
   */
  restoreFromPlaceholders(content: string, parseResult: ParseResult): string {
    let result = content;

    // Restore WikiLinks
    for (let i = 0; i < parseResult.wikiLinks.length; i++) {
      const placeholder = `__WIKILINK_${i}__`;
      const link = parseResult.wikiLinks[i];
      if (link) {
        result = result.replace(placeholder, link.original);
      }
    }

    // Restore tags
    for (let i = 0; i < parseResult.tags.length; i++) {
      const placeholder = `__TAG_${i}__`;
      const tag = parseResult.tags[i];
      if (tag) {
        result = result.replace(placeholder, tag.original);
      }
    }

    return result;
  }
}