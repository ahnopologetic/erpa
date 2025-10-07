import { useEffect, useState } from "react"

export const TocPopup = () => {
    const [isOpen, setIsOpen] = useState(false)
    type TocItem = { title: string; anchor: string }
    const [toc, setToc] = useState<TocItem[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<unknown>(null)
    const [progress, setProgress] = useState<{ total: number; done: number }>({ total: 0, done: 0 })

    // --- logging helpers ---
    const LOG_PREFIX = '[Erpa]'
    const isVerbose = process.env.NODE_ENV !== 'production'
    const log = (...args: unknown[]) => {
        if (isVerbose) console.log(LOG_PREFIX, ...args)
    }
    const warn = (...args: unknown[]) => console.warn(LOG_PREFIX, ...args)
    const err = (...args: unknown[]) => console.error(LOG_PREFIX, ...args)
    const timeStart = (label: string) => ({ label, start: performance.now() })
    const timeEnd = (t: { label: string; start: number }) => {
        log(`${t.label} in ${(performance.now() - t.start).toFixed(0)} ms`)
    }

    const initializeSummarizer = async (): Promise<SummarizerInstance | null> => {
        if (!('Summarizer' in self)) {
            err('Summarizer API is not supported')
            return null
        }

        const instance = Summarizer
        const options: SummarizerCreateOptions = {
            sharedContext: "You're a helpful assistant that can summarize the content of a page for visually impaired users",
            type: 'key-points',
            format: 'plain-text',
            length: 'medium',
            expectedInputLanguages: ['en'],
            outputLanguage: 'en',
            monitor(m) {
                m.addEventListener('downloadprogress', (e) => {
                    console.log(`Downloaded ${e.loaded * 100}%`);
                });
            }
        };

        const availability = await instance.availability();
        log('Summarizer availability:', availability)
        if (availability === 'unavailable') {
            err('Summarizer API is not available')
            return null
        }

        // Check for user activation before creating the summarizer
        const createTimer = timeStart('Create summarizer')
        const summarizer = await instance.create(options);
        timeEnd(createTimer)
        return summarizer;
    }

    const getActiveTabId = async (): Promise<number | null> => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const tab = tabs?.[0]
        return tab?.id ?? null
    }

    const fetchPageMainText = async (): Promise<{ text: string; headings: { text: string; selector: string }[] }> => {
        const tabId = await getActiveTabId()
        if (tabId == null) {
            throw new Error('No active tab')
        }
        const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_MAIN_CONTENT' })
        if (!response?.ok) {
            throw new Error(response?.error || 'Failed to retrieve main content')
        }
        return { text: response.text as string, headings: (response.headings || []) as { text: string; selector: string }[] }
    }

    const fetchToc = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const summarizer = await initializeSummarizer()
            if (!summarizer) {
                throw new Error('Summarizer API is not supported')
            }
            const fetchTimer = timeStart('Fetch main text + headings')
            const { text: mainText, headings } = await fetchPageMainText()
            timeEnd(fetchTimer)
            log('Starting summarization (chunked)')
            setIsLoading(true)

            const paragraphs = mainText
                .split(/\n\s*\n/g)
                .map((p) => p.trim())
                .filter((p) => p.length > 50)

            const MAX_CHARS = 4000
            const chunks: string[] = []
            let current = ""

            const flushCurrent = () => {
                if (current && current.trim().length) {
                    chunks.push(current.trim())
                }
                current = ""
            }

            for (const p of paragraphs) {
                if (p.length > MAX_CHARS) {
                    if (current) flushCurrent()
                    for (let i = 0; i < p.length; i += MAX_CHARS) {
                        const piece = p.slice(i, i + MAX_CHARS).trim()
                        if (piece.length) {
                            chunks.push(piece)
                            log(`Split oversized paragraph into piece ${(i / MAX_CHARS) + 1} (${piece.length} chars)`)
                        }
                    }
                    continue
                }

                if (!current) {
                    current = p
                    continue
                }

                if (current.length + 2 + p.length <= MAX_CHARS) {
                    current = current + "\n\n" + p
                } else {
                    flushCurrent()
                    current = p
                }
            }
            flushCurrent()
            log('Paragraphs:', paragraphs.length, '| Chunks:', chunks.length)
            setProgress({ total: chunks.length, done: 0 })
            if (isVerbose) {
                log('Chunk sizes (chars):', chunks.map((c) => c.length))
            }

            const partialSummaries: string[] = []
            const sumTimer = timeStart('Summarize chunks')
            for (let i = 0; i < chunks.length; i++) {
                let chunk = chunks[i]
                if (chunk.length > MAX_CHARS) {
                    log(`Hard-capping oversized chunk ${i + 1} from ${chunk.length} to ${MAX_CHARS} chars`)
                    chunk = chunk.slice(0, MAX_CHARS)
                }
                log(`Summarizing chunk ${i + 1}/${chunks.length} (${chunk.length} chars) ...`)
                const part = await summarizer.summarize(chunk, {
                    context: 'You are extracting navigable sections. Always include css selectors for the sections in the page.'
                })
                partialSummaries.push(part)
                log(`Chunk ${i + 1} summarized (${part.length} chars)`)
                setProgress((p) => ({ total: p.total, done: Math.min(p.total, p.done + 1) }))
            }
            timeEnd(sumTimer)

            let combined = partialSummaries.join("\n\n")
            if (combined.length > MAX_CHARS) {
                log(`Hard-capping combined summary input from ${combined.length} to ${MAX_CHARS} chars`)
                combined = combined.slice(0, MAX_CHARS)
            }
            const mergeTimer = timeStart('Merge + final summarize')
            const data = await summarizer.summarize(combined, {
                context: 'You are merging partial extractions. Output MUST be a JSON array of unique objects with keys: title (string), anchor (CSS selector string). Use only titles/anchors that correspond to the provided headings list. Remove duplicates and ensure anchors are valid. No markdown, no commentary.'
            })
            timeEnd(mergeTimer)

            log('Summarization complete')
            if (!data) {
                setIsLoading(false)
                setError(new Error('Summarization failed'))
                return
            }
            if (isVerbose) log('Final summary length (chars):', data.length)
            log('Final summary:', { data })

            let items: TocItem[] = []
            try {
                const parsed = JSON.parse(data) as Array<{ title?: string; anchor?: string }>
                if (Array.isArray(parsed)) {
                    items = parsed
                        .filter((x) => typeof x?.title === 'string' && typeof x?.anchor === 'string')
                        .map((x) => ({ title: x.title as string, anchor: x.anchor as string }))
                }
            } catch (_) {
                warn('Failed to parse JSON from summarizer; falling back to headings')
            }

            if (!items.length) {
                const fallback = headings.slice(0, 20).map((h) => ({ title: h.text, anchor: h.selector }))
                items = fallback
            }

            setToc(items)
            setIsLoading(false)
        } catch (error) {
            setIsLoading(false)
            err('Summarization error', error)
            setError(error)
        }
    }

    useEffect(() => {
        fetchToc()
    }, [])

    if (isLoading) {
        return <div className="text-sm text-gray-500">
            <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-500 rounded-full animate-pulse" />
                <span className="text-xs text-gray-300 font-medium">Loading... {progress.done}/{progress.total}</span>
            </div>
        </div>
    }
    if (error) {
        return <div>Error: {error instanceof Error ? error.message : 'Unknown error'}</div>
    }

    return (
        <div>
            <h1>Toc Popup</h1>
        </div>
    )
}