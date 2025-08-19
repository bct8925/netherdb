import { z } from 'zod';

// Input Schemas
export const searchKnowledgeInputSchema = {
  query: z.string().describe('The search query text'),
  limit: z.number().optional().default(10).describe('Maximum number of results to return'),
  threshold: z.number().optional().default(0.7).describe('Minimum similarity threshold'),
  filters: z
    .object({
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      fileTypes: z.array(z.string()).optional().describe('Filter by file types'),
      sections: z.array(z.string()).optional().describe('Filter by document sections'),
    })
    .optional()
    .describe('Additional filters for search'),
};
export const searchKnowledgeInputZod = z.object(searchKnowledgeInputSchema);
export type SearchKnowledgeInputType = z.infer<typeof searchKnowledgeInputZod>;

export const getDocumentInputSchema = {
  id: z.string().optional().describe('Document ID'),
  path: z.string().optional().describe('Document path'),
};
export const getDocumentInputZod = z.object(getDocumentInputSchema);
export type GetDocumentInputType = z.infer<typeof getDocumentInputZod>;

// Output Schemas
export const searchKnowledgeOutputSchema = {
  results: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      metadata: z.object({
        filePath: z.string(),
        title: z.string(),
        tags: z.array(z.string()),
        lastModified: z.string(),
        chunkIndex: z.number().optional(),
        totalChunks: z.number().optional(),
        category: z.string().optional(),
        source: z.string().optional(),
      }),
      score: z.number(),
      distance: z.number(),
      filePath: z.string(),
      preview: z.string(),
      relevanceScore: z.number(),
    })
  ),
  query: z.string(),
  total: z.number(),
  threshold: z.number(),
  limit: z.number(),
  searchType: z.string(),
  error: z.string().optional(),
};
export const searchKnowledgeOutputZod = z.object(searchKnowledgeOutputSchema);
export type SearchKnowledgeOutputType = z.infer<typeof searchKnowledgeOutputZod>;

export const getDocumentOutputSchema = {
  id: z.string().optional(),
  path: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  metadata: z
    .object({
      filePath: z.string(),
      title: z.string(),
      tags: z.array(z.string()),
      lastModified: z.string(),
      chunkIndex: z.number().optional(),
      totalChunks: z.number().optional(),
    })
    .optional(),
  error: z.string().optional(),
};
export const getDocumentOutputZod = z.object(getDocumentOutputSchema);
export type GetDocumentOutputType = z.infer<typeof getDocumentOutputZod>;

// Additional Types
export type FormattedSearchResult = {
  id: string;
  content: string;
  metadata: {
    filePath: string;
    title: string;
    tags: string[];
    lastModified: string;
    chunkIndex?: number;
    totalChunks?: number;
    category?: string;
    source?: string;
  };
  score: number;
  distance: number;
  filePath: string;
  preview: string;
  relevanceScore: number;
};
