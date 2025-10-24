import { log, err } from "~lib/log";
import type { SentenceSegment } from "./sentence-segmenter";
import { z } from "zod";
import {
    PromptClient,
    checkPromptAPIAvailability,
    promptWithStructure,
    type SessionManager
} from "@ahnopologetic/use-prompt-api";

export interface RankingResult {
    answer: string;
    index: number;
    confidence: number;
}

export interface GeminiRankingOptions {
    maxCandidates?: number;
    fallbackToSimilarity?: boolean;
}

// Zod schema for ranking result
const rankingResultSchema = z.object({
    answer: z.string().describe("Brief explanation of why this sentence is relevant"),
    index: z.number().int().describe("Index of the best matching sentence (0-based)"),
    confidence: z.number().min(0).max(1).default(0.5).describe("Confidence score between 0.0 and 1.0"),
});

/**
 * Service for ranking sentence candidates using Gemini Nano Prompt API
 */
export class GeminiRanker {
    private static instance: GeminiRanker | null = null;
    private client: PromptClient;
    private session: SessionManager | null = null;
    private isAvailable = false;
    private availabilityChecked = false;

    private constructor() {
        this.client = new PromptClient();
    }

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
            const status = await checkPromptAPIAvailability();
            this.isAvailable = status === 'available';
            log('[semantic-search] Gemini Nano availability:', status);
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

            // Initialize session if not already created
            if (!this.session) {
                await this.client.initialize();
                this.session = await this.client.createSession({
                    systemPrompt: "You are a helpful assistant that finds the most relevant sentence to answer a user's question. " +
                        "Given a list of candidate sentences, identify the best matching sentence based on semantic meaning, not just keyword matching.",
                    temperature: 0.3, // Lower temperature for more focused ranking
                    topK: 3,
                });
            }

            // Build the user prompt with candidates
            const userPrompt = `Question: ${query}

Candidates:
${limitedCandidates.map((candidate, i) => `${i}: ${candidate.text}`).join("\n")}

Select the index of the most relevant sentence that best answers the question. Provide a brief explanation of why this sentence is relevant, and a confidence score between 0.0 and 1.0.`;

            // Use structured output with Zod schema
            const result = await promptWithStructure(
                this.session,
                userPrompt,
                {
                    schema: rankingResultSchema,
                    maxRetries: 2
                }
            );

            // Validate the index is within range
            if (result.index < 0 || result.index >= limitedCandidates.length) {
                throw new Error(`Invalid index returned: ${result.index}`);
            }

            log('[semantic-search] Gemini Nano ranking result:', result);
            return result;

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
     * Reset the availability check and destroy session (useful for testing)
     */
    reset(): void {
        this.availabilityChecked = false;
        this.isAvailable = false;

        if (this.session) {
            this.session.destroy();
            this.session = null;
        }
    }
}
