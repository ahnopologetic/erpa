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

    const fetchToc = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const summarizer = await initializeSummarizer()
            if (!summarizer) {
                throw new Error('Summarizer API is not supported')
            }
            const mainContent = document.querySelector('main')?.innerHTML
            const data = await summarizer.summarize(mainContent, {
                context: 'The main content will be the content of anything. Summarize the content into a list of key points.'
            })
            console.log({ data })
            setToc(data.split('\n').map(item => item.trim()))
        } catch (error) {
            setError(error)
        }
    }

    useEffect(() => {
        fetchToc()
    }, [])

    return (
        <div>
            <h1>Toc Popup</h1>
        </div>
    )
}