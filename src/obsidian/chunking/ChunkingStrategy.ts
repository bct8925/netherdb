import { ChunkStrategy, ChunkingResult, ChunkType, ChunkMetadata } from '../../types/Common';
import { ParsedMarkdown } from '../parser/MarkdownParser';
import { Logger } from '../../utils/Logger';

/**
 * Abstract base class for document chunking strategies
 */
export abstract class ChunkingStrategy {
  protected readonly logger: Logger;
  protected readonly strategy: ChunkStrategy;

  constructor(strategy: ChunkStrategy, logger?: Logger) {
    this.strategy = strategy;
    this.logger = logger || new Logger('ChunkingStrategy');
  }

  /**
   * Chunk a parsed markdown document
   */
  abstract chunk(document: ParsedMarkdown, sourceFile: string): Promise<ChunkingResult>;

  /**
   * Estimate token count for text
   * Simple estimation: ~4 characters per token for English text
   */
  protected estimateTokenCount(text: string): number {
    // Simple heuristic: average ~4 characters per token
    // This is a rough estimate - real tokenization would be more accurate
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate unique chunk ID
   */
  protected generateChunkId(sourceFile: string, chunkIndex: number): string {
    const fileHash = this.hashString(sourceFile);
    return `${fileHash}_${chunkIndex}`;
  }

  /**
   * Simple string hash function
   */
  protected hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Detect content type of a text chunk
   */
  protected detectChunkType(content: string): ChunkType {
    const trimmed = content.trim();
    
    // Check for headings
    if (/^#{1,6}\s/.test(trimmed)) {
      return 'heading';
    }
    
    // Check for code blocks
    if (/^```[\s\S]*```$/m.test(trimmed) || trimmed.startsWith('```')) {
      return 'code';
    }
    
    // Check for tables
    if (/\|.*\|/.test(trimmed) && /[-:]+\|/.test(trimmed)) {
      return 'table';
    }
    
    // Check for callouts (Obsidian syntax)
    if (/^>\s*\[!\w+\]/.test(trimmed)) {
      return 'callout';
    }
    
    // Check for lists
    if (/^[\s]*[-*+]\s/.test(trimmed) || /^[\s]*\d+\.\s/.test(trimmed)) {
      return 'list';
    }
    
    // Check for quotes
    if (/^>\s/.test(trimmed)) {
      return 'quote';
    }
    
    // Default to paragraph
    return 'paragraph';
  }

  /**
   * Extract heading level from content
   */
  protected getHeadingLevel(content: string): number | undefined {
    const match = content.trim().match(/^(#{1,6})\s/);
    return match ? match[1]!.length : undefined;
  }

  /**
   * Check if content contains code blocks
   */
  protected hasCodeBlocks(content: string): boolean {
    return /```[\s\S]*?```/.test(content) || /`[^`\n]+`/.test(content);
  }

  /**
   * Check if content contains tables
   */
  protected hasTables(content: string): boolean {
    return /\|.*\|/.test(content) && /[-:]+\|/.test(content);
  }

  /**
   * Check if content contains callouts
   */
  protected hasCallouts(content: string): boolean {
    return />\s*\[!\w+\]/.test(content);
  }

  /**
   * Check if content contains WikiLinks
   */
  protected hasWikiLinks(content: string): boolean {
    return /\[\[.*?\]\]/.test(content);
  }

  /**
   * Create chunk metadata
   */
  protected createChunkMetadata(
    content: string,
    type: ChunkType,
    baseMetadata: Partial<ChunkMetadata> = {}
  ): ChunkMetadata {
    const headingLevel = this.getHeadingLevel(content);
    
    return {
      ...(baseMetadata.title && { title: baseMetadata.title }),
      ...(baseMetadata.author && { author: baseMetadata.author }),
      tags: baseMetadata.tags || [],
      ...(baseMetadata.date && { date: baseMetadata.date }),
      type,
      ...(headingLevel !== undefined && { headingLevel }),
      hasCodeBlocks: this.hasCodeBlocks(content),
      hasTables: this.hasTables(content),
      hasCallouts: this.hasCallouts(content),
      hasWikiLinks: this.hasWikiLinks(content),
      custom: baseMetadata.custom || {},
    };
  }

  /**
   * Extract current header context from document structure
   */
  protected extractHeaderContext(
    content: string,
    position: number,
    headings: Array<{ level: number; text: string; position: number }>
  ): string[] {
    const headers: string[] = [];
    
    // Find all headings that come before this position
    const precedingHeadings = headings.filter(h => h.position <= position);
    
    if (precedingHeadings.length === 0) {
      return headers;
    }
    
    // Build header hierarchy
    let currentLevel = 1;
    for (const heading of precedingHeadings) {
      if (heading.level <= currentLevel) {
        // Trim headers array to current level
        headers.splice(heading.level - 1);
        headers[heading.level - 1] = heading.text;
        currentLevel = heading.level;
      } else {
        // Add to current level
        headers[heading.level - 1] = heading.text;
      }
    }
    
    return headers.filter(h => h); // Remove empty entries
  }

  /**
   * Add overlap between chunks if configured
   */
  protected addOverlap(
    currentChunk: string,
    nextChunk: string,
    overlapTokens: number
  ): { current: string; next: string } {
    if (overlapTokens <= 0) {
      return { current: currentChunk, next: nextChunk };
    }

    // Simple word-based overlap
    const currentWords = currentChunk.split(/\s+/);
    
    // Estimate words per token (roughly 0.75 words per token)
    const overlapWords = Math.ceil(overlapTokens * 0.75);
    
    if (currentWords.length > overlapWords) {
      const overlapText = currentWords.slice(-overlapWords).join(' ');
      return {
        current: currentChunk,
        next: overlapText + ' ' + nextChunk,
      };
    }
    
    return { current: currentChunk, next: nextChunk };
  }
}

/**
 * Default chunking strategy configuration
 */
export const DEFAULT_CHUNK_STRATEGY: ChunkStrategy = {
  splitByHeaders: true,
  splitByParagraphs: true,
  maxTokens: 512,
  overlapTokens: 50,
  includeHeaders: true,
  preserveCodeBlocks: true,
  preserveTables: true,
  preserveCallouts: true,
};