import { TableOfContents, TableOfContentsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

export const TocPopup = () => {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    type TocItem = { title: string; cssSelector: string }
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
    const [useChunked, setUseChunked] = useState(false) // Toggle between chunked and single call

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

    const extractWithChunked = async (session: LanguageModelSession, mainText: string, headings: { text: string; selector: string }[]): Promise<TocItem[]> => {
        log('Starting extraction (chunked)')
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
        const sumTimer = timeStart('Extract chunks')
        for (let i = 0; i < chunks.length; i++) {
            let chunk = chunks[i]
            if (chunk.length > MAX_CHARS) {
                log(`Hard-capping oversized chunk ${i + 1} from ${chunk.length} to ${MAX_CHARS} chars`)
                chunk = chunk.slice(0, MAX_CHARS)
            }
            log(`Extracting chunk ${i + 1}/${chunks.length} (${chunk.length} chars) ...`)
            const schema = {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['title', 'cssSelector'],
                    properties: {
                        title: { type: 'string' },
                        cssSelector: { type: 'string' }
                    }
                }
            }
            const system = [
                'You extract navigable sections from web page text.',
                'Return ONLY JSON, no markdown and no prose.',
                'Each item must map to an existing heading provided separately.',
                'The cssSelector must be a valid CSS selector for that heading.'
            ].join(' ')
            const headingsHint = '\n\nHeadings (title -> selector):\n' + headings.map(h => `- ${h.text} -> ${h.selector}`).join('\n')
            const prompt = `${system}\n\nChunk:\n${chunk}${headingsHint}`
            const part = await session.prompt(prompt, { responseConstraint: schema })
            partialSummaries.push(part)
            log(`Chunk ${i + 1} extracted (${part.length} chars)`)
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
                required: ['title', 'cssSelector'],
                properties: {
                    title: { type: 'string' },
                    cssSelector: { type: 'string' }
                }
            }
        }
        const mergeSystem = [
            'Merge and deduplicate extracted sections.',
            'Return ONLY JSON array of {title, cssSelector}.',
            'Ensure each cssSelector exists in the provided heading list.',
            'No duplicates; prefer higher-level headings when conflicts arise.'
        ].join(' ')
        const mergePrompt = `${mergeSystem}\n\nPartials (JSON arrays):\n${combined}`
        const data = await session.prompt(mergePrompt, { responseConstraint: mergeSchema })
        timeEnd(mergeTimer)

        return parseExtractionResult(data, headings)
    }

    const extractWithSingleCall = async (session: LanguageModelSession, mainText: string, headings: { text: string; selector: string }[]): Promise<TocItem[]> => {
        log('Starting extraction (single call)')
        setIsLoading(true)
        setProgress({ total: 1, done: 0 })

        const MAX_CHARS = 4000
        let textToProcess = mainText
        if (textToProcess.length > MAX_CHARS) {
            log(`Truncating text from ${textToProcess.length} to ${MAX_CHARS} chars`)
            textToProcess = textToProcess.slice(0, MAX_CHARS)
        }

        const schema = {
            type: 'array',
            items: {
                type: 'object',
                required: ['title', 'cssSelector'],
                properties: {
                    title: { type: 'string' },
                    cssSelector: { type: 'string' }
                }
            }
        }

        const system = [
            'You extract navigable sections from web page text.',
            'Return ONLY JSON array of {title, cssSelector}.',
            'Each item must map to an existing heading provided separately.',
            'The cssSelector must be a valid CSS selector for that heading.',
            'Focus on the most important sections and headings.'
        ].join(' ')

        const headingsHint = '\n\nAvailable headings (title -> cssSelector):\n' + headings.map(h => `- ${h.text} -> ${h.selector}`).join('\n')
        const prompt = `${system}\n\nPage content:\n${textToProcess}${headingsHint}`

        const extractTimer = timeStart('Single call extraction')
        const data = await session.prompt(prompt, { responseConstraint: schema })
        timeEnd(extractTimer)
        setProgress({ total: 1, done: 1 })

        return parseExtractionResult(data, headings)
    }

    const parseExtractionResult = (data: string, headings: { text: string; selector: string }[]): TocItem[] => {
        log('Extraction complete')
        if (!data) {
            throw new Error('Extraction failed - no data returned')
        }
        if (isVerbose) log('Final result length (chars):', data.length)
        log('Final result:', { data })

        let items: TocItem[] = []
        try {
            const parsed = JSON.parse(data) as Array<{ title?: string; cssSelector?: string }>
            if (Array.isArray(parsed)) {
                items = parsed
                    .filter((x) => typeof x?.title === 'string' && typeof x?.cssSelector === 'string')
                    .map((x) => ({ title: x.title as string, cssSelector: x.cssSelector as string }))
            }
        } catch (_) {
            warn('Failed to parse JSON from model; falling back to headings')
        }

        if (!items.length) {
            const fallback = headings.slice(0, 20).map((h) => ({ title: h.text, cssSelector: h.selector }))
            items = fallback
        }

        return items
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

            const items = useChunked
                ? await extractWithChunked(session, mainText, headings)
                : await extractWithSingleCall(session, mainText, headings)

            setToc(items)
            setIsLoading(false)
        } catch (error) {
            setIsLoading(false)
            err('Extraction error', error)
            setError(error)
        }
    }

    const navigateToSection = async (cssSelector: string) => {
        try {
            const tabId = await getActiveTabId()
            if (tabId == null) {
                throw new Error('No active tab')
            }

            log('Scrolling to section', cssSelector)
            await chrome.tabs.sendMessage(tabId, {
                type: 'SCROLL_TO_SECTION',
                selector: cssSelector
            })

            setIsOpen(false)
        } catch (error) {
            err('Navigation error', error)
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

    // Handle click outside to close popover
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    // Show model download state
    if (notDownloaded) {
        return (
            <div ref={containerRef} className="relative">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <Spinner className="w-4 h-4 mr-2" />
                    Loading...
                </Button>

                {isOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 duration-200">
                        <div className="text-sm text-gray-600 flex flex-col items-center justify-center p-4">
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

                            <Button
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
                                size="sm"
                            >
                                {downloadProgress.hidden ? 'Download Model' : 'Downloading...'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Show loading state
    if (isLoading) {
        return (
            <div ref={containerRef} className="relative">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <Spinner className="w-4 h-4 mr-2" />
                </Button>

                {isOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 duration-200">
                        <div className="flex items-center justify-center p-4">
                            <div className="text-center">
                                <Spinner className="w-8 h-8 mx-auto mb-2" />
                                <p className="text-sm text-gray-600">
                                    {progress.total > 0
                                        ? `Processing ${progress.done}/${progress.total} chunks...`
                                        : 'Extracting page sections...'
                                    }
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Show error state
    if (error) {
        return (
            <div ref={containerRef} className="relative">
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    Error
                </Button>

                {isOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 duration-200">
                        <div className="p-4">
                            <h3 className="font-semibold text-red-600 mb-2">Extraction Failed</h3>
                            <p className="text-sm text-gray-600">
                                {error instanceof Error ? error.message : 'Unknown error occurred'}
                            </p>
                            <Button
                                onClick={fetchToc}
                                size="sm"
                                className="mt-3"
                                variant="outline"
                            >
                                Retry
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Show completed state with TOC items
    return (
        <div ref={containerRef} className="relative">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(!isOpen)}
            >
                <TableOfContentsIcon className="w-4 h-4 mr-1" />
                <span className="text-xs">{toc.length}</span>
            </Button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-48 max-h-96 border border-gray-200 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 duration-200 overflow-hidden text-primary bg-background">
                    <div className="overflow-y-auto max-h-96">
                        <div className="space-y-3 p-4">
                            <div className="flex items-center justify-between pb-2 border-b">
                                <h3 className="font-semibold text-lg">Page Sections</h3>
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-gray-500">Chunked:</label>
                                    <Button
                                        onClick={() => setUseChunked(!useChunked)}
                                        variant={useChunked ? "default" : "outline"}
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                    >
                                        {useChunked ? 'ON' : 'OFF'}
                                    </Button>
                                </div>
                            </div>

                            {toc.length > 0 ? (
                                <div className="space-y-2">
                                    {toc.map((item, index) => (
                                        <Button
                                            key={index}
                                            variant="ghost"
                                            className="w-full justify-start h-auto p-3 text-left hover:bg-gray-400"
                                            onClick={() => navigateToSection(item.cssSelector)}
                                        >
                                            <div className="flex flex-col items-start">
                                                <div className="font-medium text-sm text-primary">{item.title}</div>
                                                <div className="text-xs text-gray-500 font-mono mt-1 text-primary">{item.cssSelector}</div>
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-gray-500">
                                    <p className="text-sm">No sections found</p>
                                    <Button
                                        onClick={fetchToc}
                                        size="sm"
                                        variant="outline"
                                        className="mt-2"
                                    >
                                        Retry Extraction
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}