// Type definitions for Chrome LanguageModel (Prompt API)
// Reference: https://developer.chrome.com/docs/ai/prompt-api

declare global {
  type LanguageModelAvailability = "available" | "unavailable" | "downloadable" | "downloading"

  interface LanguageModelParams {
    defaultTemperature: number
    maxTemperature: number
    defaultTopK: number
    maxTopK: number
  }

  interface PromptOptions {
    signal?: AbortSignal
    responseConstraint?: any
    omitResponseConstraintInput?: boolean
  }

  interface LanguageModelSession {
    prompt(input: string, options?: PromptOptions): Promise<string>
    promptStreaming(input: string, options?: PromptOptions): ReadableStream<string>
    destroy(): void
    clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>
    readonly inputUsage?: number
    readonly inputQuota?: number
  }

  interface LanguageModelStatic {
    availability(options?: any): Promise<LanguageModelAvailability>
    create(options?: any): Promise<LanguageModelSession>
    params(): Promise<LanguageModelParams>
  }

  var LanguageModel: LanguageModelStatic

  interface Window {
    LanguageModel: LanguageModelStatic
  }
}

export {}


