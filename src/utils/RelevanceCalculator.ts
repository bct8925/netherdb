/**
 * Utility functions for calculating relevance scores from vector database results
 */

/**
 * Converts distance or score values to a normalized relevance score (0-1)
 *
 * @param score Raw score from vector database (if available)
 * @param distance Distance value from vector database (lower = more relevant)
 * @returns Normalized relevance score between 0 and 1
 */
export function calculateRelevanceScore(score?: number, distance?: number): number {
  // Convert distance to a 0-1 relevance score (lower distance = higher relevance)
  if (distance !== undefined) {
    // LanceDB distance values typically range from 0-100+, convert to 0-1 relevance
    // Use exponential decay to emphasize closer matches
    const normalizedDistance = Math.min(distance / 50, 1); // Cap at distance 50
    return Math.max(0, Math.min(1, 1 - normalizedDistance));
  }

  if (score !== undefined && score > 0) {
    return Math.max(0, Math.min(1, score));
  }

  return 0.1; // Default low score when no meaningful score available
}

/**
 * Converts a distance value to a score using the same algorithm as relevance calculation
 * This ensures consistency between score and distance-based calculations
 *
 * @param distance Distance value from vector database
 * @returns Score value that would produce the same relevance
 */
export function distanceToScore(distance: number): number {
  // Convert distance to the same 0-1 range as calculateRelevanceScore
  const normalizedDistance = Math.min(distance / 50, 1);
  return Math.max(0, Math.min(1, 1 - normalizedDistance));
}

/**
 * Formats a relevance score as a percentage string
 *
 * @param relevance Relevance score between 0 and 1
 * @returns Formatted percentage string (e.g., "85%")
 */
export function formatRelevancePercent(relevance: number): string {
  return `${Math.round(relevance * 100)}%`;
}

/**
 * Creates a visual relevance bar using block characters
 *
 * @param relevance Relevance score between 0 and 1
 * @param maxBars Maximum number of bars to display (default: 10)
 * @returns Visual bar string (e.g., "█████")
 */
export function createRelevanceBar(relevance: number, maxBars: number = 10): string {
  const filledBars = Math.round(relevance * maxBars);
  return '█'.repeat(filledBars);
}
