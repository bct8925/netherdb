# Vector Database System Build Plan

## Project Overview

This document outlines the comprehensive build plan for creating a lightweight, local vector database system that can load any Obsidian notebook into a searchable knowledge base with MCP (Model Context Protocol) support for Claude agent integration.

## Goals

1. **Local Vector Database**: Set up local vector database with read/write capabilities that's free to host
2. **Obsidian Integration**: Build git-aware management layer with smart chunking and native Obsidian support
3. **MCP Server**: Create TypeScript MCP server for LLM agent knowledge base interaction
4. **Abstraction**: Design system to easily switch between different vector database implementations

## Phase 1: Local Vector Database Setup with Abstraction Layer

### 1.1 Project Initialization
- Initialize TypeScript Node.js project with proper configuration
- Set up development environment (ESLint, Prettier, tsconfig.json)
- Install dependencies:
  - LanceDB (`@lancedb/lancedb`)
  - TypeScript development tools
  - Testing framework (Jest)
  - CLI framework (Commander.js)

### 1.2 Database Abstraction Layer Design

#### Core Interface
Create abstract `VectorDatabase` interface with standardized operations:

```typescript
interface VectorDatabase {
  // Core operations
  insert(vectors: VectorData[], metadata: Metadata[]): Promise<string[]>
  search(query: number[], filters?: SearchFilters, limit?: number): Promise<SearchResult[]>
  update(id: string, vector?: number[], metadata?: Metadata): Promise<void>
  delete(id: string): Promise<void>
  
  // Management operations
  getStats(): Promise<DatabaseStats>
  createIndex(name: string, config: IndexConfig): Promise<void>
  listIndices(): Promise<IndexInfo[]>
  
  // Batch operations
  batchInsert(items: VectorData[]): Promise<string[]>
  batchDelete(ids: string[]): Promise<void>
}
```

#### Provider Implementation
- Implement `LanceDBProvider` class that implements the abstract interface
- Create factory pattern for easy database provider switching:
  ```typescript
  const db = DatabaseFactory.create('lancedb', config)
  ```
- Add comprehensive TypeScript types for vectors, metadata, and search results

#### Configuration System
```typescript
interface DatabaseConfig {
  provider: 'lancedb' | 'chroma' | 'weaviate' // Future providers
  connection: {
    path: string // Local storage path
    // Provider-specific options
  }
  embedding: {
    model: string
    dimensions: number
  }
}
```

### 1.3 Database Foundation Testing
- Create test suite using the abstract interface (tests will work with any future provider)
- Implement basic CRUD operations through LanceDB provider
- Add embedding generation using local model (transformers.js)
- Create sample data tests to verify all operations work correctly

## Phase 2: Obsidian Management Layer

### 2.1 Git Version Tracking System

#### Version Management
- Implement git SHA-based versioning to detect when reindexing is needed
- Track the last indexed commit SHA in database metadata
- Compare current HEAD SHA with stored SHA to determine if reindexing needed
- Store per-file modification tracking for granular updates

#### Data Structure
```typescript
interface VersionInfo {
  lastIndexedSHA: string
  indexedAt: Date
  fileHashes: Map<string, string> // file path -> content hash
  totalDocuments: number
  totalChunks: number
}
```

#### Implementation Features
- Build incremental update system that only processes changed files
- Add rollback capabilities for version management
- Handle file deletions and renames appropriately
- Create git integration utilities for SHA and diff operations

### 2.2 Obsidian File Processing Engine

#### Markdown Parser Features
Create comprehensive parser handling full Obsidian syntax:

- **WikiLinks**: `[[Article Name]]`, `[[Article Name|Display Text]]`
- **Tags**: `#tag`, `#nested/tag`, YAML frontmatter tags
- **Frontmatter**: YAML metadata extraction and processing
- **Code blocks**: Preserve syntax highlighting info
- **Embedded content**: Images, PDFs, other attachments
- **Callouts**: Obsidian-style callouts and admonitions
- **Math**: LaTeX math expressions
- **Tables**: Markdown tables with proper formatting

#### Smart Chunking Strategy
Implement intelligent chunking optimized for LLM efficiency:

```typescript
interface ChunkStrategy {
  // Chunk by logical boundaries
  splitByHeaders: boolean // H1, H2, H3 boundaries
  splitByParagraphs: boolean // Paragraph boundaries
  
  // Size constraints
  maxTokens: number // Target chunk size
  overlapTokens: number // Overlap between chunks
  
  // Context preservation
  includeHeaders: boolean // Include section headers in chunks
  preserveCodeBlocks: boolean // Keep code blocks intact
  preserveTables: boolean // Keep tables intact
}
```

#### Features:
- Chunk by logical sections (headers, topics, natural breaks)
- Preserve context and maintain cross-references between chunks
- Store chunk relationships and hierarchy in metadata
- Optimize chunk size for embedding model token limits
- Maintain document structure information

#### Link Resolution System
- Extract and resolve WikiLinks to actual file paths
- Build bidirectional link graph for related document discovery
- Handle broken links and missing files gracefully
- Create link relationship metadata for vector search

#### Tag Processing
- Extract tags from frontmatter and inline `#tag` syntax
- Support nested tag hierarchies (`#parent/child`)
- Store tags as searchable metadata in vector database
- Enable tag-based filtering in search operations

### 2.3 Indexing Command System

#### CLI Commands
```bash
# Manual full reindexing
netherdb index --full

# Incremental update
netherdb index --incremental

# Check status
netherdb status

# Reindex specific files
netherdb index --files "path/to/file.md"
```

#### Implementation Features
- Build robust CLI using Commander.js
- Create automated change detection based on git status
- Implement batch processing for large knowledge bases (100+ files)
- Add comprehensive progress reporting and error handling
- Support dry-run mode for testing indexing operations
- Create backup and restore functionality for indexes

## Phase 3: MCP Server Implementation

### 3.1 MCP Server Setup

#### Official SDK Integration
- Use official `@modelcontextprotocol/sdk-typescript`
- Implement MCP server with proper resource and tool definitions
- Create robust connection handling and error management
- Add comprehensive logging and monitoring capabilities

#### Server Configuration
```typescript
interface MCPServerConfig {
  name: string
  version: string
  tools: ToolDefinition[]
  resources: ResourceDefinition[]
  database: DatabaseConfig
}
```

### 3.2 Search Tools Implementation

#### Tool Definitions
```typescript
// Semantic search tool
{
  name: "search_knowledge",
  description: "Search the Obsidian knowledge base using semantic similarity",
  inputSchema: {
    query: string,
    filters?: {
      tags?: string[],
      fileTypes?: string[],
      dateRange?: { from: Date, to: Date },
      sections?: string[]
    },
    limit?: number,
    threshold?: number
  }
}
```

#### Search Features
- Implement semantic search using the abstracted database interface
- Add metadata filtering capabilities (tags, file types, date ranges, sections)
- Create relevance scoring and result ranking algorithms
- Build search result formatting optimized for LLM consumption
- Support both exact match and fuzzy search capabilities
- Enable search within specific document sections or hierarchies

### 3.3 Knowledge Management Tools

#### Write Operations
```typescript
// Add knowledge tool
{
  name: "add_knowledge",
  description: "Add new knowledge to the database",
  inputSchema: {
    content: string,
    metadata: {
      title: string,
      tags?: string[],
      category?: string,
      source?: string
    },
    chunkStrategy?: ChunkStrategy
  }
}
```

#### Update Operations
```typescript
// Update knowledge tool
{
  name: "update_knowledge",
  description: "Update existing knowledge in the database",
  inputSchema: {
    id: string,
    content?: string,
    metadata?: Partial<Metadata>,
    merge?: boolean // Whether to merge or replace
  }
}
```

#### Implementation Features
- Build tools for adding new knowledge to the database
- Implement update mechanisms for existing content
- Create validation and conflict resolution strategies
- Add batch operations for efficient knowledge updates
- Support atomic transactions for data consistency
- Create backup mechanisms before destructive operations

## Technology Stack

### Core Technologies
- **Vector Database**: LanceDB (with abstraction for future providers)
- **Runtime**: Node.js 18+ with TypeScript
- **MCP Framework**: @modelcontextprotocol/sdk-typescript (official SDK)
- **Embeddings**: Local transformer model via transformers.js
- **File Processing**: Custom markdown parser with full Obsidian support
- **CLI**: Commander.js for command-line interface
- **Testing**: Jest for unit and integration tests

### Key Dependencies
```json
{
  "dependencies": {
    "@lancedb/lancedb": "^0.4.0",
    "@modelcontextprotocol/sdk-typescript": "latest",
    "@xenova/transformers": "^2.0.0",
    "commander": "^11.0.0",
    "yaml": "^2.3.0",
    "gray-matter": "^4.0.0",
    "marked": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

## Project Structure with Abstraction

```
netherdb/
├── src/
│   ├── database/
│   │   ├── interfaces/
│   │   │   ├── VectorDatabase.ts      # Core database interface
│   │   │   ├── SearchTypes.ts         # Search-related types
│   │   │   └── MetadataTypes.ts       # Metadata type definitions
│   │   ├── providers/
│   │   │   ├── lancedb/
│   │   │   │   ├── LanceDBProvider.ts # LanceDB implementation
│   │   │   │   ├── LanceDBConfig.ts   # LanceDB-specific config
│   │   │   │   └── LanceDBUtils.ts    # LanceDB utilities
│   │   │   └── index.ts               # Provider exports
│   │   ├── factory.ts                 # Database provider factory
│   │   └── index.ts                   # Database module exports
│   ├── obsidian/
│   │   ├── parser/
│   │   │   ├── MarkdownParser.ts      # Core markdown parsing
│   │   │   ├── WikiLinkParser.ts      # WikiLink resolution
│   │   │   ├── TagExtractor.ts        # Tag extraction
│   │   │   └── FrontmatterParser.ts   # YAML frontmatter
│   │   ├── chunking/
│   │   │   ├── ChunkStrategy.ts       # Chunking interfaces
│   │   │   ├── HeaderChunker.ts       # Header-based chunking
│   │   │   └── SmartChunker.ts        # Intelligent chunking
│   │   ├── indexing/
│   │   │   ├── FileIndexer.ts         # File indexing logic
│   │   │   ├── VersionTracker.ts      # Git-based versioning
│   │   │   └── IncrementalIndexer.ts  # Incremental updates
│   │   └── index.ts                   # Obsidian module exports
│   ├── mcp/
│   │   ├── server/
│   │   │   ├── MCPServer.ts           # Main MCP server
│   │   │   ├── ToolHandlers.ts        # Tool implementation
│   │   │   └── ResourceHandlers.ts    # Resource implementation
│   │   ├── tools/
│   │   │   ├── SearchTool.ts          # Search functionality
│   │   │   ├── AddKnowledgeTool.ts    # Add knowledge
│   │   │   └── UpdateKnowledgeTool.ts # Update knowledge
│   │   └── index.ts                   # MCP module exports
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── IndexCommand.ts        # Indexing commands
│   │   │   ├── StatusCommand.ts       # Status reporting
│   │   │   └── ServerCommand.ts       # MCP server commands
│   │   ├── CLIApp.ts                  # Main CLI application
│   │   └── index.ts                   # CLI exports
│   ├── embeddings/
│   │   ├── EmbeddingProvider.ts       # Embedding interface
│   │   ├── TransformersEmbedding.ts   # Transformers.js implementation
│   │   └── index.ts                   # Embeddings exports
│   ├── utils/
│   │   ├── GitUtils.ts                # Git operations
│   │   ├── FileUtils.ts               # File system utilities
│   │   ├── Logger.ts                  # Logging utilities
│   │   └── index.ts                   # Utils exports
│   ├── types/
│   │   ├── Config.ts                  # Configuration types
│   │   ├── Common.ts                  # Common type definitions
│   │   └── index.ts                   # Type exports
│   └── index.ts                       # Main application entry
├── tests/
│   ├── database/                      # Database abstraction tests
│   ├── obsidian/                      # Obsidian processing tests
│   ├── mcp/                           # MCP server tests
│   └── integration/                   # End-to-end tests
├── config/
│   ├── default.json                   # Default configuration
│   └── example.json                   # Example configuration
├── docs/
│   ├── API.md                         # API documentation
│   ├── SETUP.md                       # Setup instructions
│   └── ARCHITECTURE.md                # Architecture overview
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.js
├── .prettierrc
└── README.md
```

## Implementation Guidelines

### Development Principles
1. **Abstraction First**: Always code against interfaces, not implementations
2. **Test-Driven**: Write tests before implementation where possible
3. **Type Safety**: Leverage TypeScript's type system extensively
4. **Error Handling**: Comprehensive error handling with proper logging
5. **Performance**: Optimize for large knowledge bases (1000+ documents)
6. **Extensibility**: Design for easy addition of new features and providers

### Code Quality Standards
- Use ESLint and Prettier for consistent code formatting
- Maintain test coverage above 80%
- Follow semantic versioning for releases
- Use conventional commits for git history
- Document all public APIs with JSDoc comments

### Configuration Management
- Use JSON configuration files with schema validation
- Support environment variable overrides
- Provide sensible defaults for all settings
- Enable runtime configuration updates where possible

## Success Criteria

### Phase 1 Success Metrics
- [ ] Abstracted database interface supports all planned operations
- [ ] LanceDB provider implements all interface methods correctly
- [ ] Can store and retrieve vectors with metadata
- [ ] Basic search functionality works with sample data
- [ ] Factory pattern allows easy provider switching
- [ ] Test suite covers all database operations

### Phase 2 Success Metrics
- [ ] Git SHA-based versioning accurately tracks changes
- [ ] Markdown parser handles all Obsidian syntax correctly
- [ ] Smart chunking produces optimal chunk sizes for embeddings
- [ ] WikiLink resolution works across the knowledge base
- [ ] Tag extraction and indexing works properly
- [ ] Incremental indexing only processes changed files
- [ ] Can process existing 100+ Salesforce markdown files

### Phase 3 Success Metrics
- [ ] MCP server starts and connects properly using official SDK
- [ ] Search tools return relevant results with proper ranking
- [ ] Knowledge management tools can add/update content
- [ ] Claude agents can successfully query the knowledge base
- [ ] Performance remains acceptable with large knowledge bases
- [ ] Error handling provides useful feedback

### Overall System Success
- [ ] System runs entirely locally with zero hosting costs
- [ ] Can easily switch between different vector database providers
- [ ] Processes large Obsidian vaults efficiently
- [ ] Provides accurate semantic search capabilities
- [ ] Enables seamless Claude agent knowledge interaction
- [ ] Maintains data integrity across operations
- [ ] Scales to handle thousands of markdown files

## Risk Mitigation

### Technical Risks
- **Embedding Quality**: Test multiple local embedding models for best results
- **Performance**: Profile and optimize for large datasets early
- **Memory Usage**: Implement streaming and batching for large operations
- **Data Corruption**: Implement atomic operations and backup strategies

### Integration Risks
- **MCP Changes**: Monitor official SDK updates and maintain compatibility
- **Obsidian Syntax**: Test with diverse real-world Obsidian vaults
- **Git Integration**: Handle edge cases like rebases, merges, and conflicts

## Future Enhancements

### Additional Database Providers
- Chroma integration for alternative vector database option
- Weaviate support for cloud-hybrid scenarios
- Custom providers for specialized use cases

### Advanced Features
- Real-time file watching for automatic reindexing
- Web interface for knowledge base management
- Advanced analytics and insights on knowledge usage
- Multi-vault support for multiple Obsidian notebooks
- Collaborative features for team knowledge bases

### Performance Optimizations
- Parallel processing for large batch operations
- Intelligent caching strategies
- Incremental embedding updates
- Database compression and optimization

This comprehensive build plan provides a roadmap for creating a robust, extensible vector database system that can grow with changing requirements while maintaining high performance and reliability.