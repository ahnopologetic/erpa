import { log, err } from "~lib/log"

const handleNavigation = async (location: string) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs?.[0]
    log('[AI] Tab ID', { tabId: tab?.id })
    await chrome.tabs.sendMessage(tab?.id ?? 0, { type: 'SCROLL_TO_SECTION', selector: location })
    return true
}


const handleReadOut = async (targetType: string | 'SECTION' | 'NODE', target: string) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs?.[0]
    await chrome.tabs.sendMessage(tab?.id ?? 0, { type: 'READ_OUT', targetType: targetType, target: target })
    return true
}

const handleGetContent = async (selector: string) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs?.[0]
    log('[AI] Getting content for selector', { selector, tabId: tab?.id })

    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab?.id ?? 0, { type: 'GET_CONTENT', selector }, (response) => {
            if (chrome.runtime.lastError) {
                log('[AI] Error getting content', chrome.runtime.lastError)
                reject(new Error(chrome.runtime.lastError.message))
            } else if (response?.ok) {
                log('[AI] Content retrieved successfully', { contentLength: response.content?.length })
                resolve(response.content)
            } else {
                log('[AI] Failed to get content', response?.error)
                reject(new Error(response?.error || 'Failed to get content'))
            }
        })
    })
}

const handleSummarizePage = async () => {
    log('[AI] Starting simple page summarization...')

    try {
        // Get current tab URL
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const tab = tabs?.[0]

        if (!tab?.url) {
            throw new Error('No active tab or URL found')
        }

        log('[AI] Summarizing page:', tab.url)

        // Import SessionManager dynamically to avoid issues
        const { SessionManager } = await import('@ahnopologetic/use-prompt-api')

        // Create a session for summarization
        const session = new SessionManager()
        await session.create({
            systemPrompt: 'You are a helpful assistant that can summarize web pages. Provide clear, concise summaries based on the URL and your knowledge.',
            enablePersistence: false
        })

        // Simple prompt with just the URL
        const prompt = `Summarize this page in 1-2 paragraphs: ${tab.url}`

        log('[AI] Sending to prompt API...')
        const summary = await session.prompt(prompt)

        // Clean up session
        session.destroy()

        log('[AI] Page summarization completed successfully')

        // Return simple summary object
        return {
            title: tab.title || 'Unknown Page',
            url: tab.url,
            summary: summary
        }

    } catch (error) {
        err('[AI] Error during page summarization:', error)
        throw new Error(`Failed to summarize page: ${(error as Error).message}`)
    }
}

export { handleNavigation, handleReadOut, handleGetContent, handleSummarizePage }