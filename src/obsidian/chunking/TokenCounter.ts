import { Logger } from '../../utils/Logger';

/**
 * Token counting strategies
 */
export type TokenCountingStrategy = 'simple' | 'whitespace' | 'gpt-estimate';

/**
 * Configuration for token counting
 */
export interface TokenCountingConfig {
  strategy: TokenCountingStrategy;
  averageCharsPerToken?: number;
  model?: string;
}

/**
 * Token counter utility with multiple estimation strategies
 */
export class TokenCounter {
  private readonly logger: Logger;
  private readonly config: TokenCountingConfig;

  constructor(config: Partial<TokenCountingConfig> = {}, logger?: Logger) {
    this.config = {
      strategy: 'simple',
      averageCharsPerToken: 4,
      ...config,
    };
    this.logger = logger || new Logger('TokenCounter');
  }

  /**
   * Count tokens in text using configured strategy
   */
  countTokens(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }

    switch (this.config.strategy) {
      case 'simple':
        return this.simpleTokenCount(text);
      case 'whitespace':
        return this.whitespaceTokenCount(text);
      case 'gpt-estimate':
        return this.gptEstimateTokenCount(text);
      default:
        this.logger.warn(`Unknown token counting strategy: ${this.config.strategy}`);
        return this.simpleTokenCount(text);
    }
  }

  /**
   * Estimate if text would fit within token limit
   */
  fitsWithinLimit(text: string, maxTokens: number): boolean {
    return this.countTokens(text) <= maxTokens;
  }

  /**
   * Split text to fit within token limit
   */
  splitToFitTokens(text: string, maxTokens: number): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }
    
    if (this.fitsWithinLimit(text, maxTokens)) {
      return [text];
    }

    const chunks: string[] = [];
    const targetChars = maxTokens * (this.config.averageCharsPerToken || 4);
    
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + targetChars, text.length);
      
      // Try to break at sentence boundary
      if (end < text.length) {
        const sentenceEnd = this.findSentenceBoundary(text, end, start);
        if (sentenceEnd > start) {
          end = sentenceEnd;
        } else {
          // Fallback to word boundary
          const wordEnd = this.findWordBoundary(text, end, start);
          if (wordEnd > start) {
            end = wordEnd;
          }
        }
      }

      const chunk = text.substring(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }

      start = end;
    }

    return chunks;
  }

  /**
   * Get estimated character-to-token ratio for current strategy
   */
  getCharsPerTokenRatio(): number {
    return this.config.averageCharsPerToken || 4;
  }

  /**
   * Simple character-based token estimation
   * Assumes ~4 characters per token for English text
   */
  private simpleTokenCount(text: string): number {
    const charsPerToken = this.config.averageCharsPerToken || 4;
    return Math.ceil(text.length / charsPerToken);
  }

  /**
   * Whitespace-based token counting
   * More accurate for natural language but ignores punctuation
   */
  private whitespaceTokenCount(text: string): number {
    // Split by whitespace and filter empty strings
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    
    // Add extra tokens for punctuation and special characters
    const punctuationCount = (text.match(/[.,!?;:(){}[\]"']/g) || []).length;
    const extraTokens = Math.ceil(punctuationCount * 0.3); // Punctuation adds ~30% extra tokens
    
    return words.length + extraTokens;
  }

  /**
   * GPT-style token estimation
   * More sophisticated estimation based on GPT tokenization patterns
   */
  private gptEstimateTokenCount(text: string): number {
    // GPT tokenizer rules approximation:
    // - Most words are 1 token
    // - Long words may be multiple tokens
    // - Punctuation is often separate tokens
    // - Numbers and special characters have special rules

    let tokenCount = 0;
    
    // Split into words, numbers, and punctuation
    const tokens = text.match(/\w+|[^\w\s]/g) || [];
    
    for (const token of tokens) {
      if (/^\w+$/.test(token)) {
        // Word token
        if (token.length <= 4) {
          tokenCount += 1;
        } else if (token.length <= 8) {
          tokenCount += Math.ceil(token.length / 4);
        } else {
          // Very long words are often multiple tokens
          tokenCount += Math.ceil(token.length / 3);
        }
      } else if (/^\d+$/.test(token)) {
        // Number token
        tokenCount += Math.max(1, Math.ceil(token.length / 2));
      } else {
        // Punctuation or special character
        tokenCount += 1;
      }
    }
    
    return tokenCount;
  }

  /**
   * Find the best sentence boundary near target position
   */
  private findSentenceBoundary(text: string, targetPos: number, minPos: number): number {
    const searchStart = Math.max(minPos, targetPos - 100);
    const searchEnd = Math.min(text.length, targetPos + 50);
    const searchText = text.substring(searchStart, searchEnd);
    
    // Look for sentence endings
    const sentencePattern = /[.!?]\s+/g;
    let match;
    let bestPos = -1;
    
    while ((match = sentencePattern.exec(searchText)) !== null) {
      const actualPos = searchStart + match.index + match[0]!.length;
      if (actualPos <= targetPos && actualPos > minPos) {
        bestPos = actualPos;
      }
    }
    
    return bestPos;
  }

  /**
   * Find the best word boundary near target position
   */
  private findWordBoundary(text: string, targetPos: number, minPos: number): number {
    // Look backwards from target position for word boundary
    for (let i = targetPos; i > minPos; i--) {
      if (/\s/.test(text[i] || '')) {
        return i;
      }
    }
    
    return targetPos;
  }

  /**
   * Create a token counter with specific strategy
   */
  static createSimple(averageCharsPerToken = 4, logger?: Logger): TokenCounter {
    return new TokenCounter({
      strategy: 'simple',
      averageCharsPerToken,
    }, logger);
  }

  static createWhitespace(logger?: Logger): TokenCounter {
    return new TokenCounter({
      strategy: 'whitespace',
    }, logger);
  }

  static createGPTEstimate(logger?: Logger): TokenCounter {
    return new TokenCounter({
      strategy: 'gpt-estimate',
    }, logger);
  }
}

/**
 * Default token counter instance
 */
export const defaultTokenCounter = TokenCounter.createSimple();