import { Storage } from "@plasmohq/storage";
import { log, err } from "~lib/log";
import type { SentenceSegment } from "./sentence-segmenter";

export interface CachedEmbeddings {
  url: string;
  timestamp: number;
  sentences: SentenceSegment[];
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
    // Use session storage for temporary caching
    this.storage = new Storage({
      area: "session"
    });
  }

  /**
   * Generate a simple hash of the page content for cache invalidation
   */
  private generatePageHash(sentences: SentenceSegment[]): string {
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
      const cache: CacheEntry = await this.storage.get(EmbeddingCache.CACHE_KEY) || {};
      
      const cached = cache[url];
      if (!cached) {
        log('[semantic-search] No cached embeddings found for URL:', url);
        return null;
      }

      const currentHash = this.generatePageHash(sentences);
      
      if (this.isCacheValid(cached, currentHash)) {
        log('[semantic-search] Using cached embeddings for URL:', url);
        return cached;
      } else {
        log('[semantic-search] Cached embeddings expired or invalid for URL:', url);
        await this.clearCachedEmbeddings(url);
        return null;
      }
    } catch (error) {
      err('[semantic-search] Error retrieving cached embeddings:', error);
      return null;
    }
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
      const cache: CacheEntry = await this.storage.get(EmbeddingCache.CACHE_KEY) || {};
      
      const pageHash = this.generatePageHash(sentences);
      
      cache[url] = {
        url,
        timestamp: Date.now(),
        sentences,
        embeddings,
        pageHash
      };

      await this.storage.set(EmbeddingCache.CACHE_KEY, cache);

      log('[semantic-search] Cached embeddings for URL:', url, 'sentences:', sentences.length);
    } catch (error) {
      err('[semantic-search] Error caching embeddings:', error);
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
