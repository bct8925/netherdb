/**
 * Unit tests for search scoring functionality
 * 
 * This test suite verifies that search results have meaningful scores
 * and catches issues where scores are incorrectly set to zero.
 */

import { calculateRelevanceScore, distanceToScore, formatRelevancePercent, createRelevanceBar } from '../../src/utils/RelevanceCalculator';

describe('Search Scoring Unit Tests', () => {
  describe('RelevanceCalculator', () => {
    describe('calculateRelevanceScore', () => {
      it('should calculate relevance from distance values', () => {
        // Lower distances should give higher relevance
        expect(calculateRelevanceScore(undefined, 0)).toBe(1.0);     // Perfect match
        expect(calculateRelevanceScore(undefined, 25)).toBe(0.5);    // 50% relevant
        expect(calculateRelevanceScore(undefined, 50)).toBe(0.0);    // 0% relevant
        expect(calculateRelevanceScore(undefined, 100)).toBe(0.0);   // Still 0% (capped)
      });

      it('should use distance first, then score if distance not provided', () => {
        // Distance takes precedence when provided
        expect(calculateRelevanceScore(0.8, 0)).toBe(1.0);    // Distance=0 gives perfect score
        expect(calculateRelevanceScore(0.8, 25)).toBe(0.5);   // Distance=25 gives 50%
        expect(calculateRelevanceScore(0.8, 50)).toBe(0.0);   // Distance=50 gives 0%
        
        // Score used only when distance not provided
        expect(calculateRelevanceScore(0.8, undefined)).toBe(0.8);
        expect(calculateRelevanceScore(0.5, undefined)).toBe(0.5);
        expect(calculateRelevanceScore(1.0, undefined)).toBe(1.0);
      });

      it('should return default score when neither score nor distance provided', () => {
        expect(calculateRelevanceScore()).toBe(0.1);
        expect(calculateRelevanceScore(undefined, undefined)).toBe(0.1);
      });

      it('should ignore zero scores and use distance instead', () => {
        expect(calculateRelevanceScore(0, 25)).toBe(0.5);  // Should use distance, not zero score
        expect(calculateRelevanceScore(0, 0)).toBe(1.0);   // Should use zero distance for perfect match
      });

      it('should never return scores outside [0, 1] range', () => {
        expect(calculateRelevanceScore(undefined, -10)).toBe(1.0);   // Negative distance capped to 1
        expect(calculateRelevanceScore(undefined, 1000)).toBe(0.0);  // Large distance capped to 0
        expect(calculateRelevanceScore(-0.5, undefined)).toBe(0.1);  // Negative score -> default score
        expect(calculateRelevanceScore(1.5, undefined)).toBe(1.0);   // Score > 1 capped to 1
      });
    });

    describe('distanceToScore', () => {
      it('should convert distance to meaningful score', () => {
        expect(distanceToScore(0)).toBe(1.0);    // Perfect match
        expect(distanceToScore(25)).toBe(0.5);   // 50% score
        expect(distanceToScore(50)).toBe(0.0);   // 0% score
        expect(distanceToScore(100)).toBe(0.0);  // Still 0% (capped)
      });

      it('should never return zero for small distances', () => {
        expect(distanceToScore(1)).toBeGreaterThan(0.9);
        expect(distanceToScore(5)).toBeGreaterThan(0.8);
        expect(distanceToScore(10)).toBeGreaterThan(0.7);
      });

      it('should be consistent with calculateRelevanceScore', () => {
        const distances = [0, 5, 10, 25, 50, 100];
        distances.forEach(distance => {
          const scoreFromDistance = distanceToScore(distance);
          const relevanceFromDistance = calculateRelevanceScore(undefined, distance);
          expect(scoreFromDistance).toBe(relevanceFromDistance);
        });
      });
    });

    describe('formatRelevancePercent', () => {
      it('should format relevance as percentage', () => {
        expect(formatRelevancePercent(0.0)).toBe('0%');
        expect(formatRelevancePercent(0.5)).toBe('50%');
        expect(formatRelevancePercent(1.0)).toBe('100%');
        expect(formatRelevancePercent(0.123)).toBe('12%');
        expect(formatRelevancePercent(0.876)).toBe('88%');
      });
    });

    describe('createRelevanceBar', () => {
      it('should create visual relevance bars', () => {
        expect(createRelevanceBar(0.0)).toBe('');
        expect(createRelevanceBar(0.5)).toBe('█████');
        expect(createRelevanceBar(1.0)).toBe('██████████');
        expect(createRelevanceBar(0.25)).toBe('███');
      });

      it('should support custom bar length', () => {
        expect(createRelevanceBar(0.5, 4)).toBe('██');
        expect(createRelevanceBar(1.0, 5)).toBe('█████');
        expect(createRelevanceBar(0.2, 5)).toBe('█');
      });
    });
  });

  describe('Score Validation', () => {
    it('should detect zero scores that indicate a bug', () => {
      // This test would have caught the original bug
      const mockSearchResults = [
        { score: 0.0, distance: 26.1613 },  // Original bug: score was 0
        { score: 0.0, distance: 44.3026 },  // Original bug: score was 0
        { score: 0.0, distance: 45.0818 },  // Original bug: score was 0
      ];

      // With our fix, these should now have meaningful scores
      mockSearchResults.forEach(result => {
        const correctedScore = distanceToScore(result.distance);
        expect(correctedScore).toBeGreaterThan(0);
        expect(correctedScore).toBeLessThanOrEqual(1);
      });

      // Verify the specific scores match what we expect
      expect(distanceToScore(26.1613)).toBeCloseTo(0.4768, 3);
      expect(distanceToScore(44.3026)).toBeCloseTo(0.1139, 3);
      expect(distanceToScore(45.0818)).toBeCloseTo(0.0984, 3);
    });

    it('should maintain score-distance inverse relationship', () => {
      const testCases = [
        { distance: 10, expectedMinScore: 0.79 }, // Allow for floating point precision
        { distance: 20, expectedMinScore: 0.59 },
        { distance: 30, expectedMinScore: 0.39 },
        { distance: 40, expectedMinScore: 0.19 },
        { distance: 50, expectedMinScore: 0.0 },
      ];

      testCases.forEach(({ distance, expectedMinScore }) => {
        const score = distanceToScore(distance);
        expect(score).toBeGreaterThanOrEqual(expectedMinScore);
      });
    });

    it('should handle edge cases gracefully', () => {
      // Test with extreme values
      expect(distanceToScore(0)).toBe(1.0);
      expect(distanceToScore(Infinity)).toBe(0.0);
      expect(distanceToScore(-1)).toBe(1.0);  // Negative distance
      
      // Test with NaN (should not happen in practice, but good to verify)
      const nanResult = distanceToScore(NaN);
      expect(Number.isNaN(nanResult)).toBe(true); // NaN input produces NaN output
    });
  });

  describe('Regression Tests', () => {
    it('should prevent regression to zero scores', () => {
      // Test the exact scenario from the bug report
      const searchResults = [
        { id: 'apex-1', distance: 26.1613, originalScore: 0.0000 },
        { id: 'apex-2', distance: 26.1613, originalScore: 0.0000 },
        { id: 'sobject-1', distance: 44.3026, originalScore: 0.0000 },
        { id: 'visualforce-1', distance: 45.0028, originalScore: 0.0000 },
      ];

      searchResults.forEach(result => {
        // Apply our fix
        const fixedScore = distanceToScore(result.distance);
        
        // Verify the bug is fixed
        expect(fixedScore).toBeGreaterThan(result.originalScore);
        expect(fixedScore).toBeGreaterThan(0);
        expect(fixedScore).toBeLessThanOrEqual(1);
        
        // Verify realistic scoring
        if (result.distance < 30) {
          expect(fixedScore).toBeGreaterThan(0.4);  // Good matches
        } else if (result.distance < 45) {
          expect(fixedScore).toBeGreaterThan(0.1);  // Reasonable matches
        }
      });
    });

    it('should maintain consistent scoring between identical distances', () => {
      const distance = 26.1613;
      const score1 = distanceToScore(distance);
      const score2 = distanceToScore(distance);
      const score3 = calculateRelevanceScore(undefined, distance);
      
      expect(score1).toBe(score2);
      expect(score1).toBe(score3);
      expect(score1).toBeCloseTo(0.4768, 3);
    });

    it('should order results correctly by score', () => {
      const distances = [26.1613, 44.3026, 45.0028, 45.0818, 45.1740];
      const scores = distances.map(d => distanceToScore(d));
      
      // Scores should be in descending order (higher score = lower distance)
      for (let i = 1; i < scores.length; i++) {
        const prevScore = scores[i-1]!;
        const currScore = scores[i]!;
        expect(prevScore).toBeGreaterThanOrEqual(currScore);
      }
      
      // Verify specific expected order
      expect(scores[0]).toBeCloseTo(0.4768, 3);  // Best score
      expect(scores[scores.length - 1]).toBeCloseTo(0.0965, 3);  // Worst score
    });
  });
});