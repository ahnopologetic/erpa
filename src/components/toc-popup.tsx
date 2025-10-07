import { useEffect, useState } from "react"

export const TocPopup = () => {
    const [isOpen, setIsOpen] = useState(false)
    type TocItem = { title: string; anchor: string }
    const [toc, setToc] = useState<TocItem[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<unknown>(null)
    const [progress, setProgress] = useState<{ total: number; done: number }>({ total: 0, done: 0 })
    const [downloadProgress, setDownloadProgress] = useState<{ hidden: boolean; value: number; indeterminate: boolean }>({
        hidden: true,
        value: 0,
        indeterminate: false
    })
    const [notDownloaded, setNotDownloaded] = useState(true)

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

    const checkModelAvailability = async (): Promise<LanguageModelAvailability> => {
        if (!('LanguageModel' in self)) {
            err('Prompt API is not supported')
            return 'unavailable'
        }
        return await LanguageModel.availability()
    }

    const initializePromptSession = async (): Promise<LanguageModelSession | null> => {
        if (!('LanguageModel' in self)) {
            err('Prompt API is not supported')
            return null
        }

        // Reset progress UI
        setDownloadProgress({ hidden: true, value: 0, indeterminate: false })

        const availability = await LanguageModel.availability()
        log('Prompt API availability:', availability)
        if (availability === 'unavailable') {
            err('Prompt API is not available')
            return null
        }

        let modelNewlyDownloaded = false
        if (availability !== 'available') {
            modelNewlyDownloaded = true
            setDownloadProgress({ hidden: false, value: 0, indeterminate: false })
        }

        const createTimer = timeStart('Create LanguageModel session')
        const session = await LanguageModel.create({
            monitor(m) {
                m.addEventListener('downloadprogress', (e) => {
                    console.log(`Downloaded ${e.loaded * 100}%`);
                    setDownloadProgress(prev => ({ ...prev, value: e.loaded }))
                    if (modelNewlyDownloaded && e.loaded === 1) {
                        // Model downloaded, now extracting and loading into memory
                        setDownloadProgress(prev => ({ ...prev, indeterminate: true }))
                    }
                })
            }
        })
        timeEnd(createTimer)

        setDownloadProgress({ hidden: true, value: 0, indeterminate: false })
        setNotDownloaded(false)
        return session
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
            const session = await initializePromptSession()
            if (!session) {
                throw new Error('Prompt API is not supported')
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
                const schema = {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['title', 'anchor'],
                        properties: {
                            title: { type: 'string' },
                            anchor: { type: 'string' }
                        }
                    }
                }
                const system = [
                    'You extract navigable sections from web page text.',
                    'Return ONLY JSON, no markdown and no prose.',
                    'Each item must map to an existing heading provided separately.',
                    'The anchor must be a valid CSS selector for that heading.'
                ].join(' ')
                const headingsHint = '\n\nHeadings (title -> selector):\n' + headings.map(h => `- ${h.text} -> ${h.selector}`).join('\n')
                const prompt = `${system}\n\nChunk:\n${chunk}${headingsHint}`
                const part = await session.prompt(prompt, { responseConstraint: schema })
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
            const mergeTimer = timeStart('Merge + final prompt')
            const mergeSchema = {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['title', 'anchor'],
                    properties: {
                        title: { type: 'string' },
                        anchor: { type: 'string' }
                    }
                }
            }
            const mergeSystem = [
                'Merge and deduplicate extracted sections.',
                'Return ONLY JSON array of {title, anchor}.',
                'Ensure each anchor exists in the provided heading list.',
                'No duplicates; prefer higher-level headings when conflicts arise.'
            ].join(' ')
            const mergePrompt = `${mergeSystem}\n\nPartials (JSON arrays):\n${combined}`
            const data = await session.prompt(mergePrompt, { responseConstraint: mergeSchema })
            timeEnd(mergeTimer)

            log('Extraction complete')
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
                warn('Failed to parse JSON from model; falling back to headings')
            }

            if (!items.length) {
                const fallback = headings.slice(0, 20).map((h) => ({ title: h.text, anchor: h.selector }))
                items = fallback
            }

            setToc(items)
            setIsLoading(false)
        } catch (error) {
            setIsLoading(false)
            err('Extraction error', error)
            setError(error)
        }
    }

    useEffect(() => {
        const checkAvailability = async () => {
            const availability = await checkModelAvailability()
            if (availability === 'available') {
                setNotDownloaded(false)
                fetchToc()
            } else if (availability === 'unavailable') {
                setError(new Error('LanguageModel is not available on this device'))
            }
        }
        checkAvailability()
    }, [])

    if (notDownloaded) {
        return (
            <div className="text-sm text-gray-500 flex flex-col items-center justify-center h-full p-4">
                <h2 className="text-lg font-semibold mb-4">AI Model Required</h2>
                <p className="text-center mb-4">
                    The AI model needs to be downloaded before you can extract page sections.
                </p>

                {!downloadProgress.hidden && (
                    <div className="w-full max-w-xs mb-4">
                        <div className="flex justify-between text-xs mb-1">
                            <span>Downloading model...</span>
                            {!downloadProgress.indeterminate && (
                                <span>{Math.round(downloadProgress.value * 100)}%</span>
                            )}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all duration-300 ${downloadProgress.indeterminate
                                        ? 'bg-blue-500 animate-pulse w-full'
                                        : 'bg-blue-500'
                                    }`}
                                style={{
                                    width: downloadProgress.indeterminate
                                        ? '100%'
                                        : `${downloadProgress.value * 100}%`
                                }}
                            />
                        </div>
                        {downloadProgress.indeterminate && (
                            <p className="text-xs text-center mt-2">Extracting and loading model...</p>
                        )}
                    </div>
                )}

                <button
                    className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={async () => {
                        try {
                            const session = await initializePromptSession()
                            if (session) {
                                // Model is ready, start the extraction process
                                fetchToc()
                            }
                        } catch (error) {
                            err('Failed to initialize model:', error)
                            setError(error)
                        }
                    }}
                    disabled={!downloadProgress.hidden}
                >
                    {downloadProgress.hidden ? 'Download Model' : 'Downloading...'}
                </button>
            </div>
        )
    }

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