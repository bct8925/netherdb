import { Logger } from '../../utils/Logger';

/**
 * Preserved content block with metadata
 */
export interface PreservedBlock {
  id: string;
  type: 'code' | 'table' | 'callout' | 'math' | 'image';
  content: string;
  startPosition: number;
  endPosition: number;
  metadata?: Record<string, unknown>;
}

/**
 * Result of content preservation processing
 */
export interface PreservationResult {
  processedContent: string;
  preservedBlocks: PreservedBlock[];
  placeholders: Map<string, PreservedBlock>;
}

/**
 * Utility for preserving special markdown elements during chunking
 * Prevents code blocks, tables, and other structured content from being split
 */
export class ContentPreserver {
  private readonly logger: Logger;
  private blockIdCounter = 0;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('ContentPreserver');
  }

  /**
   * Process content and preserve special blocks
   */
  preserveContent(content: string): PreservationResult {
    const preservedBlocks: PreservedBlock[] = [];
    const placeholders = new Map<string, PreservedBlock>();
    let processedContent = content;

    // Preserve in order of priority to avoid conflicts
    processedContent = this.preserveCodeBlocks(processedContent, preservedBlocks, placeholders);
    processedContent = this.preserveTables(processedContent, preservedBlocks, placeholders);
    processedContent = this.preserveCallouts(processedContent, preservedBlocks, placeholders);
    processedContent = this.preserveMathBlocks(processedContent, preservedBlocks, placeholders);
    processedContent = this.preserveImages(processedContent, preservedBlocks, placeholders);

    return {
      processedContent,
      preservedBlocks,
      placeholders,
    };
  }

  /**
   * Restore preserved content from placeholders
   */
  restoreContent(content: string, placeholders: Map<string, PreservedBlock>): string {
    let restoredContent = content;

    for (const [placeholder, block] of placeholders) {
      restoredContent = restoredContent.replace(placeholder, block.content);
    }

    return restoredContent;
  }

  /**
   * Check if content contains any preserved blocks
   */
  hasPreservedContent(content: string): boolean {
    return this.hasCodeBlocks(content) ||
           this.hasTables(content) ||
           this.hasCallouts(content) ||
           this.hasMathBlocks(content) ||
           this.hasImages(content);
  }

  /**
   * Preserve code blocks
   */
  private preserveCodeBlocks(
    content: string,
    blocks: PreservedBlock[],
    placeholders: Map<string, PreservedBlock>
  ): string {
    // Match fenced code blocks
    const fencedPattern = /```[\s\S]*?```/g;
    content = this.preserveMatches(content, fencedPattern, 'code', blocks, placeholders);

    // Match inline code (only if not already in preserved block)
    const inlinePattern = /`[^`\n]+`/g;
    content = this.preserveMatches(content, inlinePattern, 'code', blocks, placeholders, {
      preserveInline: true,
    });

    return content;
  }

  /**
   * Preserve markdown tables
   */
  private preserveTables(
    content: string,
    blocks: PreservedBlock[],
    placeholders: Map<string, PreservedBlock>
  ): string {
    // Match markdown tables (header + separator + rows)
    const tablePattern = /^\|.*\|.*\n\|[\s\-:]+\|.*\n(\|.*\|.*\n?)*/gm;
    return this.preserveMatches(content, tablePattern, 'table', blocks, placeholders);
  }

  /**
   * Preserve Obsidian callouts
   */
  private preserveCallouts(
    content: string,
    blocks: PreservedBlock[],
    placeholders: Map<string, PreservedBlock>
  ): string {
    // Match Obsidian callout blocks
    const calloutPattern = /^>\s*\[![\w-]+\].*(?:\n^>.*)*$/gm;
    return this.preserveMatches(content, calloutPattern, 'callout', blocks, placeholders);
  }

  /**
   * Preserve LaTeX math blocks
   */
  private preserveMathBlocks(
    content: string,
    blocks: PreservedBlock[],
    placeholders: Map<string, PreservedBlock>
  ): string {
    // Match LaTeX math blocks (both $$ and \[ \] syntax)
    const mathPattern = /(\$\$[\s\S]*?\$\$)|(\\\[[\s\S]*?\\\])/g;
    return this.preserveMatches(content, mathPattern, 'math', blocks, placeholders);
  }

  /**
   * Preserve image embeds
   */
  private preserveImages(
    content: string,
    blocks: PreservedBlock[],
    placeholders: Map<string, PreservedBlock>
  ): string {
    // Match Obsidian image embeds and markdown images
    const imagePattern = /(!?\[\[.*?\.(png|jpg|jpeg|gif|svg|webp).*?\]\])|(!?\[.*?\]\(.*?\.(png|jpg|jpeg|gif|svg|webp).*?\))/gi;
    return this.preserveMatches(content, imagePattern, 'image', blocks, placeholders);
  }

  /**
   * Generic method to preserve matches of a pattern
   */
  private preserveMatches(
    content: string,
    pattern: RegExp,
    type: PreservedBlock['type'],
    blocks: PreservedBlock[],
    placeholders: Map<string, PreservedBlock>,
    options: { preserveInline?: boolean } = {}
  ): string {
    let processedContent = content;
    const matches = [...content.matchAll(pattern)];

    // Process matches in reverse order to maintain position indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i]!;
      const matchContent = match[0]!;
      const startPos = match.index!;
      const endPos = startPos + matchContent.length;

      // Skip if this is inline code and we're not preserving inline
      if (type === 'code' && !options.preserveInline && !matchContent.startsWith('```')) {
        // Skip very short inline code that might be just formatting
        if (matchContent.length < 10) {
          continue;
        }
      }

      // Create preserved block
      const blockId = this.generateBlockId(type);
      const placeholder = this.generatePlaceholder(blockId);
      
      const block: PreservedBlock = {
        id: blockId,
        type,
        content: matchContent,
        startPosition: startPos,
        endPosition: endPos,
        metadata: this.extractBlockMetadata(matchContent, type),
      };

      blocks.push(block);
      placeholders.set(placeholder, block);

      // Replace content with placeholder
      processedContent = processedContent.substring(0, startPos) +
                        placeholder +
                        processedContent.substring(endPos);
    }

    return processedContent;
  }

  /**
   * Generate unique block ID
   */
  private generateBlockId(type: string): string {
    return `${type}_${++this.blockIdCounter}_${Date.now()}`;
  }

  /**
   * Generate placeholder text
   */
  private generatePlaceholder(blockId: string): string {
    return `__PRESERVED_${blockId}__`;
  }

  /**
   * Extract metadata from preserved block content
   */
  private extractBlockMetadata(content: string, type: PreservedBlock['type']): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    switch (type) {
      case 'code':
        if (content.startsWith('```')) {
          // Extract language from fenced code block
          const languageMatch = content.match(/^```(\w+)/);
          if (languageMatch) {
            metadata.language = languageMatch[1];
          }
        }
        break;

      case 'callout': {
        // Extract callout type
        const calloutMatch = content.match(/>\s*\[!(\w+)\]/);
        if (calloutMatch) {
          metadata.calloutType = calloutMatch[1];
        }
        break;
      }

      case 'image':
        // Extract image info
        if (content.includes('[[')) {
          // Obsidian embed
          const obsidianMatch = content.match(/\[\[(.*?)\]\]/);
          if (obsidianMatch) {
            metadata.fileName = obsidianMatch[1];
          }
        } else {
          // Markdown image
          const markdownMatch = content.match(/!\[([^\]]*)\]\(([^)]+)\)/);
          if (markdownMatch) {
            metadata.altText = markdownMatch[1];
            metadata.url = markdownMatch[2];
          }
        }
        break;

      case 'table': {
        // Count table dimensions
        const rows = content.split('\n').filter(line => line.trim().startsWith('|'));
        metadata.rows = rows.length - 1; // Exclude header separator
        if (rows.length > 0) {
          const columns = (rows[0]!.match(/\|/g) || []).length - 1;
          metadata.columns = columns;
        }
        break;
      }
    }

    return metadata;
  }

  /**
   * Check methods for different content types
   */
  private hasCodeBlocks(content: string): boolean {
    return /```[\s\S]*?```/.test(content) || /`[^`\n]+`/.test(content);
  }

  private hasTables(content: string): boolean {
    return /^\|.*\|.*\n\|[\s\-:]+\|/.test(content);
  }

  private hasCallouts(content: string): boolean {
    return /^>\s*\[![\w-]+\]/m.test(content);
  }

  private hasMathBlocks(content: string): boolean {
    return /\$\$[\s\S]*?\$\$/.test(content) || /\\\[[\s\S]*?\\\]/.test(content);
  }

  private hasImages(content: string): boolean {
    return /!?\[\[.*?\.(png|jpg|jpeg|gif|svg|webp)/i.test(content) ||
           /!\[.*?\]\(.*?\.(png|jpg|jpeg|gif|svg|webp)/i.test(content);
  }

  /**
   * Get summary of preserved content
   */
  getPreservationSummary(blocks: PreservedBlock[]): Record<string, number> {
    const summary: Record<string, number> = {};
    
    for (const block of blocks) {
      summary[block.type] = (summary[block.type] || 0) + 1;
    }
    
    return summary;
  }

  /**
   * Check if content should be kept intact (contains only preserved blocks)
   */
  shouldKeepIntact(content: string, preservationResult: PreservationResult): boolean {
    // If the processed content is mostly placeholders, keep the chunk intact
    const remainingText = preservationResult.processedContent
      .replace(/__PRESERVED_\w+_\d+_\d+__/g, '')
      .trim();
    
    // If less than 20% of content is non-preserved text, keep intact
    return remainingText.length < content.length * 0.2;
  }
}