import { useEffect, useState } from "react"

export const TocPopup = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [toc, setToc] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<unknown>(null)

    const initializeSummarizer = async (): Promise<SummarizerInstance | null> => {
        if (!('Summarizer' in self)) {
            console.error('Summarizer API is not supported')
            return null
        }

        const instance = Summarizer
        const options: SummarizerCreateOptions = {
            sharedContext: "You're a helpful assistant that can summarize the content of a page for visually impaired users",
            type: 'key-points',
            format: 'markdown',
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
        if (availability === 'unavailable') {
            // The Summarizer API isn't usable.
            console.error('Summarizer API is not available')
            return null
        }

        // Check for user activation before creating the summarizer
        const summarizer = await instance.create(options);
        return summarizer;
    }

    const getActiveTabId = async (): Promise<number | null> => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const tab = tabs?.[0]
        return tab?.id ?? null
    }

    const fetchPageMainText = async (): Promise<string> => {
        const tabId = await getActiveTabId()
        if (tabId == null) {
            throw new Error('No active tab')
        }
        const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_MAIN_CONTENT' })
        if (!response?.ok) {
            throw new Error(response?.error || 'Failed to retrieve main content')
        }
        return response.text as string
    }

    const fetchToc = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const summarizer = await initializeSummarizer()
            if (!summarizer) {
                throw new Error('Summarizer API is not supported')
            }
            const mainText = await fetchPageMainText()
            console.log("Fetched main text")
            console.log("Starting summarization")
            setIsLoading(true)
            const data = await summarizer.summarize(mainText, {
                context: 'Summarize the page\'s main content into concise key points for a visually impaired user. Prefer short, clear bullets.'
            })
            console.log("Summarization complete")
            if (!data) {
                setIsLoading(false)
                setError(new Error('Summarization failed'))
                return
            }
            console.log({ data })
            setToc(data.split('\n').map(item => item.trim()))
            setIsLoading(false)
        } catch (error) {
            setIsLoading(false)
            setError(error)
        }
    }

    useEffect(() => {
        fetchToc()
    }, [])

    if (isLoading) {
        return <div>Loading...</div>
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