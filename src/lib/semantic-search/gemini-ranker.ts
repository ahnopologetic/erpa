import { log, err } from "~lib/log";
import type { SentenceSegment } from "./sentence-segmenter";

export interface RankingResult {
  answer: string;
  index: number;
  confidence: number;
}

export interface GeminiRankingOptions {
  maxCandidates?: number;
  fallbackToSimilarity?: boolean;
}

/**
 * Service for ranking sentence candidates using Gemini Nano Prompt API
 */
export class GeminiRanker {
  private static instance: GeminiRanker | null = null;
  private isAvailable = false;
  private availabilityChecked = false;

  private constructor() {}

  static getInstance(): GeminiRanker {
    if (!GeminiRanker.instance) {
      GeminiRanker.instance = new GeminiRanker();
    }
    return GeminiRanker.instance;
  }

  /**
   * Check if Gemini Nano is available
   */
  async checkAvailability(): Promise<boolean> {
    if (this.availabilityChecked) {
      return this.isAvailable;
    }

    try {
      // Check if the Chrome AI Prompt API is available
      if (typeof chrome !== 'undefined' && chrome.ai) {
        const available = await chrome.ai.isPromptApiAvailable();
        this.isAvailable = available;
        log('[semantic-search] Gemini Nano availability:', available);
      } else {
        this.isAvailable = false;
        log('[semantic-search] Chrome AI Prompt API not available');
      }
    } catch (error) {
      err('[semantic-search] Error checking Gemini Nano availability:', error);
      this.isAvailable = false;
    }

    this.availabilityChecked = true;
    return this.isAvailable;
  }

  /**
   * Rank sentence candidates using Gemini Nano
   */
  async rankCandidates(
    query: string,
    candidates: SentenceSegment[],
    options: GeminiRankingOptions = {}
  ): Promise<RankingResult | null> {
    const {
      maxCandidates = 10,
      fallbackToSimilarity = true
    } = options;

    // Limit candidates to avoid token limits
    const limitedCandidates = candidates.slice(0, maxCandidates);

    try {
      const isAvailable = await this.checkAvailability();
      
      if (!isAvailable) {
        if (fallbackToSimilarity) {
          log('[semantic-search] Gemini Nano not available, falling back to similarity ranking');
          return this.fallbackRanking(query, limitedCandidates);
        } else {
          throw new Error('Gemini Nano not available and fallback disabled');
        }
      }

      log('[semantic-search] Ranking', limitedCandidates.length, 'candidates with Gemini Nano');

      // Create language model session
      const session = await chrome.ai.create({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });

      // Build the prompt
      const systemPrompt = {
        role: "system",
        content: "You are a helpful assistant that finds the most relevant sentence to answer a user's question. " +
                "Given a list of candidate sentences, return the index of the best matching sentence as JSON. " +
                "Consider semantic meaning, not just keyword matching. " +
                "Provide a brief answer explaining why this sentence is relevant."
      };

      const userPrompt = {
        role: "user",
        content: `Question: ${query}\n\nCandidates:\n${limitedCandidates
          .map((candidate, i) => `${i}: ${candidate.text}`)
          .join("\n")}\n\nReturn JSON with: {"answer": "brief explanation", "index": number, "confidence": 0.0-1.0}`
      };

      // Define response schema
      const responseSchema = {
        type: "object",
        properties: {
          answer: { 
            type: "string", 
            description: "Brief explanation of why this sentence is relevant" 
          },
          index: { 
            type: "integer", 
            description: "Index of the best matching sentence (0-based)" 
          },
          confidence: { 
            type: "number", 
            description: "Confidence score between 0.0 and 1.0" 
          }
        },
        required: ["answer", "index"]
      };

      // Get response from Gemini Nano
      const result = await session.prompt([systemPrompt, userPrompt], {
        responseConstraint: responseSchema
      });

      // Parse the JSON response
      const parsed = JSON.parse(result) as RankingResult;
      
      // Validate the response
      if (typeof parsed.index !== 'number' || 
          parsed.index < 0 || 
          parsed.index >= limitedCandidates.length) {
        throw new Error(`Invalid index returned: ${parsed.index}`);
      }

      // Ensure confidence is a number between 0 and 1
      if (typeof parsed.confidence !== 'number') {
        parsed.confidence = 0.5; // Default confidence
      } else {
        parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));
      }

      log('[semantic-search] Gemini Nano ranking result:', parsed);
      return parsed;

    } catch (error) {
      err('[semantic-search] Error ranking candidates with Gemini Nano:', error);
      
      if (fallbackToSimilarity) {
        log('[semantic-search] Falling back to similarity ranking');
        return this.fallbackRanking(query, limitedCandidates);
      } else {
        throw error;
      }
    }
  }

  /**
   * Fallback ranking using simple keyword matching
   */
  private fallbackRanking(
    query: string,
    candidates: SentenceSegment[]
  ): RankingResult {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    let bestIndex = 0;
    let bestScore = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const candidateWords = candidate.text.toLowerCase().split(/\s+/);
      
      // Count word matches
      let matches = 0;
      for (const queryWord of queryWords) {
        if (candidateWords.some(word => word.includes(queryWord) || queryWord.includes(word))) {
          matches++;
        }
      }
      
      // Calculate score (normalized by query length)
      const score = matches / queryWords.length;
      
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return {
      answer: `Found ${Math.round(bestScore * 100)}% keyword match`,
      index: bestIndex,
      confidence: bestScore
    };
  }

  /**
   * Check if the ranker is ready to use
   */
  async isReady(): Promise<boolean> {
    return await this.checkAvailability();
  }

  /**
   * Reset the availability check (useful for testing)
   */
  reset(): void {
    this.availabilityChecked = false;
    this.isAvailable = false;
  }
}
