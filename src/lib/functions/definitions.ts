import { createFunctionDefinition } from "@ahnopologetic/use-prompt-api";

const navigateFunction = createFunctionDefinition('navigate', 'Navigate to a specific location on the page', {
    type: 'function',
    properties: {
        location: { type: 'string', description: "Location to navigate to. Should be a valid css selector. e.g., '#campus', '.div: nth- of - type(2) > div', etc." }
    },
    required: ['location']
}, async ({ location }: { location: string }) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs?.[0]
    await chrome.tabs.sendMessage(tab?.id ?? 0, { type: 'SCROLL_TO_SECTION', selector: location })
    return true
})

const readOutFunction = createFunctionDefinition('readOut', 'Read out a specific section or node', {
    type: 'function',
    properties: {
        targetType: { type: 'string', description: "Type of target to read out. Should be 'SECTION' or 'NODE'" },
        target: { type: 'string', description: "Target to read out. For section, it should be the section name. For node, it should be the node id or selector." }
    },
    required: ['targetType', 'target']
}, async ({ targetType, target }: { targetType: string, target: string }) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs?.[0]
    await chrome.tabs.sendMessage(tab?.id ?? 0, { type: 'READ_OUT', targetType: targetType, target: target })
    return true
})

const getContentFunction = createFunctionDefinition('getContent', 'Get content from a specific section or node', {
    type: 'function',
    properties: {
        selector: { type: 'string', description: "Selector to get content from. Should be a valid css selector. e.g., '#campus', '.div:nth-of-type(2) > div', etc." }
    },
    required: ['selector']
}, async ({ selector }: { selector: string }) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs?.[0]
    await chrome.tabs.sendMessage(tab?.id ?? 0, { type: 'GET_CONTENT', selector })
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab?.id ?? 0, { type: 'GET_CONTENT', selector }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message))
            } else if (response?.ok) {
                resolve(response.content)
            } else {
                reject(new Error(response?.error || 'Failed to get content'))
            }
        })
    })
})

export {
    navigateFunction,
    readOutFunction,
    getContentFunction
}