import { ChunkingStrategy, DEFAULT_CHUNK_STRATEGY } from './ChunkingStrategy';
import { ChunkStrategy, DocumentChunk, ChunkingResult } from '../../types/Common';
import { ParsedDocument } from '../parser/MarkdownParser';
import { Logger } from '../../utils/Logger';

/**
 * Header-based chunking strategy that splits documents at heading boundaries
 * while respecting token limits and context preservation
 */
export class HeaderBasedChunker extends ChunkingStrategy {
  constructor(strategy: Partial<ChunkStrategy> = {}, logger?: Logger) {
    super({ ...DEFAULT_CHUNK_STRATEGY, ...strategy }, logger);
  }

  /**
   * Chunk document by headers with intelligent splitting
   */
  async chunk(document: ParsedDocument, sourceFile: string): Promise<ChunkingResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const chunks: DocumentChunk[] = [];

    try {
      this.logger.debug(`Starting header-based chunking for: ${sourceFile}`);
      
      // If document has no content, return empty result
      if (!document.content || document.content.trim().length === 0) {
        return {
          chunks: [],
          totalTokens: 0,
          chunkingStrategy: this.strategy,
          processingTime: Date.now() - startTime,
          warnings: ['Document has no content to chunk'],
        };
      }

      // Extract sections based on headers
      const sections = this.extractSections(document);
      
      // Process each section
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i]!;
        const sectionChunks = await this.processSectionContent(
          section,
          sourceFile,
          chunks.length,
          document
        );
        
        chunks.push(...sectionChunks);
      }

      // Link chunks together
      this.linkChunks(chunks);

      const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

      this.logger.debug(
        `Chunking completed: ${chunks.length} chunks, ${totalTokens} tokens`
      );

      return {
        chunks,
        totalTokens,
        chunkingStrategy: this.strategy,
        processingTime: Date.now() - startTime,
        warnings,
      };

    } catch (error) {
      this.logger.error('Error during chunking:', error);
      throw error;
    }
  }

  /**
   * Extract document sections based on headings
   */
  private extractSections(document: ParsedDocument): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const content = document.content;
    const headings = document.metadata.headings || [];

    if (headings.length === 0) {
      // No headings - treat entire document as one section
      return [{
        content: content,
        startPosition: 0,
        endPosition: content.length,
        headers: [],
        headingLevel: 0,
      }];
    }

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i]!;
      const nextHeading = headings[i + 1];
      
      // Content before first heading
      if (i === 0 && heading.position > 0) {
        sections.push({
          content: content.substring(0, heading.position),
          startPosition: 0,
          endPosition: heading.position,
          headers: [],
          headingLevel: 0,
        });
      }

      // Section content
      const sectionStart = heading.position;
      const sectionEnd = nextHeading ? nextHeading.position : content.length;
      const sectionContent = content.substring(sectionStart, sectionEnd);

      // Extract header hierarchy up to this point
      const headerContext = this.buildHeaderHierarchy(headings, i);

      sections.push({
        content: sectionContent,
        startPosition: sectionStart,
        endPosition: sectionEnd,
        headers: headerContext,
        headingLevel: heading.level,
        headingText: heading.text,
      });
    }

    return sections;
  }

  /**
   * Build header hierarchy for a given heading index
   */
  private buildHeaderHierarchy(
    headings: Array<{ level: number; text: string; position: number }>,
    currentIndex: number
  ): string[] {
    const currentHeading = headings[currentIndex]!;
    const hierarchy: string[] = [];

    // Include current heading if configured
    if (this.strategy.includeHeaders) {
      hierarchy.push(currentHeading.text);
    }

    // Build parent hierarchy
    for (let i = currentIndex - 1; i >= 0; i--) {
      const heading = headings[i]!;
      if (heading.level < currentHeading.level) {
        hierarchy.unshift(heading.text);
        if (heading.level === 1) break; // Stop at top level
      }
    }

    return hierarchy;
  }

  /**
   * Process section content, potentially splitting if too large
   */
  private async processSectionContent(
    section: DocumentSection,
    sourceFile: string,
    startingChunkIndex: number,
    document: ParsedDocument
  ): Promise<DocumentChunk[]> {
    const sectionTokens = this.estimateTokenCount(section.content);
    
    // If section fits within token limit, create single chunk
    if (sectionTokens <= this.strategy.maxTokens) {
      return [this.createChunk(
        section.content,
        section,
        sourceFile,
        startingChunkIndex,
        document
      )];
    }

    // Section too large - need to split further
    this.logger.debug(
      `Section too large (${sectionTokens} tokens), splitting: ${section.headingText || 'untitled'}`
    );

    return this.splitLargeSection(section, sourceFile, startingChunkIndex, document);
  }

  /**
   * Split large section into smaller chunks
   */
  private splitLargeSection(
    section: DocumentSection,
    sourceFile: string,
    startingChunkIndex: number,
    document: ParsedDocument
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const content = section.content;

    if (this.strategy.splitByParagraphs) {
      // Split by paragraphs first
      const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
      let currentChunk = '';
      let currentTokens = 0;

      for (const paragraph of paragraphs) {
        const paragraphTokens = this.estimateTokenCount(paragraph);
        
        // If this single paragraph exceeds token limit, split it by token count
        if (paragraphTokens > this.strategy.maxTokens) {
          // Save current chunk if it exists
          if (currentChunk.trim()) {
            chunks.push(this.createChunk(
              currentChunk.trim(),
              section,
              sourceFile,
              startingChunkIndex + chunks.length,
              document
            ));
            currentChunk = '';
            currentTokens = 0;
          }
          
          // Split the oversized paragraph by token count
          const paragraphChunks = this.splitTextByTokenCount(
            paragraph,
            section,
            sourceFile,
            startingChunkIndex + chunks.length,
            document
          );
          chunks.push(...paragraphChunks);
        }
        // Check if adding this paragraph would exceed limit
        else if (currentTokens + paragraphTokens > this.strategy.maxTokens && currentChunk) {
          // Create chunk with current content
          chunks.push(this.createChunk(
            currentChunk.trim(),
            section,
            sourceFile,
            startingChunkIndex + chunks.length,
            document
          ));
          
          currentChunk = paragraph;
          currentTokens = paragraphTokens;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
          currentTokens += paragraphTokens;
        }
      }

      // Add remaining content
      if (currentChunk.trim()) {
        chunks.push(this.createChunk(
          currentChunk.trim(),
          section,
          sourceFile,
          startingChunkIndex + chunks.length,
          document
        ));
      }
    } else {
      // Fallback: split by token count
      chunks.push(...this.splitByTokenCount(section, sourceFile, startingChunkIndex, document));
    }

    // Add overlap between chunks if configured
    if (this.strategy.overlapTokens > 0 && chunks.length > 1) {
      this.addOverlapToChunks(chunks);
    }

    return chunks;
  }

  /**
   * Split content by token count as fallback
   */
  private splitByTokenCount(
    section: DocumentSection,
    sourceFile: string,
    startingChunkIndex: number,
    document: ParsedDocument
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const content = section.content;
    const targetChars = this.strategy.maxTokens * 4; // Rough char-to-token conversion
    
    let start = 0;
    let chunkIndex = startingChunkIndex;

    while (start < content.length) {
      let end = Math.min(start + targetChars, content.length);
      
      // Try to break at word boundary
      if (end < content.length) {
        const spaceIndex = content.lastIndexOf(' ', end);
        if (spaceIndex > start) {
          end = spaceIndex;
        }
      }

      const chunkContent = content.substring(start, end).trim();
      if (chunkContent) {
        chunks.push(this.createChunk(
          chunkContent,
          section,
          sourceFile,
          chunkIndex++,
          document
        ));
      }

      start = end;
    }

    return chunks;
  }

  /**
   * Create a document chunk
   */
  private createChunk(
    content: string,
    section: DocumentSection,
    sourceFile: string,
    chunkIndex: number,
    document: ParsedDocument
  ): DocumentChunk {
    const chunkType = this.detectChunkType(content);
    const tokens = this.estimateTokenCount(content);

    const metadata = this.createChunkMetadata(content, chunkType, document, {
      ...(document.metadata.title && { title: document.metadata.title }),
      ...(document.metadata.author && { author: document.metadata.author }),
      tags: document.tags,
      ...(document.metadata.date && { date: document.metadata.date }),
    });

    return {
      id: this.generateChunkId(sourceFile, chunkIndex),
      content: content.trim(),
      tokens,
      sourceFile,
      chunkIndex,
      startPosition: section.startPosition,
      endPosition: section.endPosition,
      headers: section.headers,
      section: section.headingText,
      metadata,
    };
  }

  /**
   * Add overlap content to chunks
   */
  private addOverlapToChunks(chunks: DocumentChunk[]): void {
    for (let i = 0; i < chunks.length - 1; i++) {
      const current = chunks[i]!;
      const next = chunks[i + 1]!;
      
      const overlapped = this.addOverlap(
        current.content,
        next.content,
        this.strategy.overlapTokens
      );
      
      next.content = overlapped.next;
      next.tokens = this.estimateTokenCount(next.content);
    }
  }

  /**
   * Split text by token count while trying to preserve word boundaries
   */
  private splitTextByTokenCount(
    text: string,
    section: DocumentSection,
    sourceFile: string,
    startingChunkIndex: number,
    document: ParsedDocument
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    // Use a more conservative target to ensure we stay under the limit
    const targetChars = this.strategy.maxTokens * 3.5; // More conservative char-to-token conversion
    
    let start = 0;
    let chunkIndex = startingChunkIndex;

    while (start < text.length) {
      let end = Math.min(start + targetChars, text.length);
      
      // Try to break at word boundary
      if (end < text.length) {
        const spaceIndex = text.lastIndexOf(' ', end);
        if (spaceIndex > start) {
          end = spaceIndex;
        }
      }

      const chunkContent = text.substring(start, end).trim();
      if (chunkContent) {
        // Double-check that we're within token limit
        const actualTokens = this.estimateTokenCount(chunkContent);
        if (actualTokens > this.strategy.maxTokens) {
          // If still too large, try a smaller chunk
          const smallerEnd = Math.min(start + this.strategy.maxTokens * 3, text.length);
          const smallerSpaceIndex = text.lastIndexOf(' ', smallerEnd);
          end = smallerSpaceIndex > start ? smallerSpaceIndex : smallerEnd;
          const smallerContent = text.substring(start, end).trim();
          
          if (smallerContent) {
            chunks.push(this.createChunk(
              smallerContent,
              section,
              sourceFile,
              chunkIndex++,
              document
            ));
          }
        } else {
          chunks.push(this.createChunk(
            chunkContent,
            section,
            sourceFile,
            chunkIndex++,
            document
          ));
        }
      }

      start = end;
    }

    return chunks;
  }

  /**
   * Link chunks together with previous/next relationships
   */
  private linkChunks(chunks: DocumentChunk[]): void {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      
      if (i > 0) {
        chunk.previousChunkId = chunks[i - 1]!.id;
      }
      
      if (i < chunks.length - 1) {
        chunk.nextChunkId = chunks[i + 1]!.id;
      }
    }
  }
}

/**
 * Internal interface for document sections
 */
interface DocumentSection {
  content: string;
  startPosition: number;
  endPosition: number;
  headers: string[];
  headingLevel: number;
  headingText?: string;
}