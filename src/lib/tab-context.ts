import type { TocItem } from '../hooks/usePromptAPI'

export interface TabContext {
    tabId: number
    url: string
    toc: TocItem[]
    lastUpdated: number
}

class TabContextManager {
    private contexts = new Map<number, TabContext>()
    private readonly STORAGE_KEY = 'erpa_tab_contexts'
    private readonly MAX_CONTEXTS = 50 // Limit to prevent memory issues

    constructor() {
        this.loadFromStorage()
    }

    private async loadFromStorage(): Promise<void> {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEY)
            const stored = result[this.STORAGE_KEY] as TabContext[] | undefined
            if (stored && Array.isArray(stored)) {
                stored.forEach(context => {
                    this.contexts.set(context.tabId, context)
                })
            }
        } catch (error) {
            console.warn('[TabContext] Failed to load from storage:', error)
        }
    }

    private async saveToStorage(): Promise<void> {
        try {
            const contexts = Array.from(this.contexts.values())
            await chrome.storage.local.set({ [this.STORAGE_KEY]: contexts })
        } catch (error) {
            console.warn('[TabContext] Failed to save to storage:', error)
        }
    }

    async getContext(tabId: number): Promise<TabContext | null> {
        return this.contexts.get(tabId) || null
    }

    async setContext(tabId: number, url: string, toc: TocItem[]): Promise<void> {
        const context: TabContext = {
            tabId,
            url,
            toc,
            lastUpdated: Date.now()
        }

        this.contexts.set(tabId, context)

        // Clean up old contexts if we exceed the limit
        if (this.contexts.size > this.MAX_CONTEXTS) {
            const sortedContexts = Array.from(this.contexts.entries())
                .sort(([, a], [, b]) => a.lastUpdated - b.lastUpdated)
            
            // Remove oldest contexts
            const toRemove = sortedContexts.slice(0, this.contexts.size - this.MAX_CONTEXTS)
            toRemove.forEach(([tabId]) => {
                this.contexts.delete(tabId)
            })
        }

        await this.saveToStorage()
    }

    async removeContext(tabId: number): Promise<void> {
        this.contexts.delete(tabId)
        await this.saveToStorage()
    }

    async clearAllContexts(): Promise<void> {
        this.contexts.clear()
        await this.saveToStorage()
    }

    async getCurrentTabId(): Promise<number | null> {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
            return tabs[0]?.id || null
        } catch (error) {
            console.warn('[TabContext] Failed to get current tab ID:', error)
            return null
        }
    }

    async isContextValid(tabId: number, currentUrl: string): Promise<boolean> {
        const context = this.contexts.get(tabId)
        if (!context) return false
        
        // Check if URL has changed (basic validation)
        return context.url === currentUrl
    }
}

// Export singleton instance
export const tabContextManager = new TabContextManager()
