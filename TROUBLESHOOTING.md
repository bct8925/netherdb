# Troubleshooting Guide

This document contains systematic debugging methodologies and technical solutions for common problems encountered in this project.

## LanceDB Integration Issues

### Problem: "Found field not in schema" Errors

**Symptoms:**
- Error: `Found field not in schema: metadata.fieldName at row 0`
- Error: `Found field not in schema: vector.isValid at row 0`
- Occurs during insert or update operations

**Root Causes & Solutions:**

#### 1. JavaScript Date Objects in Nested Structures
**Cause:** LanceDB cannot infer schema for JavaScript `Date` objects in nested metadata.
```javascript
// ❌ This breaks schema inference:
metadata: {
  lastModified: new Date()  // Date object breaks LanceDB
}

// ✅ Use ISO strings instead:
metadata: {
  lastModified: new Date().toISOString()  // Works perfectly
}
```

**Solution:**
- Convert all `Date` objects to ISO strings before inserting: `date.toISOString()`
- Convert ISO strings back to `Date` objects when reading: `new Date(isoString)`

#### 2. Apache Arrow Vector Objects vs Plain Arrays
**Cause:** LanceDB returns Apache Arrow `Vector` objects, not plain JavaScript arrays.
```javascript
// ❌ Problem: LanceDB returns Arrow Vector objects
const record = await table.search(...).toArray()[0];
console.log(Array.isArray(record.vector)); // false
console.log(record.vector.constructor.name); // "Vector"

// ✅ Solution: Convert to plain arrays
const plainVector = Array.from(record.vector);
const plainTags = Array.from(record.metadata.tags);
```

**Detection:**
- Check if object has `isValid` property: `'isValid' in object`
- Check constructor name: `object.constructor.name === 'Vector'`

**Solution:**
```javascript
// Convert Arrow Vectors to plain arrays when reading from LanceDB
private parseMetadataDates(metadata: any): any {
  if (metadata && typeof metadata === 'object') {
    const parsed = { ...metadata };
    
    // Convert Arrow Vectors to plain arrays
    if (parsed.tags && typeof parsed.tags === 'object' && 'isValid' in parsed.tags) {
      parsed.tags = Array.from(parsed.tags);
    }
    
    return parsed;
  }
  return metadata;
}
```

#### 3. Schema Consistency Requirements
**Cause:** LanceDB requires exact schema consistency - cannot add new fields during updates.
```javascript
// ❌ This breaks schema:
await table.add([{
  id: 'existing',
  vector: [...],
  content: '...',
  metadata: {
    title: '...',
    newField: 'new value'  // New field breaks schema
  }
}]);

// ✅ Maintain exact schema structure:
await table.add([{
  id: 'existing', 
  vector: [...],
  content: '...',
  metadata: {
    title: 'updated value',  // Only update existing fields
    // Don't add new fields
  }
}]);
```

### Problem: Update Operations Not Supported

**Symptoms:**
- Error: `Unsupported value type: object value: ([object Object])`
- Error: `Nested column references are not yet supported`

**Root Cause:** LanceDB doesn't support updating nested objects directly.

**Solution: Delete + Insert Pattern**
```javascript
async update(id: string, vector?: number[], metadata?: Partial<Metadata>): Promise<void> {
  // 1. Get existing record
  const existing = await this.getById(id);
  if (!existing) throw new Error(`Record not found: ${id}`);

  // 2. Create updated record maintaining exact schema
  const updatedRecord = {
    id: id,
    vector: vector || Array.from(existing.vector), // Convert Arrow Vector to plain array
    content: existing.content,
    metadata: metadata ? {
      ...existing.metadata,
      ...metadata,
      // Handle Date conversion
      lastModified: metadata.lastModified instanceof Date 
        ? metadata.lastModified.toISOString()
        : (metadata.lastModified || existing.metadata.lastModified)
    } : existing.metadata,
  };

  // 3. Delete + Insert (atomic operation in LanceDB)
  await this.table.delete(`id = '${id}'`);
  await this.table.add([updatedRecord]);
}
```

### Problem: Embedding Model Issues

**Symptoms:**
- Error: `Embedding dimension mismatch: expected 384, got 4224`
- Model returns unexpected tensor shapes

**Root Cause:** Transformers.js returns tensors with shape `[batch, sequence, hidden]` but we need `[hidden]`.

**Solution: Implement Proper Tensor Pooling**
```javascript
private applyPooling(data: number[], batchSize: number, seqLength: number, hiddenDim: number): number[] {
  const embedding = new Array(hiddenDim).fill(0);
  const poolingStrategy = this.config.pooling || 'mean';
  
  if (poolingStrategy === 'mean') {
    // Mean pooling: average across sequence length
    for (let seq = 0; seq < seqLength; seq++) {
      for (let dim = 0; dim < hiddenDim; dim++) {
        const index = seq * hiddenDim + dim;
        const value = data[index];
        if (value !== undefined) {
          embedding[dim] += value / seqLength;
        }
      }
    }
  } else if (poolingStrategy === 'cls') {
    // CLS pooling: use first token's embedding
    for (let dim = 0; dim < hiddenDim; dim++) {
      const value = data[dim];
      if (value !== undefined) {
        embedding[dim] = value;
      }
    }
  }

  // Apply normalization if configured
  if (this.config.normalize) {
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }
  }

  return embedding;
}
```

## General Debugging Methodology

### Systematic Problem Isolation

**Step 1: Create Minimal Reproduction**
```javascript
// Don't debug in the main codebase - create isolated test
// scripts/test-specific-issue.ts
async function testSpecificIssue() {
  const db = await lancedb.connect('./test.lancedb');
  
  // Test ONE thing at a time
  const result = await db.createTable('test', [simple_data]);
  console.log('Success/Failure details...');
}
```

**Step 2: Test Assumptions Individually**
- Test each data type individually (Date vs ISO string)
- Test library behavior with different input formats
- Test return value types and structures

**Step 3: Use Browser/Node DevTools**
```javascript
// Log detailed type information
console.log('Type:', typeof value);
console.log('Constructor:', value?.constructor?.name);
console.log('IsArray:', Array.isArray(value));
console.log('Has isValid:', 'isValid' in (value || {}));
```

**Step 4: Research Known Issues**
- Search for library-specific error messages
- Check GitHub issues for known limitations
- Look for TypeScript/JavaScript specific gotchas

### Integration Testing Best Practices

**Clean State Testing:**
```javascript
// In test scripts, always clean up before and after
async function runTest() {
  const testDbPath = path.join(__dirname, '../test-data/test.lancedb');
  
  // Clean up any existing test database to ensure clean state
  console.log('🧹 Cleaning up any existing test database...');
  try {
    await fs.rm(testDbPath, { recursive: true, force: true });
    console.log('✅ Previous test database cleaned up');
  } catch {
    // Database might not exist, which is fine
  }
  
  // ... run your test ...
  
  // Clean up after test
  try {
    await fs.rm(testDbPath, { recursive: true, force: true });
    console.log('🧹 Test database cleaned up');
  } catch {}
}

// For Jest tests, use beforeEach/afterEach
beforeEach(async () => {
  await fs.rm(testDbPath, { recursive: true, force: true });
});
```

**Real Data Structure Testing:**
```javascript
// Use actual data structures, not simplified test data
const realVectorData = {
  id: 'doc-1',
  vector: new Array(384).fill(0.1), // Real embedding dimension
  content: 'Actual content',
  metadata: {
    filePath: '/real/path.md',
    title: 'Real Title',
    tags: ['real', 'tags'],
    chunkIndex: 0,
    totalChunks: 1,
    lastModified: new Date().toISOString(), // Real date handling
  }
};
```

**Progressive Complexity:**
1. Test simple flat structures first
2. Add nested objects one field at a time  
3. Test with real library return types
4. Test full integration last

### Error Message Analysis

**LanceDB-Specific Patterns:**
- `Found field not in schema` → Schema inference problem or type mismatch
- `Unsupported value type: object` → Nested object update not supported
- `Nested column references are not yet supported` → Use flat field access only
- `No vector column found` → Wrong method used (search vs. filter)

**General TypeScript/Library Issues:**
- `Property 'X' does not exist on type 'Y'` → Type definitions don't match runtime
- `Unexpected any. Specify a different type` → Configure linting rules per file pattern
- `Cannot read properties of undefined` → Check library return value structures

**Investigation Commands:**
```bash
# Test library behavior in isolation
npx ts-node scripts/test-library-behavior.ts

# Check TypeScript compilation without running
npm run typecheck

# Debug with detailed logging
DEBUG=* npm test
```

This systematic approach of minimal reproduction → understanding → targeted solution saves significant debugging time and leads to more robust solutions.

## Search & Pattern Matching Issues

### Problem: Search Returns 0 Results for Known Code

**Symptoms:**
- Search tools return 0 results when you know the code exists
- Grep/Search operations fail to find expected class names, functions, or identifiers
- Getting unexpected empty results for common patterns

**Root Causes & Solutions:**

#### 1. Extra Quotes in Search Patterns
**Cause:** Accidentally including extra quotes in search pattern strings.
```javascript
// ❌ These patterns will fail:
Search(pattern: "VersionTracker"")    // Extra trailing quote
Search(pattern: ""VersionTracker")    // Extra leading quote
Grep(pattern: "getUserData"")         // Extra trailing quote

// ✅ Correct patterns:
Search(pattern: "VersionTracker")     // Proper quoting
Search(pattern: VersionTracker)       // No quotes needed for simple identifiers
Grep(pattern: getUserData)            // Simple identifier, no quotes needed
```

**Detection:**
- Count quotes in your pattern string - should be 0 or 2, never 1 or 3
- If getting 0 results for known code, check pattern syntax first
- Copy the pattern to a text editor to visually inspect quotes

**Solution:**
```javascript
// Debugging process:
1. Check pattern quote count: pattern should have matching quotes or none
2. Try without quotes first: Search(pattern: ClassName)
3. Add quotes only if needed: Search(pattern: "multi word pattern")
4. Test with basic grep if unsure: grep "ClassName" src/**/*.ts
```

#### 2. Incorrect Quote Usage Rules
**When to Use Quotes in Search Patterns:**

**No quotes needed (preferred):**
- Simple class names: `VersionTracker`
- Function names: `getUserData`
- Variable names: `dbConnection`
- File extensions in globs: `*.ts`

**Quotes required:**
- Multi-word patterns: `"export default"`
- Patterns with spaces: `"function name"`
- Regex with shell metacharacters: `"user\\.email"`
- Patterns with special characters: `"user@domain.com"`

**Quick Test:**
```bash
# If in doubt, test your pattern with basic grep first:
grep "YourPattern" src/**/*.ts
# Then use the same pattern (with or without quotes) in Search/Grep tools
```

#### 3. Search Tool Selection
**Different tools for different use cases:**

```javascript
// For finding class/function definitions:
Grep(pattern: ClassName, output_mode: "content", glob: "**/*.ts")

// For finding files by name pattern:
Glob(pattern: "**/*ClassName*.ts")

// For complex multi-step searches:
Task(subagent_type: "general-purpose", prompt: "Find all usages of ClassName")
```

**Troubleshooting Workflow:**
1. **Start simple**: Use unquoted patterns for identifiers
2. **Check syntax**: Visually inspect quotes before running search
3. **Cross-verify**: If 0 results seem wrong, try alternative search methods
4. **Test incrementally**: Add complexity (quotes, regex) only as needed

**Common Copy-Paste Errors:**
- Copying search patterns can duplicate quotes
- Auto-completion might add extra quotes
- Always verify the final pattern before execution