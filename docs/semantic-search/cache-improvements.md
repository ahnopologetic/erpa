# Semantic Search Cache Improvements

## Problem
The semantic search was regenerating embeddings (~30 seconds) on every search, even for the same page. The cache was failing with an `importScripts` error when trying to save embeddings.

## Root Cause
1. **Service Worker Restrictions**: The background service worker couldn't dynamically import Plasmo Storage modules, causing `importScripts` errors
2. **Silent Failures**: Cache errors were logged but not properly surfaced, making it hard to debug
3. **No Visibility**: No easy way to check if cache was working or view cache statistics
4. **Wrong Storage Type**: Using `session` storage instead of `local` storage

## Solutions Implemented

### 1. Moved Cache to Offscreen Document
```typescript
// Before: Cache operations in background.ts (service worker)
// ❌ Failed with importScripts error

// After: Cache operations in offscreen.tsx (full DOM context)
// ✅ Works perfectly - no service worker restrictions
```

**Architecture Change:**
- Background script now forwards cache operations to offscreen document
- Offscreen document handles all cache read/write operations
- Same offscreen document also handles embedding model operations
- **Why**: Offscreen documents have full DOM/module access without service worker restrictions
- **Benefit**: No more `importScripts` errors, reliable caching

### 2. Changed Storage Area
```typescript
// Before
this.storage = new Storage({ area: "session" });

// After
this.storage = new Storage({ area: "local" });
```
- **Why**: `local` storage is more reliable and persistent across sessions
- **Benefit**: Embeddings survive tab reloads and browser restarts

### 3. Enhanced Logging
Added comprehensive logging with emoji indicators throughout the cache flow:
- 🔍 Checking cache
- ✅ Cache hit / Success
- ❌ Cache miss / Error
- ⚙️ Generating embeddings
- 💾 Saving to cache
- ⚠️ Warnings

### 4. Better Error Handling
- Cache lookup failures no longer break search
- Proper error propagation with meaningful messages
- Cache write failures are logged but don't stop the search

### 5. Console Debugging Utilities
Added global `erpaCacheDebug` object with methods:

```javascript
// Check cache statistics
await erpaCacheDebug.stats()
// Output:
// 📊 Semantic Search Cache Stats:
//   Total URLs cached: 5
//   Total sentences: 12450
//   Total embeddings: 12450
//   Oldest entry: 1/23/2025, 11:30 AM
//   Newest entry: 1/23/2025, 2:45 PM

// Clear all cached embeddings
await erpaCacheDebug.clear()
// Output: ✅ Cache cleared successfully

// Show help
erpaCacheDebug.help()
```

### 6. Improved Message Handling
New message flow:
```
Content Script → Background → Offscreen → Cache Operations
                    ↓
              (forwards only)
```

Background script:
- Ensures offscreen document exists
- Forwards cache messages to offscreen
- Relays responses back to content script

Offscreen document:
- Handles all cache operations directly
- Uses Plasmo Storage without restrictions
- Returns results to background

## Expected Behavior

### First Search on a Page
```
[semantic-search] 🔍 Checking cache for existing embeddings...
[semantic-search] Requesting cached embeddings from background for: https://en.wikipedia.org/wiki/Harvard_University
[background] Forwarding GET_CACHED_EMBEDDINGS to offscreen
[offscreen] Getting cached embeddings for URL: https://en.wikipedia.org/wiki/Harvard_University
[semantic-search] Checking cache for URL: https://en.wikipedia.org/wiki/Harvard_University
[semantic-search] Cache contains 0 URLs
[semantic-search] ❌ No cached embeddings found for URL: https://en.wikipedia.org/wiki/Harvard_University
[offscreen] ❌ No cached embeddings found
[semantic-search] ⭕ Cache miss - no embeddings found
[semantic-search] ⚙️ No cache hit - Generating embeddings for 2284 sentences (this may take ~30 seconds)...
[semantic-search] Batch embeddings generated successfully
[semantic-search] 💾 Saving embeddings to cache...
[semantic-search] Sending 2284 embeddings to background for caching...
[background] Forwarding CACHE_EMBEDDINGS to offscreen
[offscreen] 💾 Caching embeddings for URL: https://en.wikipedia.org/wiki/Harvard_University
[offscreen] Received 2284 embeddings for 2284 segments
[semantic-search] 💾 Caching embeddings for URL: https://en.wikipedia.org/wiki/Harvard_University
[semantic-search] ✅ Successfully cached 2284 embeddings for 2284 sentences (hash: abc123)
[offscreen] ✅ Successfully cached embeddings
[semantic-search] ✅ Successfully saved 2284 embeddings to cache
```

### Second Search on Same Page (Should be instant!)
```
[semantic-search] 🔍 Checking cache for existing embeddings...
[semantic-search] Requesting cached embeddings from background for: https://en.wikipedia.org/wiki/Harvard_University
[background] Forwarding GET_CACHED_EMBEDDINGS to offscreen
[offscreen] Getting cached embeddings for URL: https://en.wikipedia.org/wiki/Harvard_University
[semantic-search] Checking cache for URL: https://en.wikipedia.org/wiki/Harvard_University
[semantic-search] Cache contains 1 URLs
[semantic-search] Found cached entry: { age: '5 minutes', sentenceCount: 2284, currentHash: 'abc123', cachedHash: 'abc123' }
[semantic-search] ✅ Using cached embeddings for URL: https://en.wikipedia.org/wiki/Harvard_University ( 2284 embeddings )
[offscreen] ✅ Found cached embeddings, returning to caller
[semantic-search] 🎯 Cache hit! Received 2284 embeddings
[semantic-search] ✅ Using 2284 cached embeddings - skipping generation!
```

## Testing the Cache

1. **Test Basic Caching**:
   ```
   1. Open a Wikipedia page
   2. Perform a semantic search (wait ~30 seconds)
   3. Check console - should see "💾 Saving embeddings to cache"
   4. Perform another search on the SAME page
   5. Should be instant with "✅ Using cached embeddings"
   ```

2. **Check Cache Stats**:
   ```javascript
   // Open console and run:
   await erpaCacheDebug.stats()
   ```

3. **Test Cache Persistence**:
   ```
   1. Search on a page (cache populated)
   2. Reload the page
   3. Search again - should still use cache!
   ```

4. **Clear Cache**:
   ```javascript
   // If you need to force regeneration:
   await erpaCacheDebug.clear()
   ```

## Cache Invalidation

The cache automatically invalidates when:
- **Page content changes**: Uses a hash of sentence content
- **24 hours pass**: Entries older than 24 hours are cleaned up
- **Manual clear**: Using `erpaCacheDebug.clear()`

## Performance Impact

### Before Caching
- Every search: ~30 seconds (embedding generation)
- User experience: Poor, lots of waiting

### After Caching
- First search: ~30 seconds (one-time cost)
- Subsequent searches: **< 1 second** ⚡
- User experience: Excellent, instant results

## Files Modified

1. `/src/lib/semantic-search/cache.ts`
   - Changed storage area to "local"
   - Enhanced logging
   - Better error handling

2. `/src/lib/semantic-search/search-engine.ts`
   - Improved cache lookup logging
   - Better cache validation
   - Enhanced error handling

3. `/src/tabs/offscreen.tsx` ⭐ **KEY CHANGE**
   - Added cache instance management
   - Implemented all cache operations (GET, SET, STATS, CLEAR, CLEANUP)
   - Handles cache in full DOM context without service worker restrictions

4. `/src/background.ts`
   - Removed direct cache operations (was causing importScripts errors)
   - Now forwards all cache messages to offscreen document
   - Ensures offscreen document exists before forwarding

5. `/src/content.tsx`
   - Added global `erpaCacheDebug` debugging utilities
   - Exposed cache management to console

## Troubleshooting

### Cache Not Working?
1. Check console for error messages
2. Run `erpaCacheDebug.stats()` to verify cache
3. Check if storage permissions are granted
4. Try clearing cache and retry: `erpaCacheDebug.clear()`

### Still Slow After First Search?
1. Check console for "Cache hit" vs "Cache miss" messages
2. Verify page hash matches (shown in logs)
3. Check if page content changed (invalidates cache)

### Storage Issues?
1. Check Chrome extension storage quota
2. Clear old entries: `erpaCacheDebug.clear()`
3. Check browser console for storage errors

