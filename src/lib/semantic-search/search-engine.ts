import { log, err } from "~lib/log";
import { EmbeddingService } from "./embedding-service";
import { EmbeddingCache } from "./cache";
import { GeminiRanker } from "./gemini-ranker";
import { segmentPageIntoSentences, filterMeaningfulSegments, type SentenceSegment } from "./sentence-segmenter";

export interface SearchResult {
  sentence: SentenceSegment;
  index: number;
  score: number;
  element: HTMLElement;
  selector: string;
  answer?: string;
  confidence?: number;
}

export interface SearchOptions {
  maxCandidates?: number;
  useGeminiRanking?: boolean;
  autoPlayFirst?: boolean;
}

/**
 * Main semantic search engine orchestrator
 */
export class SemanticSearchEngine {
  private static instance: SemanticSearchEngine | null = null;
  private embeddingService: EmbeddingService;
  private cache: EmbeddingCache;
  private ranker: GeminiRanker;
  private isInitialized = false;

  private constructor() {
    this.embeddingService = EmbeddingService.getInstance();
    this.cache = new EmbeddingCache();
    this.ranker = GeminiRanker.getInstance();
  }

  static getInstance(): SemanticSearchEngine {
    if (!SemanticSearchEngine.instance) {
      SemanticSearchEngine.instance = new SemanticSearchEngine();
    }
    return SemanticSearchEngine.instance;
  }

  /**
   * Initialize the search engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      log('[semantic-search] Initializing semantic search engine...');
      
      // Note: Cache cleanup is handled by the background service worker
      // to avoid storage access issues in content scripts
      
      this.isInitialized = true;
      log('[semantic-search] Semantic search engine initialized');
    } catch (error) {
      err('[semantic-search] Failed to initialize semantic search engine:', error);
      throw error;
    }
  }

  /**
   * Perform semantic search on the current page
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      maxCandidates = 10,
      useGeminiRanking = true,
      autoPlayFirst = false
    } = options;

    try {
      log('[semantic-search] Starting semantic search for query:', query);

      // Initialize if needed
      await this.initialize();

      // Get current page URL
      const url = window.location.href;
      
      // Segment page into sentences
      const allSegments = segmentPageIntoSentences();
      const segments = filterMeaningfulSegments(allSegments);
      
      if (segments.length === 0) {
        log('[semantic-search] No meaningful sentences found on page');
        return [];
      }

      log('[semantic-search] Found', segments.length, 'meaningful sentences');

      // Check cache for existing embeddings
      let cachedEmbeddings = await this.cache.getCachedEmbeddings(url, segments);
      let sentenceEmbeddings: number[][];

      if (cachedEmbeddings) {
        sentenceEmbeddings = cachedEmbeddings.embeddings;
        log('[semantic-search] Using cached embeddings');
      } else {
        // Generate embeddings for all sentences
        log('[semantic-search] Generating embeddings for', segments.length, 'sentences');
        const texts = segments.map(s => s.text);
        sentenceEmbeddings = await this.embeddingService.generateBatchEmbeddings(texts);
        
        // Cache the embeddings
        await this.cache.cacheEmbeddings(url, segments, sentenceEmbeddings);
        log('[semantic-search] Cached new embeddings');
      }

      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      // Find top candidates by similarity
      const topSimilar = this.embeddingService.findTopSimilar(
        queryEmbedding,
        sentenceEmbeddings,
        maxCandidates
      );

      log('[semantic-search] Found', topSimilar.length, 'candidate sentences');

      if (topSimilar.length === 0) {
        return [];
      }

      // Get the actual sentence segments for top candidates
      const candidateSegments = topSimilar.map(({ index: similarityIndex }) => {
        const originalIndex = segments.findIndex(s => s.index === similarityIndex);
        return segments[originalIndex];
      }).filter(Boolean);

      let results: SearchResult[];

      if (useGeminiRanking) {
        // Use Gemini Nano to rank candidates
        const rankingResult = await this.ranker.rankCandidates(query, candidateSegments);
        
        if (rankingResult) {
          const bestSegment = candidateSegments[rankingResult.index];
          results = [{
            sentence: bestSegment,
            index: rankingResult.index,
            score: rankingResult.confidence,
            element: bestSegment.element,
            selector: bestSegment.selector,
            answer: rankingResult.answer,
            confidence: rankingResult.confidence
          }];
          
          log('[semantic-search] Gemini Nano selected best match:', rankingResult);
        } else {
          // Fallback to similarity ranking
          results = this.createSimilarityResults(topSimilar, candidateSegments);
        }
      } else {
        // Use pure similarity ranking
        results = this.createSimilarityResults(topSimilar, candidateSegments);
      }

      log('[semantic-search] Search completed, found', results.length, 'results');
      return results;

    } catch (error) {
      err('[semantic-search] Error during semantic search:', error);
      throw error;
    }
  }

  /**
   * Create search results from similarity scores
   */
  private createSimilarityResults(
    topSimilar: Array<{ index: number; similarity: number }>,
    candidateSegments: SentenceSegment[]
  ): SearchResult[] {
    return topSimilar.map(({ index, similarity }) => {
      const segment = candidateSegments[index];
      return {
        sentence: segment,
        index,
        score: similarity,
        element: segment.element,
        selector: segment.selector,
        confidence: similarity
      };
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return await this.cache.getCacheStats();
  }

  /**
   * Clear all cached embeddings
   */
  async clearCache(): Promise<void> {
    try {
      // Send message to background worker to clear cache
      const response = await chrome.runtime.sendMessage({
        type: 'CLEANUP_CACHE'
      });
      
      if (response?.success) {
        log('[semantic-search] Cache cleared successfully');
      } else {
        throw new Error(response?.error || 'Failed to clear cache');
      }
    } catch (error) {
      err('[semantic-search] Error clearing cache:', error);
      throw error;
    }
  }

  /**
   * Check if the search engine is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.embeddingService.isReady();
  }

  /**
   * Reset the search engine (useful for testing)
   */
  reset(): void {
    this.isInitialized = false;
    this.embeddingService.reset();
    this.ranker.reset();
  }
}
