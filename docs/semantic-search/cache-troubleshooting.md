# Cache Troubleshooting Guide

## To Answer Your Question: Does Offscreen Share Storage with Background/Sidepanel?

**YES! ✅** `chrome.storage.local` is shared across ALL extension contexts:
- ✅ Background service worker
- ✅ Content scripts
- ✅ Offscreen documents
- ✅ Sidepanel
- ✅ Popup
- ✅ Any other extension page

They all read/write to the **exact same storage area**. If offscreen writes data, background/sidepanel/content can immediately read it.

## Diagnosing Cache Issues

### Step 1: Verify Cache Write
After a search completes, check the logs for:

```
[offscreen] 💾 Caching embeddings for URL: https://example.com
[semantic-search] ✅ Successfully cached 2284 embeddings for 2284 sentences (hash: -vzulbw)
[semantic-search] ✅ Verification: Cache now has 1 URLs
[semantic-search] ✅ URL is in cache? true
[offscreen] ✅ Successfully cached embeddings
```

**Key indicators:**
- "Verification: Cache now has 1 URLs" ← Should increase
- "URL is in cache? true" ← Must be true

### Step 2: Inspect Storage Directly
Open the console and run:

```javascript
await erpaCacheDebug.inspect()
```

This will show you **exactly** what's in `chrome.storage.local`:

```
🔍 Direct Storage Inspection:
  Storage area: chrome.storage.local
  Cache key: "semantic_search_embeddings"
  URLs in cache: 1

  [1] URL: https://en.wikipedia.org/wiki/Harvard_University
      Sentences: 2284
      Embeddings: 2284
      Hash: -vzulbw
      Age: 5 minutes
```

### Step 3: Check Cache Lookup
When doing a second search, watch the logs:

```
[semantic-search] 🔍 Checking cache for URL: https://example.com
[semantic-search] Using cache key: semantic_search_embeddings
[semantic-search] 📦 Cache contains 1 URLs
[semantic-search] 📋 Cached URLs: ['https://example.com']
[semantic-search] 🔎 Looking for exact URL: https://example.com
[semantic-search] 🔎 URL match found? true
```

**What to look for:**
- "Cache contains X URLs" - Should not be 0
- "Cached URLs" - Should list your current URL
- "URL match found? true" - Must be true for cache hit

## Common Issues & Solutions

### Issue 1: URL Mismatch
**Symptom:**
```
[semantic-search] 🔎 Looking for exact URL: https://example.com/
[semantic-search] 🔎 URL match found? false
[semantic-search] 💡 Available cache keys: ['https://example.com']
```

**Cause:** URL has trailing slash or query parameters that differ

**Solution:** URLs must match **exactly**. Check for:
- Trailing slashes (`/`)
- Query parameters (`?param=value`)
- Hash fragments (`#section`)
- `http` vs `https`

**Fix:** Normalize URLs before caching (we can add this)

### Issue 2: Page Content Changed
**Symptom:**
```
[semantic-search] ✅ Found cached entry: {
  hashMatch: false
}
[semantic-search] ⚠️ Cached embeddings expired or invalid
[semantic-search] ⚠️ Reason: { hashMismatch: true }
```

**Cause:** Page content was modified (e.g., Wikipedia article updated)

**Solution:** This is expected behavior! The cache invalidates when content changes. The page will re-generate embeddings.

### Issue 3: Cache Expired
**Symptom:**
```
[semantic-search] ⚠️ Reason: {
  ageHours: 25,
  expired: true
}
```

**Cause:** Cache entry is older than 24 hours

**Solution:** This is expected. Just do another search to regenerate.

### Issue 4: Empty Cache
**Symptom:**
```
[semantic-search] 📦 Cache contains 0 URLs
```

**Possible causes:**
1. Cache was never written
2. Cache was cleared
3. Extension was reloaded
4. Different Plasmo Storage instance

**Debugging:**
```javascript
// Check raw storage
await erpaCacheDebug.inspect()

// If empty, check if write succeeded
// Look for "✅ URL is in cache? true" in logs
```

### Issue 5: Separate Storage Instances
**Symptom:** Offscreen says "cached successfully" but content script sees empty cache

**Cause:** Multiple `EmbeddingCache` instances using different storage objects

**Check:**
```
[semantic-search] Using cache key: semantic_search_embeddings
```

All contexts should log the **same cache key**. If different, there's a configuration issue.

### Issue 6: Async Timing
**Symptom:** Cache lookup happens before write completes

**Check the order of logs:**
```
✅ GOOD:
1. [offscreen] ✅ Successfully cached embeddings
2. [semantic-search] 🔍 Checking cache for URL
3. [semantic-search] ✅ Found cached entry

❌ BAD:
1. [semantic-search] 🔍 Checking cache for URL  ← Too early!
2. [semantic-search] 📦 Cache contains 0 URLs
3. [offscreen] ✅ Successfully cached embeddings  ← Happens after lookup
```

**Solution:** Ensure proper await/async handling in message flow

## Debugging Commands

### Check Cache Status
```javascript
// High-level stats (via offscreen)
await erpaCacheDebug.stats()

// Low-level storage inspection (direct access)
await erpaCacheDebug.inspect()
```

### Force Clear Cache
```javascript
await erpaCacheDebug.clear()
```

### Manual Storage Check (DevTools)
1. Open DevTools
2. Go to Application tab
3. Navigate to Storage → Extension Storage → Local
4. Look for key: `semantic_search_embeddings`
5. Click to view raw JSON

## Testing Scenario

### Test Cache Persistence
```
1. Open Wikipedia article
2. Do semantic search (wait ~30 sec)
3. Run: await erpaCacheDebug.inspect()
   → Should show 1 URL with embeddings
   
4. Do another search on SAME page
   → Should be instant (< 1 sec)
   → Check logs for "✅ Using cached embeddings"
   
5. Reload the page
6. Do another search
   → Should STILL use cache (< 1 sec)
   → Cache persists across page reloads!
   
7. Reload extension
8. Go back to same page
9. Do another search
   → Should STILL use cache
   → Cache persists across extension reloads!
```

## What the Logs Should Show

### First Search (Cache Miss)
```
[semantic-search] 🔍 Checking cache for URL: https://en.wikipedia.org/wiki/Harvard
[semantic-search] 📦 Cache contains 0 URLs
[semantic-search] ❌ No cached embeddings found
[semantic-search] ⚙️ Generating embeddings for 2284 sentences
... (30 seconds later) ...
[semantic-search] 💾 Writing to storage
[semantic-search] ✅ Verification: Cache now has 1 URLs
[semantic-search] ✅ URL is in cache? true
```

### Second Search (Cache Hit)
```
[semantic-search] 🔍 Checking cache for URL: https://en.wikipedia.org/wiki/Harvard
[semantic-search] 📦 Cache contains 1 URLs
[semantic-search] 📋 Cached URLs: ['https://en.wikipedia.org/wiki/Harvard']
[semantic-search] 🔎 URL match found? true
[semantic-search] ✅ Found cached entry: { embeddingCount: 2284, hashMatch: true }
[semantic-search] ✅ Using cached embeddings - skipping generation!
```

## Still Having Issues?

If cache is still not working after checking all of the above:

1. **Clear everything and start fresh:**
   ```javascript
   await erpaCacheDebug.clear()
   ```

2. **Check extension permissions:**
   - Make sure extension has `storage` permission

3. **Check Plasmo Storage version:**
   - Ensure `@plasmohq/storage` is up to date

4. **Try manual storage test:**
   ```javascript
   const { Storage } = await import('@plasmohq/storage');
   const storage = new Storage({ area: 'local' });
   
   // Write test
   await storage.set('test_key', { foo: 'bar' });
   
   // Read test
   const value = await storage.get('test_key');
   console.log('Test value:', value); // Should show { foo: 'bar' }
   ```

5. **Check Chrome storage limits:**
   - chrome.storage.local has a limit (usually 5-10MB)
   - Large embeddings might exceed limits
   - Check with: `chrome.storage.local.getBytesInUse()`

6. **Enable verbose logging:**
   - All cache operations now have detailed logs
   - Compare offscreen vs content script logs
   - Look for any discrepancies

