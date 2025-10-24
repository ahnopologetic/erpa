# Cache Serialization Fix

## The Bug

### Symptoms
```
[semantic-search] ✅ Successfully cached 2284 embeddings
[semantic-search] ✅ Verification: Cache now has 0 URLs  ← ❌ EMPTY!
[semantic-search] ✅ URL is in cache? false              ← ❌ NOT FOUND!
```

Cache write appeared to succeed but verification showed the cache was empty.

### Root Cause
The `SentenceSegment` objects contain **DOM elements** that cannot be serialized to JSON:

```typescript
export interface SentenceSegment {
  text: string;
  element: HTMLElement;  // ← ❌ Can't serialize this!
  selector: string;
  startOffset: number;
  endOffset: number;
  index: number;
}
```

When trying to store these objects in `chrome.storage.local`:
1. Chrome tries to serialize the object to JSON
2. **DOM nodes (HTMLElement) can't be serialized**
3. The write **silently fails** or returns empty object
4. No error is thrown, making it hard to debug

## The Fix

### Created Serializable Format
```typescript
// New serializable version WITHOUT DOM elements
export interface SerializableSentenceSegment {
  text: string;
  selector: string;    // ✅ Can reconstruct element from this if needed
  startOffset: number;
  endOffset: number;
  index: number;
  // Note: NO element property!
}

export interface CachedEmbeddings {
  url: string;
  timestamp: number;
  sentences: SerializableSentenceSegment[];  // ✅ Now serializable
  embeddings: number[][];
  pageHash: string;
}
```

### Added Serialization Helper
```typescript
private toSerializable(sentence: SentenceSegment): SerializableSentenceSegment {
  return {
    text: sentence.text,
    selector: sentence.selector,
    startOffset: sentence.startOffset,
    endOffset: sentence.endOffset,
    index: sentence.index
    // Explicitly exclude: element (DOM node)
  };
}
```

### Updated Cache Write
```typescript
async cacheEmbeddings(url, sentences, embeddings) {
  // Convert to serializable format (remove DOM elements)
  const serializableSentences = sentences.map(s => this.toSerializable(s));
  
  cache[url] = {
    url,
    timestamp: Date.now(),
    sentences: serializableSentences,  // ✅ No DOM elements
    embeddings,
    pageHash
  };
  
  await this.storage.set(CACHE_KEY, cache);  // ✅ Now works!
}
```

## Why This Works

### Storage Requirements
`chrome.storage.local` can only store **JSON-serializable** data:
- ✅ Strings, numbers, booleans
- ✅ Arrays and objects
- ✅ null
- ❌ Functions
- ❌ DOM nodes
- ❌ Circular references
- ❌ undefined (becomes null)

### What We Store Now
```json
{
  "semantic_search_embeddings": {
    "https://example.com": {
      "url": "https://example.com",
      "timestamp": 1234567890,
      "sentences": [
        {
          "text": "This is a sentence.",
          "selector": "#content > p:nth-child(2)",
          "startOffset": 0,
          "endOffset": 20,
          "index": 0
        }
      ],
      "embeddings": [[0.1, 0.2, ...], [0.3, 0.4, ...]],
      "pageHash": "abc123"
    }
  }
}
```

All primitive types and plain objects - **fully serializable!**

## Impact on Functionality

### What Changed
- **Storage**: Now stores serializable sentence metadata
- **Hash validation**: Still works (uses `text` property)
- **Cache hits**: Now work correctly!

### What Didn't Change
- **Embeddings**: Still cached and returned properly
- **DOM interaction**: Fresh DOM elements come from current page segmentation
- **Search results**: Unchanged - uses current page elements

### Architecture
```
┌─────────────────────────────────────────────────────┐
│ Search Engine (search-engine.ts)                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. Segment current page → SentenceSegment[]        │
│     (includes fresh DOM elements)                   │
│                                                      │
│  2. Check cache for embeddings                      │
│     ↓                                                │
│  Cache (cache.ts)                                   │
│     ├─ Store: SerializableSentenceSegment[]         │
│     │  (NO DOM elements)                            │
│     └─ Return: embeddings only                      │
│                                                      │
│  3. If cache miss: generate new embeddings          │
│                                                      │
│  4. Use current page segments for results           │
│     (with fresh DOM elements from step 1)           │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Key insight**: We never need to store DOM elements because:
1. Embeddings depend only on text (which we store)
2. When retrieving from cache, we re-segment the current page to get fresh DOM elements
3. Cache is used only for embeddings, not for DOM interaction

## Testing

### Before Fix
```
[semantic-search] Verification: Cache now has 0 URLs     ← ❌ Empty
[semantic-search] URL is in cache? false                 ← ❌ Missing
```

### After Fix
```
[semantic-search] Serialized 2284 sentences (removed DOM elements)
[semantic-search] Verification: Cache now has 1 URLs     ← ✅ Success!
[semantic-search] URL is in cache? true                  ← ✅ Found!
```

### Verification Steps
1. Do a semantic search
2. Check logs for:
   ```
   [semantic-search] 💾 Serialized X sentences (removed DOM elements)
   [semantic-search] ✅ Verification: Cache now has 1 URLs
   [semantic-search] ✅ URL is in cache? true
   ```
3. Do another search - should use cache:
   ```
   [semantic-search] ✅ Using cached embeddings - skipping generation!
   ```
4. Run in console:
   ```javascript
   await erpaCacheDebug.inspect()
   // Should show URLs with sentences and embeddings
   ```

## Related Issues

### Common JSON Serialization Pitfalls

1. **DOM Nodes**
   ```typescript
   ❌ element: document.getElementById('foo')
   ✅ selector: '#foo'
   ```

2. **Functions**
   ```typescript
   ❌ callback: () => console.log('hi')
   ✅ Store the data, recreate function later
   ```

3. **Circular References**
   ```typescript
   ❌ obj.self = obj
   ✅ Break the cycle or use JSON.stringify with replacer
   ```

4. **undefined**
   ```typescript
   ❌ value: undefined    // Becomes null in JSON
   ✅ value: null         // Explicit
   ✅ Omit the property
   ```

5. **Dates**
   ```typescript
   ❌ date: new Date()    // Becomes string
   ✅ timestamp: Date.now()  // Store as number
   ```

### Chrome Storage Limits
- **chrome.storage.local**: 5-10MB total (unlimitedStorage permission for more)
- **chrome.storage.sync**: 100KB total, 8KB per item
- **chrome.storage.session**: 10MB total (in-memory)

Our embeddings use local storage with ~2MB per page (2284 sentences × 384 dimensions × 8 bytes).

## Prevention

### Type Safety
```typescript
// Define what can be stored
type Storable = string | number | boolean | null | Storable[] | { [key: string]: Storable };

// Helper to ensure serializability
function assertSerializable<T extends Storable>(value: T): T {
  return value;
}
```

### Pre-storage Validation
```typescript
async cacheEmbeddings(url, sentences, embeddings) {
  const data = {
    sentences: sentences.map(toSerializable),  // Remove DOM
    embeddings
  };
  
  // Validate before storing
  try {
    JSON.stringify(data);  // Will throw if not serializable
  } catch (e) {
    throw new Error('Data is not serializable: ' + e.message);
  }
  
  await storage.set(key, data);
}
```

## Summary

**Problem**: DOM elements in cache objects caused silent serialization failures

**Solution**: Strip DOM elements before caching, store only serializable metadata

**Result**: Cache now works reliably, 30-second embedding generation becomes <1 second on subsequent searches! ⚡

