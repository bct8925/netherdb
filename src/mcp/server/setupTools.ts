import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  searchKnowledgeInputSchema,
  searchKnowledgeOutputSchema,
  getDocumentInputSchema,
  getDocumentOutputSchema,
  type SearchKnowledgeInputType,
  type GetDocumentInputType,
} from '../types';
import type { VectorDatabase } from '../../database/interfaces/VectorDatabase';
import type { TransformersEmbedding } from '../../embeddings/TransformersEmbedding';
import type { Logger } from '../../utils/Logger';
import { SearchService } from '../../services/SearchService';


async function handleSearchKnowledge(
  input: SearchKnowledgeInputType,
  searchService: SearchService
) {
  const { query, limit = 10, threshold = 0.7, filters } = input;
  
  // Input validation
  if (!query || typeof query !== 'string') {
    const errorResult = {
      query,
      error: 'Query must be a non-empty string',
      results: [],
      total: 0,
      threshold,
      limit,
      searchType: 'error'
    };
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(errorResult, null, 2)
      }],
      structuredContent: errorResult
    };
  }

  if (query.trim().length === 0) {
    const errorResult = {
      query,
      error: 'Query cannot be empty or only whitespace',
      results: [],
      total: 0,
      threshold,
      limit,
      searchType: 'error'
    };
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(errorResult, null, 2)
      }],
      structuredContent: errorResult
    };
  }

  if (limit < 1 || limit > 100) {
    const errorResult = {
      query,
      error: 'Limit must be between 1 and 100',
      results: [],
      total: 0,
      threshold,
      limit,
      searchType: 'error'
    };
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(errorResult, null, 2)
      }],
      structuredContent: errorResult
    };
  }

  if (threshold < 0 || threshold > 1) {
    const errorResult = {
      query,
      error: 'Threshold must be between 0 and 1',
      results: [],
      total: 0,
      threshold,
      limit,
      searchType: 'error'
    };
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(errorResult, null, 2)
      }],
      structuredContent: errorResult
    };
  }

  try {
    // Use the SearchService for consistent search logic
    const searchResults = await searchService.search(query, 'semantic', {
      limit,
      threshold,
      filters: filters ? {
        tags: filters.tags || undefined,
        fileTypes: filters.fileTypes || undefined,
        sections: filters.sections || undefined
      } : undefined
    });
    
    const results = {
      query,
      results: searchResults,
      total: searchResults.length,
      threshold,
      limit,
      searchType: 'semantic'
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(results, null, 2)
      }],
      structuredContent: results
    };
  } catch (error) {
    const errorResult = {
      query,
      error: error instanceof Error ? error.message : 'Unknown error',
      results: [],
      total: 0,
      threshold,
      limit,
      searchType: 'error'
    };
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(errorResult, null, 2)
      }],
      structuredContent: errorResult
    };
  }
}

async function handleGetDocument(
  input: GetDocumentInputType,
  searchService: SearchService
) {
  const { id, path } = input;
  
  if (!id && !path) {
    const errorResult = {
      error: 'Either id or path must be provided'
    };
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(errorResult, null, 2)
      }],
      structuredContent: errorResult
    };
  }

  try {
    let document = null;
    
    if (id) {
      // Get document by ID using SearchService
      document = await searchService.getDocumentById(id);
    } else if (path) {
      // Get document by path using SearchService
      document = await searchService.getDocumentByPath(path);
    }

    if (!document) {
      const notFoundResult = {
        id,
        path,
        error: 'Document not found'
      };
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(notFoundResult, null, 2)
        }],
        structuredContent: notFoundResult
      };
    }

    const result = {
      id: document.id,
      path: document.metadata.filePath,
      title: document.metadata.title,
      content: document.content,
      metadata: {
        filePath: document.metadata.filePath,
        title: document.metadata.title,
        tags: document.metadata.tags || [],
        lastModified: document.metadata.lastModified instanceof Date 
          ? document.metadata.lastModified.toISOString()
          : document.metadata.lastModified || new Date().toISOString(),
        chunkIndex: document.metadata.chunkIndex,
        totalChunks: document.metadata.totalChunks
      }
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2)
      }],
      structuredContent: result
    };
  } catch (error) {
    const errorResult = {
      id,
      path,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(errorResult, null, 2)
      }],
      structuredContent: errorResult
    };
  }
}

export function setupTools(
  server: McpServer,
  db: VectorDatabase,
  embedding: TransformersEmbedding,
  logger: Logger
): void {
  // Create a shared SearchService instance
  const searchService = new SearchService(db, embedding, logger);

  // Register search_knowledge tool
  server.registerTool(
    'search_knowledge',
    {
      title: 'Search Knowledge Base',
      description: `# Search Knowledge Base Tool

Search the Obsidian knowledge base using semantic similarity. This tool enables RAG (Retrieval-Augmented Generation) workflows by finding relevant information from your indexed knowledge base.

## Usage
Use this tool to find information related to your query before providing responses. The knowledge base contains curated information that can enhance your responses with specific, contextual details.

## Parameters
- **query**: Your search terms (be specific and use domain terminology)
- **limit**: Number of results to return (default: 10, increase for complex topics)
- **threshold**: Similarity threshold (default: 0.7, lower for broader results)
- **filters**: Optional filters for tags, file types, or sections`,
      inputSchema: searchKnowledgeInputSchema,
      outputSchema: searchKnowledgeOutputSchema,
    },
    async (input: SearchKnowledgeInputType) => {
      return await handleSearchKnowledge(input, searchService);
    }
  );

  // Register get_document tool
  server.registerTool(
    'get_document',
    {
      title: 'Get Document',
      description: `# Get Document Tool

Retrieve a specific document by ID or path from the knowledge base.

## Usage
Use this tool when you have a specific document reference from search results and need to access the full content.

## Parameters
- **id**: Document ID from search results
- **path**: Direct file path if known`,
      inputSchema: getDocumentInputSchema,
      outputSchema: getDocumentOutputSchema,
    },
    async (input: GetDocumentInputType) => {
      return await handleGetDocument(input, searchService);
    }
  );
}