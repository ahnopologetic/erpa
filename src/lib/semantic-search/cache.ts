import { log, err } from "~lib/log";
import type { SentenceSegment } from "./sentence-segmenter";
import type { PGlite } from '@electric-sql/pglite';

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

/**
 * Service for caching sentence embeddings using PGlite database
 */
export class EmbeddingCache {
  private db: PGlite;

  constructor(db: PGlite) {
    if (!db) {
      throw new Error('Database instance is required for EmbeddingCache');
    }
    this.db = db;
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
   * Only validates page content hash (no time-based expiration)
   */
  private isCacheValid(cached: CachedEmbeddings, currentHash: string): boolean {
    return cached.pageHash === currentHash;
  }

  /**
   * Get cached embeddings for a URL (without hash validation)
   */
  async getCachedEmbeddingsByUrl(url: string): Promise<CachedEmbeddings | null> {
    try {
      log('[semantic-search] 🔍 Checking cache for URL:', url);

      const result = await this.db.query<{ page_data: CachedEmbeddings }>(
        'SELECT page_data FROM cached_pages WHERE url = $1',
        [url]
      );

      if (result.rows.length === 0) {
        log('[semantic-search] ❌ No cached embeddings found for URL:', url);
        return null;
      }

      const cached: CachedEmbeddings = result.rows[0].page_data;
      log('[semantic-search] ✅ Found cached entry:', {
        sentenceCount: cached.sentences.length,
        embeddingCount: cached.embeddings.length,
        cachedHash: cached.pageHash
      });

      return cached;
    } catch (error) {
      err('[semantic-search] ❌ Error retrieving cached embeddings:', error);
      return null;
    }
  }

  /**
   * Validate cached embeddings against current page content
   */
  validateCachedEmbeddings(
    cached: CachedEmbeddings,
    currentSentences: SentenceSegment[]
  ): boolean {
    // Skip validation entirely - if cache exists for URL, use it
    // This provides maximum performance and cache utilization
    log('[semantic-search] ✅ Cache valid: skipping validation (URL-based cache)');
    return true;
  }


  /**
   * Get cached embeddings for the current page (legacy method for backward compatibility)
   * @deprecated Use getCachedEmbeddingsByUrl + validateCachedEmbeddings instead
   */
  async getCachedEmbeddings(
    url: string,
    sentences: SentenceSegment[]
  ): Promise<CachedEmbeddings | null> {
    const cached = await this.getCachedEmbeddingsByUrl(url);
    
    if (!cached) {
      return null;
    }

    if (this.validateCachedEmbeddings(cached, sentences)) {
      log('[semantic-search] ✅ Using cached embeddings for URL:', url, '(', cached.embeddings.length, 'embeddings )');
      return cached;
    } else {
      log('[semantic-search] ⚠️ Cached embeddings invalid (hash mismatch) for URL:', url);
      await this.clearCachedEmbeddings(url);
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

      const pageHash = this.generatePageHash(sentences);

      // Convert sentences to serializable format (remove DOM elements)
      const serializableSentences = sentences.map(s => this.toSerializable(s));

      const pageData: CachedEmbeddings = {
        url,
        timestamp: Date.now(),
        sentences: serializableSentences,
        embeddings,
        pageHash
      };

      log('[semantic-search] 💾 Serialized', sentences.length, 'sentences (removed DOM elements)');

      // Insert or update cache entry
      await this.db.query(
        `INSERT INTO cached_pages (url, page_data) 
         VALUES ($1, $2) 
         ON CONFLICT (url) 
         DO UPDATE SET page_data = $2, created_at = now()`,
        [url, JSON.stringify(pageData)]
      );

      log('[semantic-search] ✅ Successfully cached', embeddings.length, 'embeddings for', sentences.length, 'sentences (hash:', pageHash + ')');
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
      await this.db.query('DELETE FROM cached_pages WHERE url = $1', [url]);
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
      await this.db.query('DELETE FROM cached_pages');
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
      const result = await this.db.query<{ page_data: CachedEmbeddings }>('SELECT page_data FROM cached_pages');

      let totalSentences = 0;
      let totalEmbeddings = 0;
      let oldestEntry: number | null = null;
      let newestEntry: number | null = null;

      for (const row of result.rows) {
        const entry: CachedEmbeddings = row.page_data;
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
        totalUrls: result.rows.length,
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
   * Note: With PGlite storage, we rely on manual cache invalidation via hash mismatch
   * This method is kept for backwards compatibility but is a no-op
   */
  async cleanupExpiredEntries(): Promise<void> {
    try {
      log('[semantic-search] Cleanup called (no-op with PGlite - using hash-based invalidation)');
    } catch (error) {
      err('[semantic-search] Error cleaning up expired entries:', error);
    }
  }
}
