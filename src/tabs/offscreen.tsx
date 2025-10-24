import { useEffect } from "react"
import { log, err } from "~lib/log"
import { EmbeddingCache } from "~lib/semantic-search/cache"

// Embedding model management
let embeddingModel: any = null
let modelLoadingPromise: Promise<any> | null = null

// Cache instance
let cacheInstance: EmbeddingCache | null = null

function getCacheInstance(): EmbeddingCache {
  if (!cacheInstance) {
    cacheInstance = new EmbeddingCache()
  }
  return cacheInstance
}

/**
 * Load the embedding model using transformers.js
 */
async function loadEmbeddingModel(): Promise<any> {
  if (embeddingModel) {
    return embeddingModel
  }

  if (modelLoadingPromise) {
    return modelLoadingPromise
  }

  modelLoadingPromise = (async () => {
    try {
      log('[semantic-search] Loading embedding model in offscreen document...')

      // Dynamic import to avoid bundling issues
      const { pipeline, env } = await import('@xenova/transformers')

      // Configure environment
      env.allowLocalModels = false // Use CDN
      env.allowRemoteModels = true

      // Load the sentence transformer model
      const model = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        {
          quantized: true, // Use quantized model for smaller size
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading') {
              log('[semantic-search] Model download progress:', Math.round(progress.progress * 100) + '%')
            }
          }
        }
      )

      embeddingModel = model
      log('[semantic-search] Embedding model loaded successfully in offscreen document')
      return model
    } catch (error) {
      err('[semantic-search] Failed to load embedding model:', error)
      modelLoadingPromise = null
      throw error
    }
  })()

  return modelLoadingPromise
}

/**
 * Generate embedding for a single text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const model = await loadEmbeddingModel()
    const result = await model(text, {
      pooling: 'mean',
      normalize: true
    })

    return Array.from(result.data)
  } catch (error) {
    err('[semantic-search] Error generating embedding:', error)
    throw error
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 */
async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const model = await loadEmbeddingModel()
    log('[semantic-search] Generating embeddings for', texts.length, 'texts')

    // Process in batches to avoid memory issues
    const batchSize = 10
    const embeddings: number[][] = []

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(text => generateEmbedding(text))
      )
      embeddings.push(...results)

      log('[semantic-search] Processed batch', Math.floor(i / batchSize) + 1, 'of', Math.ceil(texts.length / batchSize))
    }

    log('[semantic-search] Generated', embeddings.length, 'embeddings')
    return embeddings
  } catch (error) {
    err('[semantic-search] Error generating batch embeddings:', error)
    throw error
  }
}

// Offscreen component - runs in the offscreen document
const Offscreen = () => {
  useEffect(() => {
    log('[semantic-search] Offscreen embedding worker initialized')

    // Listen for messages from the background script
    const handleMessage = (message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      // Only handle messages targeted to offscreen
      if (message?.target !== 'offscreen') return false

      if (message.type === 'LOAD_EMBEDDING_MODEL') {
        loadEmbeddingModel()
          .then(() => {
            sendResponse({ success: true })
          })
          .catch((error) => {
            sendResponse({ success: false, error: error.message })
          })
        return true // Keep message channel open for async response
      }

      if (message.type === 'GENERATE_EMBEDDING') {
        generateEmbedding(message.text)
          .then((embedding) => {
            sendResponse({ success: true, embedding })
          })
          .catch((error) => {
            sendResponse({ success: false, error: error.message })
          })
        return true // Keep message channel open for async response
      }

      if (message.type === 'BATCH_GENERATE_EMBEDDINGS') {
        generateBatchEmbeddings(message.texts)
          .then((embeddings) => {
            sendResponse({ success: true, embeddings })
          })
          .catch((error) => {
            sendResponse({ success: false, error: error.message })
          })
        return true // Keep message channel open for async response
      }

      // Cache operations
      if (message.type === 'GET_CACHED_EMBEDDINGS') {
        (async () => {
          try {
            log('[offscreen] Getting cached embeddings for URL:', message.url)
            const cache = getCacheInstance()
            const cachedEmbeddings = await cache.getCachedEmbeddings(message.url, message.segments)

            if (cachedEmbeddings) {
              log('[offscreen] ✅ Found cached embeddings, returning to caller')
            } else {
              log('[offscreen] ❌ No cached embeddings found')
            }

            sendResponse({ success: true, cachedEmbeddings })
          } catch (error) {
            err('[offscreen] ❌ Error getting cached embeddings:', error)
            sendResponse({ success: false, error: error.message, cachedEmbeddings: null })
          }
        })()
        return true
      }

      if (message.type === 'CACHE_EMBEDDINGS') {
        (async () => {
          try {
            log('[offscreen] 💾 Caching embeddings for URL:', message.url)
            log('[offscreen] Received', message.embeddings?.length, 'embeddings for', message.segments?.length, 'segments')

            const cache = getCacheInstance()
            await cache.cacheEmbeddings(message.url, message.segments, message.embeddings)

            log('[offscreen] ✅ Successfully cached embeddings')
            sendResponse({ success: true })
          } catch (error) {
            err('[offscreen] ❌ Error caching embeddings:', error)
            sendResponse({ success: false, error: error.message })
          }
        })()
        return true
      }

      if (message.type === 'GET_CACHE_STATS') {
        (async () => {
          try {
            const cache = getCacheInstance()
            const stats = await cache.getCacheStats()

            log('[offscreen] 📊 Cache stats:', stats)
            sendResponse({ success: true, stats })
          } catch (error) {
            err('[offscreen] ❌ Error getting cache stats:', error)
            sendResponse({ success: false, error: error.message })
          }
        })()
        return true
      }

      if (message.type === 'CLEAR_ALL_CACHE') {
        (async () => {
          try {
            const cache = getCacheInstance()
            await cache.clearAllCachedEmbeddings()

            log('[offscreen] 🗑️ Cleared all cached embeddings')
            sendResponse({ success: true })
          } catch (error) {
            err('[offscreen] ❌ Error clearing cache:', error)
            sendResponse({ success: false, error: error.message })
          }
        })()
        return true
      }

      if (message.type === 'CLEANUP_CACHE') {
        (async () => {
          try {
            const cache = getCacheInstance()
            await cache.cleanupExpiredEntries()

            log('[offscreen] 🧹 Cleaned up expired cache entries')
            sendResponse({ success: true })
          } catch (error) {
            err('[offscreen] ❌ Error cleaning up cache:', error)
            sendResponse({ success: false, error: error.message })
          }
        })()
        return true
      }

      return false
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  return null
}

export default Offscreen

