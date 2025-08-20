import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VectorDatabase } from '../../database/interfaces/VectorDatabase';
import type { Logger } from '../../utils/Logger';

export function setupResources(
  server: McpServer,
  db: VectorDatabase,
  logger: Logger
): void {
  server.registerResource(
    'knowledge-base-stats',
    'obsidian://knowledge-base/stats',
    {
      name: 'Knowledge Base Statistics',
      description: 'Database statistics and health information',
      mimeType: 'application/json',
    },
    async () => {
      try {
        const stats = await db.getStats();
        return {
          contents: [
            {
              uri: 'obsidian://knowledge-base/stats',
              text: JSON.stringify(stats, null, 2),
              mimeType: 'application/json',
            },
          ],
        };
      } catch (error) {
        logger.error('Failed to get stats:', error);
        return {
          contents: [
            {
              uri: 'obsidian://knowledge-base/stats',
              text: JSON.stringify({ error: 'Failed to retrieve statistics' }, null, 2),
              mimeType: 'application/json',
            },
          ],
        };
      }
    }
  );

  // TODO: Re-enable when query by metadata is supported in all DB providers
  // server.registerResource(
  //   'knowledge-base-documents',
  //   'obsidian://knowledge-base/documents',
  //   {
  //     name: 'All Documents',
  //     description: 'List of all documents in the knowledge base',
  //     mimeType: 'application/json',
  //   },
  //   async () => {
  //     try {
  //       // Get document count and sample from database
  //       const stats = await db.getStats();
  //       const sampleDocuments = await db.query(undefined, {
  //         limit: 20,
  //         includeMetadata: true,
  //       });

  //       const documents = {
  //         total: stats.totalVectors,
  //         sampleCount: sampleDocuments.results.length,
  //         documents: sampleDocuments.results.map((doc) => ({
  //           id: doc.id,
  //           filePath: doc.metadata.filePath,
  //           title: doc.metadata.title,
  //           tags: doc.metadata.tags || [],
  //           lastModified:
  //             doc.metadata.lastModified instanceof Date
  //               ? doc.metadata.lastModified.toISOString()
  //               : doc.metadata.lastModified || new Date().toISOString(),
  //           preview: createPreview(doc.content, 100),
  //         })),
  //       };
  //       return {
  //         contents: [
  //           {
  //             uri: 'obsidian://knowledge-base/documents',
  //             text: JSON.stringify(documents, null, 2),
  //             mimeType: 'application/json',
  //           },
  //         ],
  //       };
  //     } catch (error) {
  //       logger.error('Failed to list documents:', error);
  //       return {
  //         contents: [
  //           {
  //             uri: 'obsidian://knowledge-base/documents',
  //             text: JSON.stringify({ error: 'Failed to list documents' }, null, 2),
  //             mimeType: 'application/json',
  //           },
  //         ],
  //       };
  //     }
  //   }
  // );

  server.registerResource(
    'knowledge-base-indices',
    'obsidian://knowledge-base/indices',
    {
      name: 'Database Indices',
      description: 'List of all database indices',
      mimeType: 'application/json',
    },
    async () => {
      try {
        const indices = await db.listIndices();
        return {
          contents: [
            {
              uri: 'obsidian://knowledge-base/indices',
              text: JSON.stringify(indices, null, 2),
              mimeType: 'application/json',
            },
          ],
        };
      } catch (error) {
        logger.error('Failed to list indices:', error);
        return {
          contents: [
            {
              uri: 'obsidian://knowledge-base/indices',
              text: JSON.stringify({ error: 'Failed to list indices' }, null, 2),
              mimeType: 'application/json',
            },
          ],
        };
      }
    }
  );
}