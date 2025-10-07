// Type definitions for the Chrome built-in Summarizer API
// Reference: https://developer.chrome.com/docs/ai/summarizer-api

declare global {
    type SummarizerAvailability = "available" | "unavailable" | "downloadable"

    interface SummarizerCreateOptions {
        sharedContext?: string
        type?: "key-points" | "tldr" | "teaser" | "headline"
        format?: "markdown" | "plain-text"
        length?: "short" | "medium" | "long"
        monitor?: (monitor: SummarizerDownloadMonitor) => void
        expectedInputLanguages?: string[]
        outputLanguage?: string
    }

    interface SummarizerContextOptions {
        context?: string
    }

    interface SummarizerDownloadProgressEvent extends Event {
        /** Fraction [0, 1] of model download completed */
        loaded: number
    }

    interface SummarizerDownloadMonitor extends EventTarget {
        addEventListener(
            type: "downloadprogress",
            listener: (e: SummarizerDownloadProgressEvent) => void,
            options?: boolean | AddEventListenerOptions
        ): void
    }

    interface SummarizerInstance {
        summarize(input: string, options?: SummarizerContextOptions): Promise<string>
        summarizeStreaming(
            input: string,
            options?: SummarizerContextOptions
        ): AsyncIterable<string>
    }

    interface SummarizerStatic {
        availability(): Promise<SummarizerAvailability>
        create(options?: SummarizerCreateOptions): Promise<SummarizerInstance>
    }

    var Summarizer: SummarizerStatic

    interface Window {
        Summarizer: SummarizerStatic
    }

    interface WorkerGlobalScope {
        Summarizer: SummarizerStatic
    }
}

export { }


