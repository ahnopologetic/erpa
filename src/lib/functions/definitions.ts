import { createFunctionDefinition } from "@ahnopologetic/use-prompt-api";
import { log } from "~lib/log";
import { handleGetContent, handleSummarizePage } from "./handlers";

const navigateFunction = createFunctionDefinition('navigate', 'Navigate to a specific location on the page', {
    type: 'object',
    properties: {
        location: { type: 'string', description: "Location to navigate to. Look for the section name in the context and use the css selector. Should be a valid css selector. e.g., '#campus', '.div: nth- of - type(2) > div', etc." }
    },
    required: ['location']
}, async ({ location }: { location: string }) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs?.[0]
    log('Navigating to:', location, { tabId: tab?.id })
    const response = await chrome.tabs.sendMessage(tab?.id ?? 0, { type: 'SCROLL_TO_SECTION', selector: location })
    if (!response?.ok) {
        throw new Error(response?.error || 'Failed to navigate to section')
    }
    return true
})

const readOutFunction = createFunctionDefinition('readOut', 'Read out a specific section or node', {
    type: 'object',
    properties: {
        targetType: { type: 'string', description: "Type of target to read out. Should be 'SECTION' or 'NODE'" },
        target: { type: 'string', description: "Target to read out. For section, it should be the section name. Search for the exact section name in the context. For node, it should be the node id or selector." }
    },
    required: ['targetType', 'target']
}, async ({ targetType, target }: { targetType: string, target: string }) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs?.[0]

    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab?.id ?? 0, { type: 'READ_OUT', targetType: targetType, target: target }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message))
            } else if (response?.ok) {
                resolve(`Successfully started reading out ${targetType.toLowerCase()}: ${target}`)
            } else {
                reject(new Error(response?.error || 'Failed to read out content'))
            }
        })
    })
})

const semanticSearchFunction = createFunctionDefinition('semanticSearch', 'Perform semantic search on the current page', {
    type: 'object',
    properties: {
        query: { type: 'string', description: "The search query to find relevant content on the page" },
        autoPlayFirst: { type: 'boolean', description: "Whether to automatically play the first result with TTS" }
    },
    required: ['query']
}, async ({ query, autoPlayFirst = false }: { query: string, autoPlayFirst?: boolean }) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs?.[0]

    log('Performing semantic search:', query, { tabId: tab?.id, autoPlayFirst })

    const response = await chrome.tabs.sendMessage(tab?.id ?? 0, {
        type: 'SEMANTIC_SEARCH',
        query,
        autoPlayFirst
    })

    if (!response?.ok) {
        throw new Error(response?.error || 'Failed to perform semantic search')
    }

    return {
        query,
        results: response.results,
        bestMatch: response.bestMatch,
        totalResults: response.totalResults
    }
})

const getContentFunction = createFunctionDefinition('getContent', 'Get content from a specific element on the page', {
    type: 'object',
    properties: {
        selector: { type: 'string', description: "CSS selector for the element to get content from" }
    },
    required: ['selector']
}, async ({ selector }: { selector: string }) => {
    return await handleGetContent(selector)
})

const summarizePageFunction = createFunctionDefinition('summarizePage', 'Analyze and summarize the entire current page content using incremental processing to respect token limits. Extracts all meaningful content, identifies key themes, and creates comprehensive summaries at both section and page level.', {
    type: 'object',
    properties: {},
    required: []
}, async () => {
    return await handleSummarizePage();
})

export {
    navigateFunction,
    readOutFunction,
    getContentFunction,
    semanticSearchFunction,
    summarizePageFunction
}