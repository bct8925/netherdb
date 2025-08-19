/**
 * Mock for @xenova/transformers to avoid downloading models during tests
 */

export const pipeline = jest.fn();

export interface FeatureExtractionPipeline {
  (texts: string | string[]): Promise<any>;
}