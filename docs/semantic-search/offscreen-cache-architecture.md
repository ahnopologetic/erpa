# Offscreen Cache Architecture

## Overview
This document explains the architecture change to move cache operations from the background service worker to the offscreen document to avoid `importScripts` errors.

## Problem with Background Service Worker

### The Error
```
Error: Failed to execute 'importScripts' on 'WorkerGlobalScope': 
The script at 'chrome-extension://.../cache.d2c776b0.js' failed to load.
```

### Why It Happened
- Chrome extension background scripts run in a **service worker** context
- Service workers have strict limitations on module loading
- Dynamic imports (especially Plasmo Storage) can fail with `importScripts` errors
- The background.ts was trying to dynamically import `~lib/semantic-search/cache`
- This import included Plasmo Storage which couldn't load in the service worker

## Solution: Offscreen Document

### What is an Offscreen Document?
- A hidden HTML page that runs in a **full DOM context**
- Has all the capabilities of a regular web page
- Can use any JavaScript modules without restrictions
- Stays alive as long as needed
- Perfect for heavy operations like ML models and storage

### Our Implementation
We already had an offscreen document (`tabs/offscreen.tsx`) for running the embedding model. We extended it to also handle cache operations.

## Architecture Flow

### Before (Broken)
```
Content Script 
    ↓ (chrome.runtime.sendMessage)
Background Service Worker
    ↓ (dynamic import - FAILS!)
Cache Module (Plasmo Storage)
    ❌ importScripts error
```

### After (Working)
```
Content Script 
    ↓ (chrome.runtime.sendMessage)
Background Service Worker
    ↓ (forwards message)
Offscreen Document
    ↓ (direct import - works!)
Cache Module (Plasmo Storage)
    ✅ Success!
```

## Message Flow Details

### 1. Cache Lookup
```typescript
// Content Script (content.tsx)
const response = await chrome.runtime.sendMessage({
  type: 'GET_CACHED_EMBEDDINGS',
  url: 'https://example.com',
  segments: [/* sentence segments */]
});

// Background (background.ts) - Just forwards
await ensureEmbeddingOffscreenDocument();
const response = await chrome.runtime.sendMessage({
  target: 'offscreen',
  type: 'GET_CACHED_EMBEDDINGS',
  url: message.url,
  segments: message.segments
});

// Offscreen (tabs/offscreen.tsx) - Does the actual work
const cache = getCacheInstance();
const cachedEmbeddings = await cache.getCachedEmbeddings(url, segments);
sendResponse({ success: true, cachedEmbeddings });
```

### 2. Cache Write
```typescript
// Content Script
const response = await chrome.runtime.sendMessage({
  type: 'CACHE_EMBEDDINGS',
  url: 'https://example.com',
  segments: [/* segments */],
  embeddings: [/* 2D array */]
});

// Background - Forwards to offscreen
await ensureEmbeddingOffscreenDocument();
const response = await chrome.runtime.sendMessage({
  target: 'offscreen',
  type: 'CACHE_EMBEDDINGS',
  url: message.url,
  segments: message.segments,
  embeddings: message.embeddings
});

// Offscreen - Executes cache write
const cache = getCacheInstance();
await cache.cacheEmbeddings(url, segments, embeddings);
sendResponse({ success: true });
```

## Code Organization

### Offscreen Document (`tabs/offscreen.tsx`)
```typescript
// Cache instance (singleton)
let cacheInstance: EmbeddingCache | null = null;

function getCacheInstance(): EmbeddingCache {
  if (!cacheInstance) {
    cacheInstance = new EmbeddingCache();
  }
  return cacheInstance;
}

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;
  
  if (message.type === 'GET_CACHED_EMBEDDINGS') {
    // Handle cache lookup
  }
  
  if (message.type === 'CACHE_EMBEDDINGS') {
    // Handle cache write
  }
  
  // ... other cache operations
});
```

### Background Script (`background.ts`)
```typescript
// Just forwards cache messages to offscreen
if (message.type === 'GET_CACHED_EMBEDDINGS') {
  await ensureEmbeddingOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'GET_CACHED_EMBEDDINGS',
    url: message.url,
    segments: message.segments
  });
  sendResponse(response);
}

// Similar for all cache operations:
// - CACHE_EMBEDDINGS
// - GET_CACHE_STATS
// - CLEAR_ALL_CACHE
// - CLEANUP_CACHE
```

### Content Script (`content.tsx`)
No changes needed - still sends messages to background as before.

## Benefits of This Approach

### 1. **No Service Worker Restrictions**
- Offscreen documents have full module loading
- No `importScripts` errors
- Can use any npm package or Plasmo feature

### 2. **Consolidation**
- Same offscreen document handles both:
  - Embedding model (transformers.js)
  - Cache operations (Plasmo Storage)
- Reduces complexity and resource usage

### 3. **Reliability**
- Offscreen documents are more stable than service workers
- Full DOM access for any future needs
- Better error handling and debugging

### 4. **Performance**
- Offscreen document stays alive during active use
- No repeated initialization
- Cache operations are fast

## Cache Persistence

### Storage Type: Local
```typescript
this.storage = new Storage({ area: "local" });
```

- Survives tab closes
- Survives browser restarts
- 24-hour expiration policy
- Automatic cleanup of old entries

### Cache Key Structure
```typescript
{
  "semantic_search_embeddings": {
    "https://example.com": {
      url: "https://example.com",
      timestamp: 1234567890,
      sentences: [/* SentenceSegment[] */],
      embeddings: [/* number[][] */],
      pageHash: "abc123"
    }
  }
}
```

## Debugging

### Check if Offscreen is Running
```javascript
// In background.js console
const contexts = await chrome.runtime.getContexts({
  contextTypes: ['OFFSCREEN_DOCUMENT']
});
console.log('Offscreen running:', contexts.length > 0);
```

### Check Cache Stats
```javascript
// In any page console
await erpaCacheDebug.stats();
```

### Monitor Message Flow
Look for these log messages in order:
1. `[semantic-search] Requesting cached embeddings from background`
2. `[background] Forwarding GET_CACHED_EMBEDDINGS to offscreen`
3. `[offscreen] Getting cached embeddings for URL`
4. `[offscreen] ✅ Found cached embeddings` OR `[offscreen] ❌ No cached embeddings found`

## Common Issues

### Offscreen Document Not Created
**Symptom**: No `[offscreen]` logs
**Solution**: Check that `ensureEmbeddingOffscreenDocument()` is called before forwarding messages

### Cache Always Misses
**Symptom**: Always see "No cached embeddings found"
**Solution**: 
- Check if cache write succeeded (look for "✅ Successfully cached embeddings")
- Run `erpaCacheDebug.stats()` to verify cache has data
- Check if page hash changed (content modified)

### importScripts Error Still Appears
**Symptom**: Still seeing importScripts error after changes
**Solution**:
- Rebuild the extension: `pnpm build`
- Reload the extension completely in Chrome
- Clear browser cache and reload

## Testing Checklist

- [ ] First search on a page generates embeddings (~30 sec)
- [ ] Cache write succeeds (check logs)
- [ ] Second search on same page uses cache (< 1 sec)
- [ ] `erpaCacheDebug.stats()` shows cached data
- [ ] Page reload still uses cache
- [ ] Cache survives browser restart
- [ ] No importScripts errors in console
- [ ] All message forwarding works (check logs)

## Future Enhancements

### Possible Improvements
1. **Compression**: Compress embeddings before storing
2. **IndexedDB**: Use IndexedDB for larger storage limits
3. **Smart Invalidation**: Detect meaningful content changes only
4. **Preloading**: Preload embeddings for linked pages
5. **Sync**: Sync cache across devices (if logged in)

### Migration Path
If we need to move cache to a different storage:
1. Add new cache adapter
2. Implement data migration
3. Update getCacheInstance() to use new adapter
4. Keep offscreen architecture (no code changes needed)


