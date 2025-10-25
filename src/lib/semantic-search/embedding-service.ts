import { log, err } from "~lib/log";

export interface EmbeddingResponse {
  success: boolean;
  embedding?: number[];
  error?: string;
}

export interface BatchEmbeddingResponse {
  success: boolean;
  embeddings?: number[][];
  error?: string;
}

/**
 * Service for communicating with background worker to generate embeddings
 */
export class EmbeddingService {
  private static instance: EmbeddingService | null = null;
  private isModelLoaded = false;
  private loadingPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  /**
   * Ensure the embedding model is loaded in the background worker
   */
  private async ensureModelLoaded(): Promise<void> {
    if (this.isModelLoaded) return;
    
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.loadModel();
    await this.loadingPromise;
    this.loadingPromise = null;
  }

  private async loadModel(): Promise<void> {
    try {
      log('[semantic-search] Loading embedding model in background worker...');
      
      const response = await chrome.runtime.sendMessage({
        type: 'LOAD_EMBEDDING_MODEL'
      });

      if (response?.success) {
        this.isModelLoaded = true;
        log('[semantic-search] Embedding model loaded successfully');
      } else {
        throw new Error(response?.error || 'Failed to load embedding model');
      }
    } catch (error) {
      err('[semantic-search] Failed to load embedding model:', error);
      throw error;
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    await this.ensureModelLoaded();

    try {
      log('[semantic-search] Generating embedding for text:', text.substring(0, 100) + '...');
      
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_EMBEDDING',
        text: text.trim()
      }) as EmbeddingResponse;

      if (response.success && response.embedding) {
        log('[semantic-search] Embedding generated successfully, dimension:', response.embedding.length);
        return response.embedding;
      } else {
        throw new Error(response.error || 'Failed to generate embedding');
      }
    } catch (error) {
      err('[semantic-search] Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    await this.ensureModelLoaded();

    try {
      log('[semantic-search] Generating batch embeddings for', texts.length, 'texts');
      
      const response = await chrome.runtime.sendMessage({
        type: 'BATCH_GENERATE_EMBEDDINGS',
        texts: texts.map(t => t.trim())
      }) as BatchEmbeddingResponse;

      if (response.success && response.embeddings) {
        log('[semantic-search] Batch embeddings generated successfully');
        return response.embeddings;
      } else {
        throw new Error(response.error || 'Failed to generate batch embeddings');
      }
    } catch (error) {
      err('[semantic-search] Error generating batch embeddings:', error);
      throw error;
    }
  }

  /**
   * Compute cosine similarity between two embeddings
   */
  computeSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Find top-k most similar embeddings
   */
  findTopSimilar(
    queryEmbedding: number[],
    candidateEmbeddings: number[][],
    k: number = 10
  ): Array<{ index: number; similarity: number }> {
    const similarities = candidateEmbeddings.map((embedding, index) => ({
      index,
      similarity: this.computeSimilarity(queryEmbedding, embedding)
    }));

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.isModelLoaded;
  }

  /**
   * Reset the service state (useful for testing or error recovery)
   */
  reset(): void {
    this.isModelLoaded = false;
    this.loadingPromise = null;
  }
}
