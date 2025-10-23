// Background script to handle keyboard shortcuts and sidepanel commands

import { err, log } from "~lib/log";

// Open sidepanel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Embedding model management
let embeddingModel: any = null;
let modelLoadingPromise: Promise<any> | null = null;

// Cache cleanup interval
let cacheCleanupInterval: NodeJS.Timeout | null = null;

/**
 * Load the embedding model using dynamic import
 */
async function loadEmbeddingModel(): Promise<any> {
    if (embeddingModel) {
        return embeddingModel;
    }

    if (modelLoadingPromise) {
        return modelLoadingPromise;
    }

    modelLoadingPromise = (async () => {
        try {
            log('[semantic-search] Loading embedding model...');
            
            // Dynamic import to avoid bundling issues
            const { pipeline, env } = await import('@xenova/transformers');
            
            // Configure environment
            env.allowLocalModels = false; // Use CDN
            env.allowRemoteModels = true;
            
            // Load the sentence transformer model
            const model = await pipeline(
                'feature-extraction',
                'Xenova/all-MiniLM-L6-v2',
                {
                    quantized: true, // Use quantized model for smaller size
                    progress_callback: (progress: any) => {
                        if (progress.status === 'downloading') {
                            log('[semantic-search] Model download progress:', Math.round(progress.progress * 100) + '%');
                        }
                    }
                }
            );

            embeddingModel = model;
            log('[semantic-search] Embedding model loaded successfully');
            return model;
        } catch (error) {
            err('[semantic-search] Failed to load embedding model:', error);
            modelLoadingPromise = null;
            throw error;
        }
    })();

    return modelLoadingPromise;
}

/**
 * Generate embedding for a single text
 */
async function generateEmbedding(text: string): Promise<number[]> {
    const model = await loadEmbeddingModel();
    
    try {
        log('[semantic-search] Generating embedding for text:', text.substring(0, 100) + '...');
        
        const result = await model(text, {
            pooling: 'mean',
            normalize: true
        });
        
        // Convert tensor to array
        const embedding = Array.from(result.data);
        log('[semantic-search] Generated embedding with dimension:', embedding.length);
        
        return embedding;
    } catch (error) {
        err('[semantic-search] Error generating embedding:', error);
        throw error;
    }
}

/**
 * Clean up expired cache entries
 */
async function cleanupExpiredCacheEntries(): Promise<void> {
  try {
    log('[semantic-search] Cleaning up expired cache entries...');
    
    // Dynamic import to avoid bundling issues
    const { EmbeddingCache } = await import('~lib/semantic-search/cache');
    const cache = new EmbeddingCache();
    
    await cache.cleanupExpiredEntries();
    log('[semantic-search] Cache cleanup completed');
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
        cleanupExpiredCacheEntries()
            .then(() => {
                sendResponse({ success: true });
            })
            .catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep message channel open for async response
    }
});