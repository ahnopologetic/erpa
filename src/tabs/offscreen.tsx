import { useEffect, useRef } from "react"
import { countRows, getDB, initSchema } from "~lib/db"
import { log, err } from "~lib/log"
import { EmbeddingCache } from "~lib/semantic-search/cache"

// Embedding model management
let embeddingModel: any = null
let modelLoadingPromise: Promise<any> | null = null

// Cache instance (initialized after db is ready)
let cacheInstance: EmbeddingCache | null = null

/**
 * Helper to wait for setup completion with timeout
 */
async function waitForSetup(setupComplete: React.MutableRefObject<boolean>): Promise<boolean> {
  if (setupComplete.current) return true

  log('[offscreen] ⏳ Waiting for database setup to complete...')
  const startTime = Date.now()
  while (!setupComplete.current && Date.now() - startTime < 10000) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return setupComplete.current
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

// Global debugging interface for devtools
declare global {
  interface Window {
    erpaDebug: {
      // Database operations
      getDbStats: () => Promise<any>
      queryDb: (sql: string, params?: any[]) => Promise<any>
      getCachedPages: () => Promise<any>

      // Cache operations
      getCacheStats: () => Promise<any>
      clearCache: (url?: string) => Promise<any>
      getCachedEmbeddings: (url: string) => Promise<any>
      getCachedEmbeddingsByUrl: (url: string) => Promise<any>

      // Model operations
      loadModel: () => Promise<any>
      generateEmbedding: (text: string) => Promise<any>
      generateBatchEmbeddings: (texts: string[]) => Promise<any>

      // Utility functions
      getSetupStatus: () => any
      resetDatabase: () => Promise<any>
      exportData: () => Promise<any>
    }
  }
}

// Offscreen component - runs in the offscreen document
const Offscreen = () => {
  const initailizing = useRef(false)
  const setupComplete = useRef(false)
  const worker = useRef(null)
  const db = useRef(null)

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
            // Wait for setup to complete
            if (!(await waitForSetup(setupComplete))) {
              err('[offscreen] ❌ Timeout waiting for database setup')
              sendResponse({ success: false, error: 'Database setup timeout', cachedEmbeddings: null })
              return
            }

            if (!cacheInstance) {
              err('[offscreen] ❌ Cache not initialized')
              sendResponse({ success: false, error: 'Cache not initialized', cachedEmbeddings: null })
              return
            }

            log('[offscreen] Getting cached embeddings for URL:', message.url)
            const cachedEmbeddings = await cacheInstance.getCachedEmbeddings(message.url, message.segments)

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

      if (message.type === 'GET_CACHED_EMBEDDINGS_BY_URL') {
        (async () => {
          try {
            // Wait for setup to complete
            if (!(await waitForSetup(setupComplete))) {
              err('[offscreen] ❌ Timeout waiting for database setup')
              sendResponse({ success: false, error: 'Database setup timeout', cachedEmbeddings: null })
              return
            }

            if (!cacheInstance) {
              err('[offscreen] ❌ Cache not initialized')
              sendResponse({ success: false, error: 'Cache not initialized', cachedEmbeddings: null })
              return
            }

            log('[offscreen] Getting cached embeddings by URL only:', message.url)
            const cachedEmbeddings = await cacheInstance.getCachedEmbeddingsByUrl(message.url)

            if (cachedEmbeddings) {
              log('[offscreen] ✅ Found cached embeddings by URL, returning to caller')
            } else {
              log('[offscreen] ❌ No cached embeddings found for URL')
            }

            sendResponse({ success: true, cachedEmbeddings })
          } catch (error) {
            err('[offscreen] ❌ Error getting cached embeddings by URL:', error)
            sendResponse({ success: false, error: error.message, cachedEmbeddings: null })
          }
        })()
        return true
      }


      if (message.type === 'CACHE_EMBEDDINGS') {
        (async () => {
          try {
            // Wait for setup to complete
            if (!(await waitForSetup(setupComplete))) {
              err('[offscreen] ❌ Timeout waiting for database setup')
              sendResponse({ success: false, error: 'Database setup timeout' })
              return
            }

            if (!cacheInstance) {
              err('[offscreen] ❌ Cache not initialized')
              sendResponse({ success: false, error: 'Cache not initialized' })
              return
            }

            log('[offscreen] 💾 Caching embeddings for URL:', message.url)
            log('[offscreen] Received', message.embeddings?.length, 'embeddings for', message.segments?.length, 'segments')

            await cacheInstance.cacheEmbeddings(message.url, message.segments, message.embeddings)

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
            if (!(await waitForSetup(setupComplete))) {
              err('[offscreen] ❌ Timeout waiting for database setup')
              sendResponse({ success: false, error: 'Database setup timeout' })
              return
            }

            if (!cacheInstance) {
              err('[offscreen] ❌ Cache not initialized')
              sendResponse({ success: false, error: 'Cache not initialized' })
              return
            }

            const stats = await cacheInstance.getCacheStats()

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
            if (!(await waitForSetup(setupComplete))) {
              err('[offscreen] ❌ Timeout waiting for database setup')
              sendResponse({ success: false, error: 'Database setup timeout' })
              return
            }

            if (!cacheInstance) {
              err('[offscreen] ❌ Cache not initialized')
              sendResponse({ success: false, error: 'Cache not initialized' })
              return
            }

            await cacheInstance.clearAllCachedEmbeddings()

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
            if (!(await waitForSetup(setupComplete))) {
              err('[offscreen] ❌ Timeout waiting for database setup')
              sendResponse({ success: false, error: 'Database setup timeout' })
              return
            }

            if (!cacheInstance) {
              err('[offscreen] ❌ Cache not initialized')
              sendResponse({ success: false, error: 'Cache not initialized' })
              return
            }

            await cacheInstance.cleanupExpiredEntries()

            log('[offscreen] 🧹 Cleaned up expired cache entries')
            sendResponse({ success: true })
          } catch (error) {
            err('[offscreen] ❌ Error cleaning up cache:', error)
            sendResponse({ success: false, error: error.message })
          }
        })()
        return true
      }

      // Debug message handlers
      if (message.type === 'DEBUG_GET_DB_STATS') {
        (async () => {
          try {
            if (!(await waitForSetup(setupComplete))) {
              err('[offscreen] ❌ Timeout waiting for database setup')
              sendResponse({ success: false, error: 'Database setup timeout' })
              return
            }

            if (!db.current) {
              err('[offscreen] ❌ Database not initialized')
              sendResponse({ success: false, error: 'Database not initialized' })
              return
            }

            const cachedPagesCount = await countRows(db.current, 'cached_pages')

            const stats = {
              cachedPages: { count: cachedPagesCount, table: 'cached_pages' },
              setupComplete: setupComplete.current,
              modelLoaded: embeddingModel !== null
            }

            sendResponse({ success: true, stats })
          } catch (error) {
            err('[offscreen] ❌ Error getting DB stats:', error)
            sendResponse({ success: false, error: error.message })
          }
        })()
        return true
      }

      if (message.type === 'DEBUG_QUERY_DB') {
        (async () => {
          try {
            if (!(await waitForSetup(setupComplete))) {
              err('[offscreen] ❌ Timeout waiting for database setup')
              sendResponse({ success: false, error: 'Database setup timeout' })
              return
            }

            if (!db.current) {
              err('[offscreen] ❌ Database not initialized')
              sendResponse({ success: false, error: 'Database not initialized' })
              return
            }

            const result = await db.current.query(message.sql, message.params || [])
            sendResponse({ success: true, result })
          } catch (error) {
            err('[offscreen] ❌ Error executing query:', error)
            sendResponse({ success: false, error: error.message })
          }
        })()
        return true
      }


      if (message.type === 'DEBUG_GET_CACHED_PAGES') {
        (async () => {
          try {
            if (!(await waitForSetup(setupComplete))) {
              err('[offscreen] ❌ Timeout waiting for database setup')
              sendResponse({ success: false, error: 'Database setup timeout' })
              return
            }

            if (!db.current) {
              err('[offscreen] ❌ Database not initialized')
              sendResponse({ success: false, error: 'Database not initialized' })
              return
            }

            const result = await db.current.query(
              'SELECT url, created_at, page_data FROM cached_pages ORDER BY created_at DESC'
            )

            const pages = result.rows.map(row => ({
              url: row.url,
              created_at: row.created_at,
              sentences_count: row.page_data.sentences?.length || 0,
              embeddings_count: row.page_data.embeddings?.length || 0,
              timestamp: row.page_data.timestamp,
              pageHash: row.page_data.pageHash
            }))

            sendResponse({ success: true, pages })
          } catch (error) {
            err('[offscreen] ❌ Error getting cached pages:', error)
            sendResponse({ success: false, error: error.message })
          }
        })()
        return true
      }

      return false
    }

    const setup = async () => {
      try {
        initailizing.current = true
        db.current = await getDB()
        await initSchema(db.current)

        // Initialize cache with db instance
        cacheInstance = new EmbeddingCache(db.current)
        log('[semantic-search] Initialized cache with database instance')

        let count = await countRows(db.current, 'cached_pages')

        if (count === 0) {
          // TODO: seed the database.
          log('[semantic-search] No embeddings found in the database, seeding...')
        }
        // Get Items
        const items = await db.current.query('SELECT url, page_data FROM cached_pages')
        log('[semantic-search] Found', items.rows.length, 'cached pages in the database')

        // Mark setup as complete
        setupComplete.current = true
        log('[semantic-search] ✅ Database and cache setup complete')

        // Initialize global debugging interface
        initializeDebugInterface()
      } catch (error) {
        err('[semantic-search] ❌ Failed to setup database and cache:', error)
        setupComplete.current = false
      }
    }

    /**
     * Initialize the global debugging interface for devtools
     */
    const initializeDebugInterface = () => {
      window.erpaDebug = {
        // Database operations
        getDbStats: async () => {
          try {
            if (!db.current) throw new Error('Database not initialized')

            const cachedPagesCount = await countRows(db.current, 'cached_pages')

            const result = {
              cachedPages: {
                count: cachedPagesCount,
                table: 'cached_pages'
              },
              setupComplete: setupComplete.current,
              modelLoaded: embeddingModel !== null
            }

            console.log('📊 Database Stats:', result)
            return result
          } catch (error) {
            console.error('❌ Error getting DB stats:', error)
            throw error
          }
        },

        queryDb: async (sql: string, params: any[] = []) => {
          try {
            if (!db.current) throw new Error('Database not initialized')

            console.log('🔍 Executing SQL:', sql, 'with params:', params)
            const result = await db.current.query(sql, params)
            console.log('✅ Query result:', result)
            return result
          } catch (error) {
            console.error('❌ Error executing query:', error)
            throw error
          }
        },


        getCachedPages: async () => {
          try {
            if (!db.current) throw new Error('Database not initialized')

            const result = await db.current.query(
              'SELECT url, created_at, page_data FROM cached_pages ORDER BY created_at DESC'
            )

            const pages = result.rows.map(row => ({
              url: row.url,
              created_at: row.created_at,
              sentences_count: row.page_data.sentences?.length || 0,
              embeddings_count: row.page_data.embeddings?.length || 0,
              timestamp: row.page_data.timestamp,
              pageHash: row.page_data.pageHash
            }))

            console.log(`📄 Retrieved ${pages.length} cached pages`)
            return pages
          } catch (error) {
            console.error('❌ Error getting cached pages:', error)
            throw error
          }
        },

        // Cache operations
        getCacheStats: async () => {
          try {
            if (!cacheInstance) throw new Error('Cache not initialized')

            const stats = await cacheInstance.getCacheStats()
            console.log('📊 Cache Stats:', stats)
            return stats
          } catch (error) {
            console.error('❌ Error getting cache stats:', error)
            throw error
          }
        },

        clearCache: async (url?: string) => {
          try {
            if (!cacheInstance) throw new Error('Cache not initialized')

            if (url) {
              await cacheInstance.clearCachedEmbeddings(url)
              console.log(`🗑️ Cleared cache for URL: ${url}`)
            } else {
              await cacheInstance.clearAllCachedEmbeddings()
              console.log('🗑️ Cleared all cache')
            }

            return { success: true, clearedUrl: url || 'all' }
          } catch (error) {
            console.error('❌ Error clearing cache:', error)
            throw error
          }
        },

        getCachedEmbeddings: async (url: string) => {
          try {
            if (!cacheInstance) throw new Error('Cache not initialized')

            const result = await db.current.query(
              'SELECT page_data FROM cached_pages WHERE url = $1',
              [url]
            )

            if (result.rows.length === 0) {
              console.log(`❌ No cached embeddings found for URL: ${url}`)
              return null
            }

            const cached = result.rows[0].page_data
            console.log(`📄 Cached embeddings for ${url}:`, {
              sentences: cached.sentences?.length || 0,
              embeddings: cached.embeddings?.length || 0,
              timestamp: new Date(cached.timestamp).toISOString(),
              pageHash: cached.pageHash
            })

            return cached
          } catch (error) {
            console.error('❌ Error getting cached embeddings:', error)
            throw error
          }
        },

        getCachedEmbeddingsByUrl: async (url: string) => {
          try {
            if (!cacheInstance) throw new Error('Cache not initialized')

            const cached = await cacheInstance.getCachedEmbeddingsByUrl(url)
            
            if (cached) {
              console.log(`📄 Cached embeddings for ${url}:`, {
                sentences: cached.sentences?.length || 0,
                embeddings: cached.embeddings?.length || 0,
                timestamp: new Date(cached.timestamp).toISOString(),
                pageHash: cached.pageHash
              })
            } else {
              console.log(`❌ No cached embeddings found for URL: ${url}`)
            }

            return cached
          } catch (error) {
            console.error('❌ Error getting cached embeddings by URL:', error)
            throw error
          }
        },


        // Model operations
        loadModel: async () => {
          try {
            const model = await loadEmbeddingModel()
            console.log('✅ Model loaded successfully')
            return { success: true, model: 'Xenova/all-MiniLM-L6-v2' }
          } catch (error) {
            console.error('❌ Error loading model:', error)
            throw error
          }
        },

        generateEmbedding: async (text: string) => {
          try {
            const embedding = await generateEmbedding(text)
            console.log(`✅ Generated embedding for text: "${text.substring(0, 50)}..." (dimension: ${embedding.length})`)
            return { text, embedding, dimension: embedding.length }
          } catch (error) {
            console.error('❌ Error generating embedding:', error)
            throw error
          }
        },

        generateBatchEmbeddings: async (texts: string[]) => {
          try {
            const embeddings = await generateBatchEmbeddings(texts)
            console.log(`✅ Generated ${embeddings.length} embeddings for ${texts.length} texts`)
            return { texts, embeddings, count: embeddings.length }
          } catch (error) {
            console.error('❌ Error generating batch embeddings:', error)
            throw error
          }
        },

        // Utility functions
        getSetupStatus: () => {
          const status = {
            setupComplete: setupComplete.current,
            initializing: initailizing.current,
            dbInitialized: db.current !== null,
            cacheInitialized: cacheInstance !== null,
            modelLoaded: embeddingModel !== null,
            modelLoading: modelLoadingPromise !== null
          }

          console.log('🔧 Setup Status:', status)
          return status
        },

        resetDatabase: async () => {
          try {
            if (!db.current) throw new Error('Database not initialized')

            // Clear cached pages table
            await db.current.query('DELETE FROM cached_pages')

            console.log('🗑️ Database reset complete')
            return { success: true }
          } catch (error) {
            console.error('❌ Error resetting database:', error)
            throw error
          }
        },

        exportData: async () => {
          try {
            if (!db.current) throw new Error('Database not initialized')

            const cachedPages = await db.current.query('SELECT * FROM cached_pages')

            const exportData = {
              timestamp: new Date().toISOString(),
              cachedPages: cachedPages.rows,
              stats: {
                cachedPagesCount: cachedPages.rows.length
              }
            }

            console.log('📤 Export data prepared:', exportData.stats)
            return exportData
          } catch (error) {
            console.error('❌ Error exporting data:', error)
            throw error
          }
        }
      }

      console.log('🛠️ ERPA Debug Interface initialized!')
      console.log('Available commands:')
      console.log('- erpaDebug.getDbStats() - Get database statistics')
      console.log('- erpaDebug.queryDb(sql, params) - Execute custom SQL')
      console.log('- erpaDebug.getCachedPages() - Get cached pages')
      console.log('- erpaDebug.getCacheStats() - Get cache statistics')
      console.log('- erpaDebug.clearCache(url?) - Clear cache')
      console.log('- erpaDebug.getCachedEmbeddings(url) - Get cached embeddings for URL (legacy)')
      console.log('- erpaDebug.getCachedEmbeddingsByUrl(url) - Get cached embeddings by URL only')
      console.log('- erpaDebug.loadModel() - Load embedding model')
      console.log('- erpaDebug.generateEmbedding(text) - Generate single embedding')
      console.log('- erpaDebug.generateBatchEmbeddings(texts) - Generate batch embeddings')
      console.log('- erpaDebug.getSetupStatus() - Get setup status')
      console.log('- erpaDebug.resetDatabase() - Reset database')
      console.log('- erpaDebug.exportData() - Export all data')
      console.log('')
      console.log('💡 Quick debugging examples:')
      console.log('- erpaDebug.getSetupStatus() // Check if everything is ready')
      console.log('- erpaDebug.getDbStats() // See database counts')
      console.log('- erpaDebug.getCachedPages() // List all cached pages')
      console.log('- erpaDebug.getCachedEmbeddingsByUrl("https://example.com") // Get cache by URL')
      console.log('- erpaDebug.queryDb("SELECT * FROM cached_pages LIMIT 5") // Custom SQL')
      console.log('- erpaDebug.generateEmbedding("Hello world") // Test embedding generation')
      console.log('')
      console.log('🔍 To access from main extension context, use:')
      console.log('chrome.runtime.sendMessage({target: "offscreen", type: "DEBUG_GET_DB_STATS"})')
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    if (!db.current && !initailizing.current) {
      setup()
    }

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  return null
}

export default Offscreen

