import { useCallback, useState } from 'react'
import { type Section } from './useDetectSections'
import { err, log } from '../lib/log'

/**
 * Hook that provides fast section detection using useDetectSections
 * without prompt API dependency. Communicates with content script
 * to execute section detection in the page context.
 */
export const useFastSections = () => {
    const [sections, setSections] = useState<Section[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<unknown>(null)

    const getActiveTabId = useCallback(async (): Promise<number | null> => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const tab = tabs?.[0]
        return tab?.id ?? null
    }, [])

    const detectSectionsFromContentScript = useCallback(async (): Promise<Section[]> => {
        const tabId = await getActiveTabId()
        if (tabId == null) {
            throw new Error('No active tab')
        }

        log('Detecting sections from content script for tab:', tabId)

        // Send message to content script to run detectSections
        const response = await chrome.tabs.sendMessage(tabId, { type: 'DETECT_SECTIONS' })

        if (!response?.ok) {
            throw new Error(response?.error || 'Failed to detect sections from DOM')
        }

        const detectedSections = (response.sections || []) as Section[]
        log('Received detected sections from content script:', detectedSections)

        return detectedSections
    }, [getActiveTabId])

    const loadSections = useCallback(async (): Promise<Section[]> => {
        setIsLoading(true)
        setError(null)

        try {
            const detectedSections = await detectSectionsFromContentScript()
            log('Loaded sections:', detectedSections)
            setSections(detectedSections)
            return detectedSections
        } catch (error) {
            err('Failed to load sections:', error)
            setError(error)
            throw error
        } finally {
            setIsLoading(false)
        }
    }, [detectSectionsFromContentScript])

    const navigateToSection = useCallback(async (cssSelector: string): Promise<void> => {
        try {
            const tabId = await getActiveTabId()
            if (tabId == null) {
                throw new Error('No active tab')
            }

            log('Scrolling to section:', cssSelector)
            await chrome.tabs.sendMessage(tabId, {
                type: 'SCROLL_TO_SECTION',
                selector: cssSelector
            })
        } catch (error) {
            err('Navigation error:', error)
            setError(error)
            throw error
        }
    }, [getActiveTabId])

    const saveContextForCurrentTab = useCallback(async (sections: Section[]): Promise<void> => {
        try {
            const tabId = await getActiveTabId()
            if (tabId == null) {
                log('No active tab found for context saving')
                return
            }

            // Get current URL for validation
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
            const currentUrl = tabs[0]?.url || ''

            // Convert to TocItem format for compatibility with existing context system
            const tocItems: Array<{ title: string; cssSelector: string }> = sections.map(s => ({
                title: s.title,
                cssSelector: s.cssSelector
            }))

            // Import tab context manager dynamically to avoid circular dependencies
            const { tabContextManager } = await import('../lib/tab-context')
            await tabContextManager.setContext(tabId, currentUrl, tocItems)
            log(`Saved context for tab ${tabId} with ${sections.length} items`)

            // Send sections to content script for highlighting
            try {
                await chrome.tabs.sendMessage(tabId, {
                    type: 'SET_SECTIONS',
                    sections: tocItems
                })
                log('Sent sections to content script for highlighting')
            } catch (contentScriptError) {
                // Content script might not be loaded yet, this is not critical
                log('Could not send sections to content script (content script may not be loaded)', contentScriptError)
            }
        } catch (error) {
            err('Failed to save context for current tab', error)
        }
    }, [getActiveTabId])

    const loadContextForCurrentTab = useCallback(async (): Promise<Section[]> => {
        try {
            const tabId = await getActiveTabId()
            if (tabId == null) {
                log('No active tab found for context loading')
                return []
            }

            // Import tab context manager dynamically to avoid circular dependencies
            const { tabContextManager } = await import('../lib/tab-context')
            const context = await tabContextManager.getContext(tabId)

            if (context) {
                log(`Loaded context for tab ${tabId} with ${context.toc.length} items`)

                // Convert to Section format
                const sections: Section[] = context.toc.map(item => ({
                    title: item.title,
                    cssSelector: item.cssSelector
                }))

                // Send sections to content script for highlighting
                try {
                    await chrome.tabs.sendMessage(tabId, {
                        type: 'SET_SECTIONS',
                        sections: context.toc
                    })
                    log('Sent loaded sections to content script for highlighting')
                } catch (contentScriptError) {
                    // Content script might not be loaded yet, this is not critical
                    log('Could not send sections to content script (content script may not be loaded)', contentScriptError)
                }

                setSections(sections)
                return sections
            }

            log(`No context found for tab ${tabId}`)
            return []
        } catch (error) {
            err('Failed to load context for current tab', error)
            return []
        }
    }, [getActiveTabId])

    return {
        sections,
        isLoading,
        error,
        loadSections,
        navigateToSection,
        saveContextForCurrentTab,
        loadContextForCurrentTab,
        setError: (error: unknown) => setError(error)
    }
}
