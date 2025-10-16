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

export { handleNavigation, handleReadOut }