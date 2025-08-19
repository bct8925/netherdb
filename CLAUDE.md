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

**NetherDB** is a lightweight, local vector database system for Obsidian notebooks with MCP (Model Context Protocol) support for Claude agent integration. The system enables semantic search across markdown knowledge bases and provides programmatic access through both CLI and MCP protocols.

## Technology Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Vector Database**: LanceDB (free, local, embedded with native TypeScript support)
- **MCP Integration**: Official `@modelcontextprotocol/sdk` for Claude agent integration
- **Embeddings**: Local transformer model via @xenova/transformers
- **File Processing**: Custom markdown parser with full Obsidian support (`[[WikiLinks]]`, frontmatter, etc.)
- **CLI Framework**: Commander.js for command-line interface
- **Testing**: Jest with comprehensive test coverage (80%+)

## Core Architecture

The system is built with a modular, abstracted architecture:

### Key Design Principles
- **Database Abstraction**: All code uses `VectorDatabase` interface, enabling easy provider switching
- **Git-Based Versioning**: Uses commit SHAs to detect when reindexing is needed
- **Smart Chunking**: Optimizes chunk sizes for LLM agent efficiency while preserving document structure
- **Local-first**: Zero hosting costs, runs entirely locally
- **Unified Search**: Single `SearchService` used by both CLI and MCP for consistent results

### Module Structure
```
src/
├── database/             # Vector database abstraction layer
│   ├── interfaces/       # Core VectorDatabase interface
│   └── providers/        # LanceDB implementation
├── obsidian/            # Obsidian-specific processing
│   ├── chunking/         # Content chunking strategies
│   ├── indexing/         # Git-aware indexing system
│   └── parser/           # Markdown & frontmatter parsing
├── mcp/                 # MCP server implementation
│   ├── server/           # Modular setup functions
│   └── types.ts          # Unified zod schemas
├── services/            # Shared business logic
│   └── SearchService.ts  # Unified search functionality
├── cli/                 # Command-line interface
│   └── commands/         # Index, search, status, MCP, backup commands
├── embeddings/          # Local embedding providers
├── types/               # TypeScript type definitions
└── utils/               # Shared utilities
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

### Development Guidelines
- **Abstraction First**: All code uses `VectorDatabase` interface, not direct implementations
- **Test-Driven**: Write tests before implementing features; maintain 80%+ coverage
- **Minimal Reproduction**: Create isolated test scripts for complex debugging scenarios
- **Error Handling**: Use comprehensive error handling with proper logging
- **Code Quality**: Always run `npm run lint` after writing code
- **Modular Architecture**: Extract shared functionality into services for reusability

## TypeScript Configuration

The project uses multiple TypeScript configurations for different purposes:

- **Main tsconfig.json**: Includes Jest types for VSCode intellisense on tests  
- **tsconfig.build.json**: Separate build configuration that excludes tests from dist
- **tsconfig.test.json**: Test-specific configuration with Jest support

This separation ensures tests get type checking but don't pollute the build output.

## Code Conventions

### TypeScript Style
- **Interfaces**: Leverage TypeScript's type system extensively for all interfaces
- **Database Abstraction**: Implement providers following the `VectorDatabase` interface  
- **Error Handling**: Use comprehensive error logging throughout
- **Async Operations**: Use async/await for all I/O and database operations
- **Testing**: Maintain test coverage above 80% for all modules

## Development Commands

### Essential Commands
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run comprehensive linting and quality checks
npm run lint                       # Type checking, ESLint, and formatting
npm run lint:fix                   # Auto-fix linting issues

# Testing
npm test                          # Run all tests
npm run test:watch                # Run tests in watch mode
npm run test:coverage             # Run tests with coverage report

# Individual quality checks
npm run typecheck                 # TypeScript compilation check
npm run lint:eslint              # ESLint only
npm run format                   # Auto-format code with Prettier
npm run format:check             # Check formatting without fixing
```

### CLI Usage
```bash
# Check current indexing status
npx netherdb status

# Index operations
npx netherdb index --full         # Full reindexing
npx netherdb index --incremental  # Incremental update

# Search operations
npx netherdb search "query"       # Semantic search
npx netherdb search --keyword "term"  # Keyword search
npx netherdb search --hybrid "query"  # Combined search
npx netherdb search --browse      # Browse all documents

# MCP server
npx netherdb mcp start            # Start MCP server

# Database management
npx netherdb backup               # Backup database
```

### Code Quality Workflow
**Always run after writing code:**
```bash
npm run lint                      # Comprehensive quality checks
npm test                         # Verify functionality
```

### Running Single Tests
```bash
# Run specific test file
npm test -- tests/database/LanceDBProvider.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="search"

# Run integration tests only
npm test -- tests/integration/
```

### Debugging Workflow
**When encountering complex issues:**
```bash
# 1. Read the troubleshooting guide first
cat TROUBLESHOOTING.md

# 2. Create minimal reproduction test
# scripts/test-specific-issue.ts

# 3. Run focused tests to understand the behavior
npx ts-node scripts/test-specific-issue.ts

# 4. Only after understanding the issue, implement solution
```