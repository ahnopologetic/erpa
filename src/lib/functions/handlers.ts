import { log } from "~lib/log"

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

export { handleNavigation, handleReadOut, handleGetContent }