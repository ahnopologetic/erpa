// Background script to handle keyboard shortcuts and sidepanel commands

import { err, log } from "~lib/log";

// Open sidepanel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Embedding offscreen document management
const OFFSCREEN_DOCUMENT_PATH = 'tabs/offscreen.html';
let creatingOffscreen: Promise<void> | null = null;

// Cache cleanup interval
let cacheCleanupInterval: NodeJS.Timeout | null = null;

/**
 * Ensure offscreen document for embedding generation exists
 */
async function ensureEmbeddingOffscreenDocument(): Promise<void> {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        return;
    }

    // Avoid creating multiple instances
    if (creatingOffscreen) {
        await creatingOffscreen;
        return;
    }

    try {
        creatingOffscreen = chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ['DOM_PARSER' as chrome.offscreen.Reason],
            justification: 'Load and run transformers.js model for semantic search embeddings'
        });
        
        await creatingOffscreen;
        creatingOffscreen = null;
        
        log('[semantic-search] Created offscreen document for embedding generation');
    } catch (error) {
        err('[semantic-search] Error creating offscreen document:', error);
        creatingOffscreen = null;
        throw error;
    }
}

/**
 * Load embedding model in offscreen document
 */
async function loadEmbeddingModel(): Promise<void> {
    try {
        await ensureEmbeddingOffscreenDocument();
        
        log('[semantic-search] Loading embedding model...');
        const response = await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'LOAD_EMBEDDING_MODEL'
        });

        if (!response?.success) {
            throw new Error(response?.error || 'Failed to load embedding model');
        }

        log('[semantic-search] Embedding model loaded successfully');
    } catch (error) {
        err('[semantic-search] Failed to load embedding model:', error);
        throw error;
    }
}

/**
 * Generate embedding for a single text using offscreen document
 */
async function generateEmbedding(text: string): Promise<number[]> {
    try {
        await ensureEmbeddingOffscreenDocument();
        
        log('[semantic-search] Generating embedding for text:', text.substring(0, 100) + '...');
        
        const response = await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'GENERATE_EMBEDDING',
            text
        });

        if (!response?.success || !response.embedding) {
            throw new Error(response?.error || 'Failed to generate embedding');
        }

        // log('[semantic-search] Generated embedding with dimension:', response.embedding.length);
        return response.embedding;
    } catch (error) {
        err('[semantic-search] Error generating embedding:', error);
        throw error;
    }
}

/**
 * Generate embeddings for multiple texts (batch) using offscreen document
 */
async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
        await ensureEmbeddingOffscreenDocument();
        
        log('[semantic-search] Generating embeddings for', texts.length, 'texts');
        
        const response = await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'BATCH_GENERATE_EMBEDDINGS',
            texts
        });

        if (!response?.success || !response.embeddings) {
            throw new Error(response?.error || 'Failed to generate batch embeddings');
        }

        log('[semantic-search] Generated', response.embeddings.length, 'embeddings');
        return response.embeddings;
    } catch (error) {
        err('[semantic-search] Error generating batch embeddings:', error);
        throw error;
    }
}

/**
 * Clean up expired cache entries via offscreen document
 */
async function cleanupExpiredCacheEntries(): Promise<void> {
  try {
    log('[semantic-search] Cleaning up expired cache entries...');
    
    await ensureEmbeddingOffscreenDocument();
    
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'CLEANUP_CACHE'
    });
    
    if (response?.success) {
      log('[semantic-search] Cache cleanup completed');
    } else {
      throw new Error(response?.error || 'Failed to cleanup cache');
    }
  } catch (error) {
    err('[semantic-search] Error during cache cleanup:', error);
  }
}

/**
 * Start periodic cache cleanup
 */
function startCacheCleanup(): void {
  if (cacheCleanupInterval) return;
  
  // Clean up every hour
  cacheCleanupInterval = setInterval(() => {
    cleanupExpiredCacheEntries();
  }, 60 * 60 * 1000);
  
  log('[semantic-search] Started periodic cache cleanup');
}

/**
 * Stop periodic cache cleanup
 */
function stopCacheCleanup(): void {
  if (cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
    log('[semantic-search] Stopped periodic cache cleanup');
  }
}


function toggleSidepanel(options: chrome.sidePanel.OpenOptions) {
    chrome.sidePanel.open(options)
    chrome.runtime.sendMessage({
        type: 'close-sidepanel',
        tabId: options.tabId
    })
    log("Runtime message sent: close-sidepanel");
}

chrome.commands.onCommand.addListener(async (command) => {
    if (command === "toggle-sidepanel") {
        try {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                toggleSidepanel({
                    tabId: tabs[0].id
                })
            });
        } catch (error) {
            err("Failed to open sidepanel:", error);
        }
    }
    
    if (command === "semantic-search") {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'FOCUS_SEMANTIC_SEARCH'
                    });
                }
            });
        } catch (error) {
            err("Failed to focus semantic search:", error);
        }
    }
});

// Handle sidepanel availability - prevent opening on action click
chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: false
});

// Listen for tab changes to close sidepanel
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        console.log(`[Background] Tab activated: ${activeInfo.tabId}`);
        // Send message to sidepanel to close itself when switching tabs
        // Since we can't directly close the sidepanel from background script,
        // we'll send a message to the sidepanel to handle the closing
        chrome.runtime.sendMessage({
            type: 'CLOSE_SIDEPANEL_ON_TAB_SWITCH',
            tabId: activeInfo.tabId
        });
        console.log(`[Background] Sent close message due to tab switch to tab ${activeInfo.tabId}`);
    } catch (error) {
        console.error("[Background] Failed to send close message on tab switch:", error);
    }
});

// Also listen for tab updates (when navigating to new pages)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
        try {
            console.log(`[Background] Tab updated: ${tabId}`);

            // Send message to sidepanel to close itself when navigating to new pages
            chrome.runtime.sendMessage({
                type: 'CLOSE_SIDEPANEL_ON_PAGE_NAVIGATION',
                tabId: tabId
            });
            console.log(`[Background] Sent close message due to page navigation on tab ${tabId}`);
        } catch (error) {
            console.error("[Background] Failed to send close message on page navigation:", error);
        }
    }
});

console.log("Background script loaded");

// Start cache cleanup when background script loads
startCacheCleanup();

// Handle embedding-related messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LOAD_EMBEDDING_MODEL') {
        loadEmbeddingModel()
            .then(() => {
                sendResponse({ success: true });
            })
            .catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep message channel open for async response
    }

    if (message.type === 'GENERATE_EMBEDDING') {
        generateEmbedding(message.text)
            .then((embedding) => {
                sendResponse({ success: true, embedding });
            })
            .catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep message channel open for async response
    }

    if (message.type === 'BATCH_GENERATE_EMBEDDINGS') {
        generateBatchEmbeddings(message.texts)
            .then((embeddings) => {
                sendResponse({ success: true, embeddings });
            })
            .catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep message channel open for async response
    }

    if (message.type === 'CLEANUP_CACHE') {
        (async () => {
            try {
                await ensureEmbeddingOffscreenDocument();
                log('[background] Forwarding CLEANUP_CACHE to offscreen');
                
                const response = await chrome.runtime.sendMessage({
                    target: 'offscreen',
                    type: 'CLEANUP_CACHE'
                });
                
                sendResponse(response);
            } catch (error) {
                err('[background] ❌ Error forwarding cleanup cache request:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // Forward cache operations to offscreen document
    if (message.type === 'GET_CACHED_EMBEDDINGS') {
        (async () => {
            try {
                await ensureEmbeddingOffscreenDocument();
                log('[background] Forwarding GET_CACHED_EMBEDDINGS to offscreen');
                
                const response = await chrome.runtime.sendMessage({
                    target: 'offscreen',
                    type: 'GET_CACHED_EMBEDDINGS',
                    url: message.url,
                    segments: message.segments
                });
                
                sendResponse(response);
            } catch (error) {
                err('[background] ❌ Error forwarding cache request:', error);
                sendResponse({ success: false, error: error.message, cachedEmbeddings: null });
            }
        })();
        return true;
    }

    if (message.type === 'CACHE_EMBEDDINGS') {
        (async () => {
            try {
                await ensureEmbeddingOffscreenDocument();
                log('[background] Forwarding CACHE_EMBEDDINGS to offscreen');
                
                const response = await chrome.runtime.sendMessage({
                    target: 'offscreen',
                    type: 'CACHE_EMBEDDINGS',
                    url: message.url,
                    segments: message.segments,
                    embeddings: message.embeddings
                });
                
                sendResponse(response);
            } catch (error) {
                err('[background] ❌ Error forwarding cache request:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (message.type === 'GET_CACHE_STATS') {
        (async () => {
            try {
                await ensureEmbeddingOffscreenDocument();
                log('[background] Forwarding GET_CACHE_STATS to offscreen');
                
                const response = await chrome.runtime.sendMessage({
                    target: 'offscreen',
                    type: 'GET_CACHE_STATS'
                });
                
                sendResponse(response);
            } catch (error) {
                err('[background] ❌ Error forwarding cache stats request:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (message.type === 'CLEAR_ALL_CACHE') {
        (async () => {
            try {
                await ensureEmbeddingOffscreenDocument();
                log('[background] Forwarding CLEAR_ALL_CACHE to offscreen');
                
                const response = await chrome.runtime.sendMessage({
                    target: 'offscreen',
                    type: 'CLEAR_ALL_CACHE'
                });
                
                sendResponse(response);
            } catch (error) {
                err('[background] ❌ Error forwarding clear cache request:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }
});