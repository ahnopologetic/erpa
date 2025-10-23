import { useEffect } from "react"
import { log, err } from "~lib/log"

// Embedding model management
let embeddingModel: any = null
let modelLoadingPromise: Promise<any> | null = null

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
        
        // Convert to regular array
        const embedding = Array.from(result.data)
        log('[semantic-search] Generated embedding with dimension:', embedding.length)
        
        return embedding
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

