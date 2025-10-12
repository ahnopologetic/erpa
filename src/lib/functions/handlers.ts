import { log } from "~lib/log"

const handleNavigation = async (location: string) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs?.[0]
    log('[AI] Tab ID', { tabId: tab?.id })
    await chrome.tabs.sendMessage(tab?.id ?? 0, { type: 'SCROLL_TO_SECTION', selector: location })
}

export { handleNavigation }