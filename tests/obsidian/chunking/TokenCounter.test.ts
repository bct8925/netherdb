import { TokenCounter } from '../../../src/obsidian/chunking/TokenCounter';
import { Logger } from '../../../src/utils/Logger';

describe('TokenCounter', () => {
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
  });

  describe('simple strategy', () => {
    let counter: TokenCounter;

    beforeEach(() => {
      counter = TokenCounter.createSimple(4, mockLogger);
    });

    it('should count tokens using character-based estimation', () => {
      const text = 'This is a test sentence.';
      const tokenCount = counter.countTokens(text);
      
      // 24 characters / 4 chars per token = 6 tokens
      expect(tokenCount).toBe(6);
    });

    it('should handle empty strings', () => {
      expect(counter.countTokens('')).toBe(0);
      expect(counter.countTokens('   ')).toBe(1); // 3 chars / 4 = 0.75, rounded up to 1
    });

    it('should be configurable for chars per token', () => {
      const counter2 = TokenCounter.createSimple(2, mockLogger);
      const text = 'test';
      
      expect(counter.countTokens(text)).toBe(1); // 4 chars / 4 = 1
      expect(counter2.countTokens(text)).toBe(2); // 4 chars / 2 = 2
    });
  });

  describe('whitespace strategy', () => {
    let counter: TokenCounter;

    beforeEach(() => {
      counter = TokenCounter.createWhitespace(mockLogger);
    });

    it('should count tokens based on words', () => {
      const text = 'This is a test sentence.';
      const tokenCount = counter.countTokens(text);
      
      // 5 words + punctuation adjustment
      expect(tokenCount).toBeGreaterThanOrEqual(5);
      expect(tokenCount).toBeLessThanOrEqual(7);
    });

    it('should handle punctuation correctly', () => {
      const text = 'Hello, world! How are you?';
      const tokenCount = counter.countTokens(text);
      
      // 5 words + punctuation
      expect(tokenCount).toBeGreaterThan(5);
    });

    it('should handle multiple whitespace', () => {
      const text = 'word1    word2\n\nword3\t\tword4';
      const tokenCount = counter.countTokens(text);
      
      expect(tokenCount).toBe(4); // Just the 4 words
    });

    it('should handle empty content', () => {
      expect(counter.countTokens('')).toBe(0);
      expect(counter.countTokens('   \n\t   ')).toBe(0);
    });
  });

  describe('gpt-estimate strategy', () => {
    let counter: TokenCounter;

    beforeEach(() => {
      counter = TokenCounter.createGPTEstimate(mockLogger);
    });

    it('should provide more sophisticated token counting', () => {
      const text = 'This is a test sentence with punctuation!';
      const tokenCount = counter.countTokens(text);
      
      // Should be roughly word count + punctuation
      expect(tokenCount).toBeGreaterThan(6);
      expect(tokenCount).toBeLessThanOrEqual(12);
    });

    it('should handle long words differently', () => {
      const shortWords = 'cat dog bat';
      const longWords = 'categorization documentation implementation';
      
      const shortCount = counter.countTokens(shortWords);
      const longCount = counter.countTokens(longWords);
      
      // Long words should result in more tokens per word
      expect(longCount).toBeGreaterThan(shortCount);
    });

    it('should handle numbers appropriately', () => {
      const text = '123 45678 999999999';
      const tokenCount = counter.countTokens(text);
      
      // Should be more than 3 tokens due to long numbers
      expect(tokenCount).toBeGreaterThan(3);
    });

    it('should handle special characters', () => {
      const text = 'Hello @user #hashtag $variable %percentage';
      const tokenCount = counter.countTokens(text);
      
      // Should account for special characters as separate tokens
      expect(tokenCount).toBeGreaterThan(5);
    });
  });

  describe('fitsWithinLimit', () => {
    let counter: TokenCounter;

    beforeEach(() => {
      counter = TokenCounter.createSimple(4);
    });

    it('should correctly check if text fits within limit', () => {
      const shortText = 'short';  // ~1 token
      const longText = 'This is a much longer text that exceeds the limit';  // ~12+ tokens
      
      expect(counter.fitsWithinLimit(shortText, 5)).toBe(true);
      expect(counter.fitsWithinLimit(longText, 5)).toBe(false);
    });
  });

  describe('splitToFitTokens', () => {
    let counter: TokenCounter;

    beforeEach(() => {
      counter = TokenCounter.createSimple(4);
    });

    it('should return single chunk if text fits', () => {
      const text = 'Short text';
      const chunks = counter.splitToFitTokens(text, 100);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('should split text into multiple chunks if too long', () => {
      const text = 'This is a very long text that should be split into multiple chunks when the token limit is exceeded by the content length.';
      const chunks = counter.splitToFitTokens(text, 10); // Small limit
      
      expect(chunks.length).toBeGreaterThan(1);
      
      // Each chunk should fit within limit
      for (const chunk of chunks) {
        expect(counter.fitsWithinLimit(chunk, 10)).toBe(true);
      }
      
      // Chunks should combine back to original content (roughly)
      const combined = chunks.join(' ').replace(/\s+/g, ' ').trim();
      const original = text.replace(/\s+/g, ' ').trim();
      expect(combined).toContain(original.substring(0, 20)); // At least beginning should match
    });

    it('should try to break at sentence boundaries', () => {
      const text = 'First sentence here. Second sentence follows. Third sentence concludes.';
      const chunks = counter.splitToFitTokens(text, 8);
      
      // Should prefer sentence boundaries
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should handle edge cases', () => {
      const emptyResult = counter.splitToFitTokens('', 10);
      expect(emptyResult.length).toBe(0);
      expect(counter.splitToFitTokens('word', 1)).toEqual(['word']);
    });
  });

  describe('getCharsPerTokenRatio', () => {
    it('should return configured ratio', () => {
      const counter = TokenCounter.createSimple(5);
      expect(counter.getCharsPerTokenRatio()).toBe(5);
    });
  });

  describe('configuration handling', () => {
    it('should handle unknown strategy gracefully', () => {
      const counter = new TokenCounter({
        strategy: 'unknown' as any,
      }, mockLogger);
      
      const tokenCount = counter.countTokens('test text');
      
      expect(tokenCount).toBeGreaterThan(0); // Should fall back to simple
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown token counting strategy')
      );
    });

    it('should use default values for missing config', () => {
      const counter = new TokenCounter({}, mockLogger);
      
      expect(counter.getCharsPerTokenRatio()).toBe(4); // Default value
    });
  });

  describe('static factory methods', () => {
    it('should create correct strategy types', () => {
      const simple = TokenCounter.createSimple();
      const whitespace = TokenCounter.createWhitespace();
      const gpt = TokenCounter.createGPTEstimate();
      
      // Test that they produce different results for the same text
      const text = 'This is a test with punctuation!';
      
      const simpleCount = simple.countTokens(text);
      const whitespaceCount = whitespace.countTokens(text);
      const gptCount = gpt.countTokens(text);
      
      // They should all be different (or at least not all the same)
      const counts = [simpleCount, whitespaceCount, gptCount];
      const uniqueCounts = new Set(counts);
      expect(uniqueCounts.size).toBeGreaterThan(1);
    });
  });
});