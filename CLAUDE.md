# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 IMPORTANT: Debugging and Troubleshooting

**Before starting any debugging session, ALWAYS read `TROUBLESHOOTING.md` first.** This file contains:
- Proven debugging methodologies that work with this codebase
- Specific solutions for LanceDB, TypeScript, and integration issues  
- Systematic approaches that save hours of debugging time
- Error patterns and their root causes

**Key Principle: Create minimal reproduction scripts to isolate issues before debugging in the main codebase.**

## Project Overview

This is a dual-purpose project:

1. **Obsidian Knowledge Base**: Contains comprehensive Salesforce documentation organized in a hierarchical structure
2. **Vector Database System** ✅ **COMPLETE**: A lightweight, local system built with JavaScript/TypeScript to load any Obsidian notebook into a vector database with MCP (Model Context Protocol) support

## Current Project Structure

### Knowledge Base Organization
The Obsidian notebook follows a structured approach to Salesforce knowledge management:

- **Main Index**: `Salesforce/Salesforce.md` serves as the primary navigation hub
- **Hierarchical Structure**: Knowledge is organized by Salesforce technology areas (Apex, LWC, Flow, etc.)
- **Cross-linking**: Extensive use of `[[WikiLinks]]` between related concepts
- **Examples & Gotchas**: `Examples.md` contains practical code examples; `Why Salesforce.md` documents platform quirks and gotchas

### Key Knowledge Areas
- **Development**: Apex, LWC, Aura, Visualforce
- **Declarative**: Flow, Objects, Fields, Validation Rules
- **Security**: Sharing, Permissions, Authentication
- **Integration**: Platform Events, APIs
- **Administration**: Setup, Tools, Reporting

## Vector Database System

See `VECTOR_DATABASE_BUILD_PLAN.md` for comprehensive implementation details.

### Technology Stack (Confirmed)
- **Runtime**: Node.js 18+ with TypeScript
- **Vector Database**: LanceDB (free, local, embedded with native TypeScript support)
- **MCP Integration**: Official `@modelcontextprotocol/sdk-typescript`
- **Embeddings**: Local transformer model via transformers.js
- **File Processing**: Custom markdown parser with full Obsidian support

### Architecture Design
- **Abstraction Layer**: Database interface allowing easy switching between providers
- **Git-Based Versioning**: Use commit SHAs to detect when reindexing is needed
- **Smart Chunking**: Optimize chunk sizes for LLM agent efficiency
- **Local-first**: Zero hosting costs, runs entirely locally
- **MCP Compliance**: Seamless Claude agent integration

### Development Phases ✅ **ALL COMPLETE**
1. **Phase 1** ✅: Local vector database setup with abstraction layer
2. **Phase 2** ✅: Obsidian management layer with git-aware indexing  
3. **Phase 3** ✅: MCP server implementation using official TypeScript SDK

### Current Project Structure ✅ **IMPLEMENTED**
```
netherdb/
├── src/
│   ├── database/          # ✅ Abstracted vector database layer
│   │   ├── interfaces/    # ✅ Core database interfaces
│   │   └── providers/     # ✅ LanceDB implementation
│   ├── obsidian/          # ✅ Obsidian-specific processing
│   │   ├── chunking/      # ✅ Smart content chunking
│   │   ├── indexing/      # ✅ Git-aware indexing system
│   │   └── parser/        # ✅ Markdown & frontmatter parsing
│   ├── mcp/              # ✅ MCP server implementation
│   │   ├── server/        # ✅ Modular setup functions
│   │   └── types.ts       # ✅ Unified zod schemas
│   ├── services/          # ✅ Shared business logic
│   │   └── SearchService.ts # ✅ Unified search functionality
│   ├── cli/              # ✅ Command-line interface
│   │   └── commands/      # ✅ Index, search, status, MCP commands
│   ├── embeddings/       # ✅ Local embedding providers
│   ├── types/            # ✅ TypeScript type definitions
│   └── utils/            # ✅ Shared utilities
├── tests/                # ✅ Comprehensive test suite (80%+ coverage)
├── config/               # ✅ Configuration management
└── docs/                 # ✅ API and architecture documentation
```

## Development Workflow

### Debugging and Troubleshooting (START HERE)

**ALWAYS Read TROUBLESHOOTING.md First**: Before beginning any debugging session, read the entire TROUBLESHOOTING.md file. This contains:
- Systematic debugging methodologies proven to work with this codebase
- Specific solutions for complex debugging scenarios and integration issues
- Step-by-step approaches for isolating confusing problems
- Error message patterns and their root causes

**When Encountering Issues:**
1. **Check TROUBLESHOOTING.md** for similar problems and proven solutions
2. **Follow the minimal reproduction methodology** documented there
3. **Create focused test scripts** to isolate the exact issue before making changes to main code
4. **Test one assumption at a time** - don't debug multiple variables simultaneously
5. **Document new solutions** by updating TROUBLESHOOTING.md with your findings

**Key Principle:** Use **systematic problem isolation** rather than debugging within complex codebases. Create minimal reproducible examples to understand confusing behavior before implementing solutions.

### Knowledge Base Maintenance
- **Content Organization**: Follow existing hierarchical structure when adding new knowledge
- **Cross-referencing**: Use WikiLinks liberally to connect related concepts
- **Examples**: Add practical code examples to `Examples.md` when relevant
- **Gotchas**: Document platform quirks in `Why Salesforce.md`

### Vector System Development ✅ **COMPLETE**
- **Troubleshooting First**: Always consult TROUBLESHOOTING.md before debugging complex issues
- **Abstraction First** ✅: All code uses `VectorDatabase` interface, not direct implementations
- **Test-Driven** ✅: Comprehensive tests for all database operations (80%+ coverage)
- **Minimal Reproduction** ✅: Isolated test scripts for complex debugging scenarios
- **Git Integration** ✅: SHA-based versioning with intelligent reindexing
- **Performance** ✅: Optimized for large knowledge bases (1000+ markdown files)
- **Search Quality** ✅: Semantic search with metadata filtering and unified SearchService
- **Error Handling** ✅: Comprehensive error handling with proper logging
- **Code Quality** ✅: Always run `npm run lint` after writing code to ensure quality
- **Modular Architecture** ✅: Clean separation of concerns with shared services

## File Conventions

### Markdown Files
- Use `[[WikiLinks]]` for internal references
- Mark work-in-progress content with `#hidden` tag
- Organize content hierarchically by technology area
- Include practical examples where applicable

### Vector System Code Files
- **TypeScript**: Leverage TypeScript's type system extensively for all interfaces
- **Database Abstraction**: Implement providers following the `VectorDatabase` interface
- **Error Handling**: Use Result types and comprehensive error logging
- **Async Operations**: Use async/await for all I/O and database operations
- **Testing**: Maintain test coverage above 80% for all modules
- **Configuration**: Use JSON config files with schema validation

### TypeScript Configuration
- **Main tsconfig.json**: Includes Jest types for VSCode intellisense on tests
- **tsconfig.build.json**: Separate build configuration that excludes tests from dist
- **Separation**: Tests get type checking but don't pollute the build output

## Development Commands

When implementing the vector database system:

### Common Commands
```bash
# Install dependencies
npm install

# Run comprehensive linting and quality checks
npm run lint                              # Type checking, ESLint, and formatting
npm run lint:fix                          # Auto-fix linting issues

# Run tests
npm test

# Individual quality checks
npm run typecheck                         # TypeScript compilation check
npm run lint:eslint                       # ESLint only
npm run format                            # Auto-format code with Prettier

# Build the project
npm run build

# CLI commands ✅ IMPLEMENTED
npx netherdb index --full          # Full reindexing
npx netherdb index --incremental   # Incremental update
npx netherdb status                # Check index status
npx netherdb search "query"        # Search indexed content
npx netherdb search --browse       # Browse all documents
npx netherdb mcp start             # Start MCP server
```

### Code Quality Workflow
**Always run after writing code:**
```bash
npm run lint                              # Comprehensive quality checks
npm test                                  # Verify functionality
```

### Debugging Workflow
**When encountering complex issues:**
```bash
# 1. First, read the troubleshooting guide
cat TROUBLESHOOTING.md                    # Review systematic debugging approaches

# 2. Create minimal reproduction test
# scripts/test-specific-issue.ts          # Isolate the exact problem

# 3. Run focused tests to understand the confusing behavior
npx ts-node scripts/test-specific-issue.ts

# 4. Only after understanding the issue, implement solution in main code
```

### Development Workflow ✅ **ESTABLISHED**
- **Start with TROUBLESHOOTING.md** when debugging complex issues
- Use feature branches for specific implementations
- Create comprehensive tests before implementing features
- **Create minimal reproduction scripts** for persistant issues before debugging main code
- ✅ **All three phases completed** as outlined in `VECTOR_DATABASE_BUILD_PLAN.md`
- ✅ **Tested extensively** against the existing Salesforce knowledge base (166 files, 179 chunks)
- **Update TROUBLESHOOTING.md** with new solutions and debugging approaches
- **Modular refactoring**: Extract shared functionality into services for reusability

## Current Status ✅ **PRODUCTION READY**

- **Branch**: `vector` - ✅ **Fully implemented** vector database system
- **Main Branch**: `main` - Stable knowledge base content
- **Implementation**: ✅ **Complete** - All phases from `VECTOR_DATABASE_BUILD_PLAN.md` finished
- **Testing**: ✅ **Verified** - Comprehensive testing with real Salesforce knowledge base
- **Architecture**: ✅ **Modular** - Clean separation with unified SearchService
- **Performance**: ✅ **Optimized** - Fast semantic search across 166 documents

## Recent Achievements (Phase 3.1-3.2)

### MCP Server Refactoring ✅
- **Modular Architecture**: Extracted setup functions into separate files
- **Unified Schemas**: Centralized zod schemas with proper TypeScript inference
- **Clean Separation**: MCPServer focuses on orchestration, setup files handle functionality

### Search Service Unification ✅  
- **Eliminated Duplication**: Removed ~180 lines of duplicate search logic
- **Single Source of Truth**: All search operations now use unified SearchService
- **Consistent Behavior**: CLI and MCP produce identical search results
- **Enhanced Maintainability**: Future search improvements only need one update

### Verified Functionality ✅
- **All Search Modes**: Semantic, keyword, hybrid, and browse modes working
- **Output Formats**: Console, verbose, and JSON output all functional
- **Real-world Testing**: Successfully tested with 166 Salesforce documentation files
- **Performance**: Sub-second search responses with accurate relevance scoring