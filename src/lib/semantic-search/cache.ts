import { Storage } from "@plasmohq/storage";
import { log, err } from "~lib/log";
import type { SentenceSegment } from "./sentence-segmenter";

// Serializable version of SentenceSegment (without DOM elements)
export interface SerializableSentenceSegment {
  text: string;
  selector: string;
  startOffset: number;
  endOffset: number;
  index: number;
}

export interface CachedEmbeddings {
  url: string;
  timestamp: number;
  sentences: SerializableSentenceSegment[];  // Serializable, no DOM elements
  embeddings: number[][];
  pageHash: string;
}

export interface CacheEntry {
  [url: string]: CachedEmbeddings;
}

/**
 * Service for caching sentence embeddings using Plasmo Storage
 */
export class EmbeddingCache {
  private static readonly CACHE_KEY = 'semantic_search_embeddings';
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private storage: Storage;

  constructor() {
    // Use local storage for persistent caching (more reliable than session)
    this.storage = new Storage({
      area: "local"
    });
  }

  /**
   * Generate a simple hash of the page content for cache invalidation
   * Works with both SentenceSegment and SerializableSentenceSegment
   */
  private generatePageHash(sentences: SentenceSegment[] | SerializableSentenceSegment[]): string {
    const content = sentences
      .map(s => s.text)
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Check if cached embeddings are still valid
   */
  private isCacheValid(cached: CachedEmbeddings, currentHash: string): boolean {
    const now = Date.now();
    const age = now - cached.timestamp;

    return (
      age < EmbeddingCache.CACHE_DURATION &&
      cached.pageHash === currentHash
    );
  }

  /**
   * Get cached embeddings for the current page
   */
  async getCachedEmbeddings(
    url: string,
    sentences: SentenceSegment[]
  ): Promise<CachedEmbeddings | null> {
    try {
      log('[semantic-search] 🔍 Checking cache for URL:', url);
      log('[semantic-search] Using cache key:', EmbeddingCache.CACHE_KEY);

      const cache: CacheEntry = await this.storage.get(EmbeddingCache.CACHE_KEY) || {};

      const cacheKeys = Object.keys(cache);
      log('[semantic-search] 📦 Cache contains', cacheKeys.length, 'URLs');

      if (cacheKeys.length > 0) {
        log('[semantic-search] 📋 Cached URLs:', cacheKeys);
        log('[semantic-search] 🔎 Looking for exact URL:', url);
        log('[semantic-search] 🔎 URL match found?', cacheKeys.includes(url));
      }

      const cached = cache[url];
      if (!cached) {
        log('[semantic-search] ❌ No cached embeddings found for URL:', url);
        log('[semantic-search] 💡 Available cache keys:', cacheKeys);
        return null;
      }

      const currentHash = this.generatePageHash(sentences);
      const cachedAge = Date.now() - cached.timestamp;

      log('[semantic-search] ✅ Found cached entry:', {
        age: Math.round(cachedAge / 1000 / 60) + ' minutes',
        sentenceCount: cached.sentences.length,
        embeddingCount: cached.embeddings.length,
        currentHash,
        cachedHash: cached.pageHash,
        hashMatch: currentHash === cached.pageHash
      });

      if (this.isCacheValid(cached, currentHash)) {
        log('[semantic-search] ✅ Using cached embeddings for URL:', url, '(', cached.embeddings.length, 'embeddings )');
        return cached;
      } else {
        const ageHours = Math.round(cachedAge / 1000 / 60 / 60);
        log('[semantic-search] ⚠️ Cached embeddings expired or invalid for URL:', url);
        log('[semantic-search] ⚠️ Reason:', {
          ageHours,
          expired: cachedAge >= EmbeddingCache.CACHE_DURATION,
          hashMismatch: currentHash !== cached.pageHash
        });
        await this.clearCachedEmbeddings(url);
        return null;
      }
    } catch (error) {
      err('[semantic-search] ❌ Error retrieving cached embeddings:', error);
      return null;
    }
  }

  /**
   * Convert SentenceSegment to serializable format (remove DOM elements)
   */
  private toSerializable(sentence: SentenceSegment): SerializableSentenceSegment {
    return {
      text: sentence.text,
      selector: sentence.selector,
      startOffset: sentence.startOffset,
      endOffset: sentence.endOffset,
      index: sentence.index
    };
  }

  /**
   * Cache embeddings for the current page
   */
  async cacheEmbeddings(
    url: string,
    sentences: SentenceSegment[],
    embeddings: number[][]
  ): Promise<void> {
    try {
      log('[semantic-search] 💾 Caching embeddings for URL:', url);
      log('[semantic-search] Using cache key:', EmbeddingCache.CACHE_KEY);

      const cache: CacheEntry = await this.storage.get(EmbeddingCache.CACHE_KEY) || {};

      const existingKeys = Object.keys(cache);
      log('[semantic-search] 📦 Cache currently has', existingKeys.length, 'URLs');

      const pageHash = this.generatePageHash(sentences);

      // Convert sentences to serializable format (remove DOM elements)
      const serializableSentences = sentences.map(s => this.toSerializable(s));

      cache[url] = {
        url,
        timestamp: Date.now(),
        sentences: serializableSentences,  // Store without DOM elements
        embeddings,
        pageHash
      };

      log('[semantic-search] 💾 Writing to storage with key:', EmbeddingCache.CACHE_KEY);
      log('[semantic-search] 💾 Serialized', sentences.length, 'sentences (removed DOM elements)');
      await this.storage.set(EmbeddingCache.CACHE_KEY, cache);
      debugger;

      // Verify write
      const verification = await this.storage.get(EmbeddingCache.CACHE_KEY);
      const verifyKeys = Object.keys(verification || {});
      log('[semantic-search] ✅ Successfully cached', embeddings.length, 'embeddings for', sentences.length, 'sentences (hash:', pageHash + ')');
      log('[semantic-search] ✅ Verification: Cache now has', verifyKeys.length, 'URLs');
      log('[semantic-search] ✅ URL is in cache?', verifyKeys.includes(url));

      if (!verifyKeys.includes(url)) {
        err('[semantic-search] ⚠️ WARNING: Verification failed! URL not found in cache after write');
      }
    } catch (error) {
      err('[semantic-search] ❌ Error caching embeddings:', error);
      throw error; // Re-throw to let caller know caching failed
    }
  }

  /**
   * Clear cached embeddings for a specific URL
   */
  async clearCachedEmbeddings(url: string): Promise<void> {
    try {
      const cache: CacheEntry = await this.storage.get(EmbeddingCache.CACHE_KEY) || {};

      delete cache[url];

      await this.storage.set(EmbeddingCache.CACHE_KEY, cache);

      log('[semantic-search] Cleared cached embeddings for URL:', url);
    } catch (error) {
      err('[semantic-search] Error clearing cached embeddings:', error);
    }
  }

  /**
   * Clear all cached embeddings
   */
  async clearAllCachedEmbeddings(): Promise<void> {
    try {
      await this.storage.remove(EmbeddingCache.CACHE_KEY);
      log('[semantic-search] Cleared all cached embeddings');
    } catch (error) {
      err('[semantic-search] Error clearing all cached embeddings:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalUrls: number;
    totalSentences: number;
    totalEmbeddings: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  }> {
    try {
      const cache: CacheEntry = await this.storage.get(EmbeddingCache.CACHE_KEY) || {};

      const urls = Object.keys(cache);
      let totalSentences = 0;
      let totalEmbeddings = 0;
      let oldestEntry: number | null = null;
      let newestEntry: number | null = null;

      for (const url of urls) {
        const entry = cache[url];
        totalSentences += entry.sentences.length;
        totalEmbeddings += entry.embeddings.length;

        if (oldestEntry === null || entry.timestamp < oldestEntry) {
          oldestEntry = entry.timestamp;
        }
        if (newestEntry === null || entry.timestamp > newestEntry) {
          newestEntry = entry.timestamp;
        }
      }

      return {
        totalUrls: urls.length,
        totalSentences,
        totalEmbeddings,
        oldestEntry,
        newestEntry
      };
    } catch (error) {
      err('Error getting cache stats:', error);
      return {
        totalUrls: 0,
        totalSentences: 0,
        totalEmbeddings: 0,
        oldestEntry: null,
        newestEntry: null
      };
    }
  }

  /**
   * Clean up expired cache entries
   */
  async cleanupExpiredEntries(): Promise<void> {
    try {
      const cache: CacheEntry = await this.storage.get(EmbeddingCache.CACHE_KEY) || {};

      const now = Date.now();
      let cleanedCount = 0;

      for (const url of Object.keys(cache)) {
        const entry = cache[url];
        const age = now - entry.timestamp;

        if (age >= EmbeddingCache.CACHE_DURATION) {
          delete cache[url];
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        await this.storage.set(EmbeddingCache.CACHE_KEY, cache);
        log('[semantic-search] Cleaned up', cleanedCount, 'expired cache entries');
      }
    } catch (error) {
      err('[semantic-search] Error cleaning up expired entries:', error);
    }
  }
}
