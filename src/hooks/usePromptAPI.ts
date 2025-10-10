import { useCallback, useState } from 'react';
import { err, isVerbose, log, timeEnd, timeStart, warn } from '../lib/log';

export type TocItem = { title: string; cssSelector: string }

export interface PromptAPIState {
    isLoading: boolean
    error: unknown | null
    progress: { total: number; done: number }
    downloadProgress: { hidden: boolean; value: number; indeterminate: boolean }
    notDownloaded: boolean
}

export interface PromptAPIActions {
    checkModelAvailability: () => Promise<LanguageModelAvailability>
    initializePromptSession: () => Promise<LanguageModelSession | null>
    fetchPageMainText: () => Promise<{ text: string; headings: { text: string; selector: string }[] }>
    extractWithChunked: (session: LanguageModelSession, mainText: string, headings: { text: string; selector: string }[]) => Promise<TocItem[]>
    extractWithSingleCall: (session: LanguageModelSession, mainText: string, headings: { text: string; selector: string }[]) => Promise<TocItem[]>
    parseExtractionResult: (data: string, headings: { text: string; selector: string }[]) => TocItem[]
    fetchToc: (useChunked: boolean) => Promise<TocItem[]>
    navigateToSection: (cssSelector: string) => Promise<void>
    setError: (error: unknown | null) => void
}

export const usePromptAPI = (): PromptAPIState & PromptAPIActions => {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<unknown>(null)
    const [progress, setProgress] = useState<{ total: number; done: number }>({ total: 0, done: 0 })
    const [downloadProgress, setDownloadProgress] = useState<{ hidden: boolean; value: number; indeterminate: boolean }>({
        hidden: true,
        value: 0,
        indeterminate: false
    })
    const [notDownloaded, setNotDownloaded] = useState(true)

    const checkModelAvailability = useCallback(async (): Promise<LanguageModelAvailability> => {
        if (!('LanguageModel' in self)) {
            err('Prompt API is not supported')
            return 'unavailable'
        }
        return await LanguageModel.availability()
    }, [])

    const initializePromptSession = useCallback(async (): Promise<LanguageModelSession | null> => {
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
    }, [])

    const getActiveTabId = useCallback(async (): Promise<number | null> => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const tab = tabs?.[0]
        return tab?.id ?? null
    }, [])

    const fetchPageMainText = useCallback(async (): Promise<{ text: string; headings: { text: string; selector: string }[] }> => {
        const tabId = await getActiveTabId()
        if (tabId == null) {
            throw new Error('No active tab')
        }
        const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_MAIN_CONTENT' })
        if (!response?.ok) {
            throw new Error(response?.error || 'Failed to retrieve main content')
        }
        return { text: response.text as string, headings: (response.headings || []) as { text: string; selector: string }[] }
    }, [getActiveTabId])

    const extractWithChunked = useCallback(async (session: LanguageModelSession, mainText: string, headings: { text: string; selector: string }[]): Promise<TocItem[]> => {
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
    }, [])

    const extractWithSingleCall = useCallback(async (session: LanguageModelSession, mainText: string, headings: { text: string; selector: string }[]): Promise<TocItem[]> => {
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
    }, [])

    const parseExtractionResult = useCallback((data: string, headings: { text: string; selector: string }[]): TocItem[] => {
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
    }, [])

    const fetchToc = useCallback(async (useChunked: boolean): Promise<TocItem[]> => {
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

            setIsLoading(false)
            return items
        } catch (error) {
            setIsLoading(false)
            err('Extraction error', error)
            setError(error)
            throw error
        }
    }, [initializePromptSession, fetchPageMainText, extractWithChunked, extractWithSingleCall])

    const navigateToSection = useCallback(async (cssSelector: string): Promise<void> => {
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
        } catch (error) {
            err('Navigation error', error)
            setError(error)
            throw error
        }
    }, [getActiveTabId])

    return {
        // State
        isLoading,
        error,
        progress,
        downloadProgress,
        notDownloaded,
        // Actions
        checkModelAvailability,
        initializePromptSession,
        fetchPageMainText,
        extractWithChunked,
        extractWithSingleCall,
        parseExtractionResult,
        fetchToc,
        navigateToSection,
        setError
    }
}
