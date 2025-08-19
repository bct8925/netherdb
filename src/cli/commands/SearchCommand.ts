import { Command } from 'commander';
import { Logger } from '../../utils/Logger.js';
import { DatabaseFactory } from '../../database/factory.js';
import { TransformersEmbedding } from '../../embeddings/TransformersEmbedding.js';
import { SearchService, type FormattedSearchResult, type SearchType } from '../../services/SearchService.js';
import { ConfigHelper, type BaseCommandOptions } from '../../utils/ConfigHelper.js';
import { formatDistanceToNow } from 'date-fns';
import { formatRelevancePercent, createRelevanceBar } from '../../utils/RelevanceCalculator.js';

export interface SearchOptions extends BaseCommandOptions {
  query?: string;
  limit?: number;
  json?: boolean;
  verbose?: boolean;
  semantic?: boolean;
  keyword?: boolean;
  browse?: boolean;
}


export class SearchCommand {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('SearchCommand');
  }

  public register(program: Command): void {
    const search = program
      .command('search')
      .description('Search through indexed documents');

    // Main search command
    search
      .argument('[query]', 'Search query text')
      .option('-l, --limit <number>', 'Maximum number of results to return')
      .option('--config <path>', 'Path to configuration file', 'config/default.json')
      .option('--db-path <path>', 'Path to vector database directory')
      .option('--json', 'Output results as JSON')
      .option('-v, --verbose', 'Show detailed search information')
      .option('--semantic', 'Force semantic (vector) search', false)
      .option('--keyword', 'Force keyword (text) search', false)
      .option('--browse', 'Browse all indexed documents', false)
      .action((query: string, options: SearchOptions, command: Command) => 
        this.handleSearch({ ...options, query }, command));

  }

  private async handleSearch(options: SearchOptions, command: Command): Promise<void> {
    try {
      // Handle browse mode
      if (options.browse) {
        return this.handleBrowse(options, command);
      }

      if (!options.query) {
        console.error('❌ Search query is required');
        process.exit(1);
      }

      this.logger.info('Starting search operation', { options });

      // Load configuration and initialize components
      const { searchService } = await this.initializeComponents(options, command);

      // Determine search type
      let searchType: SearchType = 'hybrid';
      if (options.semantic) searchType = 'semantic';
      else if (options.keyword) searchType = 'keyword';

      const limit = options.limit ? parseInt(String(options.limit)) : 10;
      const results = await searchService.search(options.query, searchType, { limit });

      // Display results
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        this.displaySearchResults(results, options.query, searchType, options.verbose || false);
      }

    } catch (error) {
      this.logger.error('Search operation failed', { error });
      console.error('❌ Search failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async handleBrowse(options: SearchOptions, command: Command): Promise<void> {
    try {
      this.logger.info('Starting browse operation', { options });

      // Load configuration and initialize components
      const { searchService } = await this.initializeComponents(options, command);

      // Get all documents
      const limit = options.limit ? parseInt(String(options.limit)) : 20;
      const displayResults = await searchService.browse(limit);

      // Display results
      if (options.json) {
        console.log(JSON.stringify(displayResults, null, 2));
      } else {
        this.displayBrowseResults(displayResults, options.verbose || false);
      }

    } catch (error) {
      this.logger.error('Browse operation failed', { error });
      console.error('❌ Browse failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async initializeComponents(options: SearchOptions, command: Command) {
    // Load configuration with global support
    const { config } = await ConfigHelper.loadConfigWithGlobalSupport(options, command);

    // Initialize components
    const embedding = new TransformersEmbedding({
      modelName: config.embedding.model,
      dimension: config.embedding.dimensions
    });
    const database = DatabaseFactory.create(config.database.provider, config.database);

    // Initialize
    await database.initialize();
    await embedding.initialize();

    // Create SearchService
    const searchService = new SearchService(database, embedding, this.logger);

    return { database, embedding, config, searchService };
  }



  private displaySearchResults(
    results: FormattedSearchResult[],
    query: string,
    searchType: string,
    verbose: boolean
  ): void {
    console.log(`🔍 Search Results for: "${query}"`);
    console.log(`📊 Search Type: ${searchType} | Found: ${results.length} results\n`);

    if (results.length === 0) {
      console.log('No results found. Try:');
      console.log('• Using different keywords');
      console.log('• Using semantic search: --semantic');
      console.log('• Browsing all documents: search browse');
      return;
    }

    results.forEach((result, index) => {
      const relevanceBar = createRelevanceBar(result.relevanceScore);
      const relevancePercent = formatRelevancePercent(result.relevanceScore);

      console.log(`📄 ${index + 1}. ${result.filePath}`);
      console.log(`   Relevance: ${relevanceBar} ${relevancePercent}`);
      console.log(`   Preview: ${result.preview}`);
      
      if (verbose) {
        console.log(`   ID: ${result.id}`);
        console.log(`   Score: ${result.score?.toFixed(4) || 'N/A'}`);
        console.log(`   Distance: ${result.distance?.toFixed(4) || 'N/A'}`);
        
        if (result.metadata.lastModified) {
          const timeAgo = formatDistanceToNow(new Date(result.metadata.lastModified), { addSuffix: true });
          console.log(`   Modified: ${timeAgo}`);
        }
        
        if (result.metadata.chunkIndex !== undefined) {
          console.log(`   Chunk: ${result.metadata.chunkIndex + 1}/${result.metadata.totalChunks || 'N/A'}`);
        }
        
        if (result.metadata.tags && result.metadata.tags.length > 0) {
          console.log(`   Tags: ${result.metadata.tags.join(', ')}`);
        }
      }
      
      console.log('');
    });

    console.log(`💡 Tip: Use --verbose for more details or --json for machine-readable output`);
  }

  private displayBrowseResults(results: FormattedSearchResult[], verbose: boolean): void {
    console.log(`📚 Browsing Indexed Documents`);
    console.log(`📊 Showing: ${results.length} documents\n`);

    if (results.length === 0) {
      console.log('No documents found. Try indexing some files first with: index --full');
      return;
    }

    // Group by file path for better organization
    const groupedByFile = new Map<string, FormattedSearchResult[]>();
    results.forEach(result => {
      const filePath = result.filePath;
      if (!groupedByFile.has(filePath)) {
        groupedByFile.set(filePath, []);
      }
      const fileGroup = groupedByFile.get(filePath);
      if (fileGroup) {
        fileGroup.push(result);
      }
    });

    Array.from(groupedByFile.entries()).forEach(([filePath, chunks]) => {
      console.log(`📄 ${filePath} (${chunks.length} chunks)`);
      
      if (verbose) {
        chunks.forEach((chunk, index) => {
          console.log(`   Chunk ${index + 1}: ${chunk.preview}`);
          if (chunk.metadata.chunkIndex !== undefined) {
            console.log(`   Chunk: ${chunk.metadata.chunkIndex + 1}/${chunk.metadata.totalChunks || 'N/A'}`);
          }
        });
      } else {
        // Show just the first chunk preview
        if (chunks.length > 0) {
          const firstChunk = chunks[0];
          if (firstChunk) {
            console.log(`   Preview: ${firstChunk.preview}`);
          }
        }
      }
      
      console.log('');
    });

    console.log(`💡 Tip: Use --verbose to see all chunks or --limit to show more/fewer documents`);
  }

}