# Obsidian Vector Database

A lightweight, local vector database system for Obsidian notebooks with MCP (Model Context Protocol) support for Claude agent integration.

## How Vector Indexing Works

### Full Index Process: From Zero to Searchable

When you run a full index with no existing database, here's exactly what happens:

#### 1. **Database Creation & Initialization**
```bash
npm start index --full
```
- **Creates the database directory** (`vectors.lancedb/`)
- **Initializes LanceDB** with the vector schema
- **Sets up the embedding model** (downloads if first time)

#### 2. **Document Discovery & Processing**
- **Discovers files** using your include/exclude patterns
- **Reads each markdown file** and parses the content
- **Chunks the content** into smaller pieces (respecting headers, paragraphs, etc.)
- **Generates embeddings** for each chunk using the local transformer model

#### 3. **Vector Storage & Indexing**
This is where the magic happens:

**Step 3a: Vector Insertion**
- **Stores vectors** in LanceDB along with metadata (file path, chunk content, etc.)
- Each chunk becomes a row with a 384-dimensional vector

**Step 3b: Automatic Index Creation**
- **LanceDB automatically creates indices** for efficient vector search
- This includes both vector indices (for similarity search) and scalar indices (for metadata filtering)

#### 4. **Version Tracking**
- **Creates version file** (`netherdb-version.json`) with:
  - Current git SHA
  - File content hashes
  - Indexing timestamp
  - Total documents/chunks count

### Key Point: LanceDB Handles Indexing Automatically

Unlike traditional databases where you manually create indexes, **LanceDB automatically optimizes for vector search**. When you insert vectors, it:

- **Builds approximate nearest neighbor (ANN) indices** behind the scenes
- **Optimizes storage** for fast retrieval
- **Creates secondary indices** for metadata filtering

### What You End Up With:

```
vectors.lancedb/
├── vectors.lance/           # Actual vector data & indices
├── netherdb-version.json  # Version tracking
└── (internal LanceDB files)
```

Your markdown files become:
- **Documents** stored as vectors
- **Chunks** (some files split into multiple chunks)
- **Ready for semantic search** via the CLI

### Search-Ready Immediately

Once indexing completes, you can immediately:

```bash
npm start search "apex triggers"     # Semantic search
npm start search --keyword "SOQL"    # Keyword search  
npm start search --hybrid "flows"    # Best of both
```

The "index" in vector databases is fundamentally different from SQL databases - it's optimized for similarity search rather than exact matches, and LanceDB handles all the complexity automatically.

## Quick Start

```bash
# From the root directory (not netherdb/)
npm start status           # Check current status
npm start index --full     # Index all markdown files
npm start search "query"   # Search your knowledge base
```

## CLI Commands

```bash
npm start status                    # Check database status
npm start index --full              # Full reindex
npm start index --incremental       # Update changed files only
npm start search "query"            # Semantic search
npm start search --keyword "term"   # Keyword search
npm start search --hybrid "query"   # Combined search
npm start backup                    # Backup database
```

## Configuration

Edit `config/default.json` to customize:

- **Include/exclude patterns** for file discovery
- **Database settings** (provider, connection, chunking)
- **Embedding model** configuration

## Project Structure

```
/
├── Salesforce/                    # Your Obsidian knowledge base
├── config/
│   └── default.json              # Configuration
├── vectors.lancedb/              # Vector database
│   ├── vectors.lance/            # Vector data & indices
│   └── netherdb-version.json  # Version tracking
└── netherdb/           # Source code
    ├── src/                      # TypeScript source
    ├── dist/                     # Compiled JavaScript
    └── package.json              # Dependencies & scripts
```

## Development

See `netherdb/README.md` for development setup and architecture details.