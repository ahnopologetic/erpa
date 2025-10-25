import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import TtsPlayback from "~components/tts-playback"
import { SectionHighlight } from "~components/ui/section-highlight"
import { SearchBar } from "~components/ui/search-bar"
import { SentenceHighlight, useSentenceHighlight } from "~components/ui/sentence-highlight"
import { detectSections } from "~hooks/useDetectSections"
import useSpeechRecognition from "~hooks/useSpeechRecognition"
import { findReadableNodesUntilNextSection } from "~lib/debugging/readable"
import { ErpaReadableQueueManager } from "~lib/erpa-readable"
import { createFromReadableNodes } from "~lib/erpa-readable/element-factory"
import { SemanticSearchEngine } from "~lib/semantic-search/search-engine"
import type { SectionInfo } from "~lib/erpa-readable/types"
import { debug, err, log, warn } from "~lib/log"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

/**
 * Generates a style element with adjusted CSS to work correctly within a Shadow DOM.
 *
 * Tailwind CSS relies on `rem` units, which are based on the root font size (typically defined on the <html>
 * or <body> element). However, in a Shadow DOM (as used by Plasmo), there is no native root element, so the
 * rem values would reference the actual page's root font size—often leading to sizing inconsistencies.
 *
 * To address this, we:
 * 1. Replace the `:root` selector with `:host(plasmo-csui)` to properly scope the styles within the Shadow DOM.
 * 2. Convert all `rem` units to pixel values using a fixed base font size, ensuring consistent styling
 *    regardless of the host page's font size.
 */
export const getStyle = (): HTMLStyleElement => {
  const baseFontSize = 16

  let updatedCssText = cssText.replaceAll(":root", ":host(plasmo-csui)")
  const remRegex = /([\d.]+)rem/g
  updatedCssText = updatedCssText.replace(remRegex, (match, remValue) => {
    const pixelsValue = parseFloat(remValue) * baseFontSize

    return `${pixelsValue}px`
  })

  const styleElement = document.createElement("style")

  styleElement.textContent = updatedCssText

  return styleElement
}

/**
 * Convert existing Section format to SectionInfo format for queue manager compatibility
 */
const convertToSectionInfo = (
  sections: Array<{ title: string; cssSelector: string }>,
  document: Document
): SectionInfo[] => {
  return sections.map((section, index) => ({
    index,
    title: section.title,
    cssSelector: section.cssSelector,
    element: document.querySelector(section.cssSelector) as HTMLElement
  })).filter(s => s.element !== null)
}

const PlasmoOverlay = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [sections, setSections] = useState<Array<{ title: string; cssSelector: string }>>([])

  // Semantic search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [currentResultIndex, setCurrentResultIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [searchEngine] = useState(() => SemanticSearchEngine.getInstance())
  const { activeHighlight, highlightSentence, clearHighlight } = useSentenceHighlight()

  // Use the speech recognition hook
  const speechRecognition = useSpeechRecognition({
    onStart: () => {
      log('[Speech Recognition] Speech recognition started')
      chrome.runtime.sendMessage({
        type: "speech-recognition-started",
        target: "sidepanel"
      })
    },
    onEnd: () => {
      log('[Speech Recognition] Speech recognition ended')
      chrome.runtime.sendMessage({
        type: "speech-recognition-ended",
        target: "sidepanel"
      })
    },
    onResult: (transcript) => {
      log('[Speech Recognition] Final transcript:', transcript)
      chrome.runtime.sendMessage({
        type: "speech-recognition-result",
        transcript: transcript,
        target: "sidepanel"
      })
    },
    onError: (error) => {
      console.error('[Speech Recognition] Error:', error)
      chrome.runtime.sendMessage({
        type: "speech-recognition-error",
        error: error,
        target: "sidepanel"
      })
    },
    singleTurn: true
  })

  // Listen for sidepanel mic toggle commands
  useEffect(() => {
    const handleMessage = (message: any) => {
      log('[Content] Message received:', message)
      if (message?.type === 'toggle-mic' && message.target === 'content') {
        log('[toggle-mic] Content script received toggle-mic command, isListening:', message.isListening)
        const wasListening = speechRecognition.isListening
        speechRecognition.toggleListening()
        log('[toggle-mic] Speech recognition toggled from', wasListening, 'to', speechRecognition.isListening)
        
        // Send back the current state to the sidepanel
        chrome.runtime.sendMessage({
          type: "speech-recognition-state-update",
          isListening: speechRecognition.isListening,
          target: "sidepanel"
        })
      }

      if (message?.type === 'FOCUS_SEMANTIC_SEARCH') {
        // Focus will be handled by the SearchBar component's keyboard listener
        log('[semantic-search] Received focus semantic search command')
      }
    }

    log('[Content] Setting up message listener for sidepanel communication')
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => {
      log('[Content] Removing message listener')
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [speechRecognition])

  // Semantic search handlers
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return

    setIsSearching(true)
    setSearchQuery(query)
    clearHighlight()

    try {
      log('[semantic-search] Starting semantic search for:', query)
      const results = await searchEngine.search(query, {
        maxCandidates: 10,
        useGeminiRanking: true,
        autoPlayFirst: false
      })

      setSearchResults(results)
      setCurrentResultIndex(0)

      if (results.length > 0) {
        const firstResult = results[0]
        highlightSentence(firstResult.sentence.text, firstResult.element, firstResult.selector)
        log('[semantic-search] Highlighted first result:', firstResult.sentence.text.substring(0, 100))
      }

      log('[semantic-search] Search completed, found', results.length, 'results')
    } catch (error) {
      err('[semantic-search] Semantic search failed:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [searchEngine, highlightSentence, clearHighlight])

  const handleClearSearch = useCallback(() => {
    setSearchQuery("")
    setSearchResults([])
    setCurrentResultIndex(0)
    clearHighlight()
    log('[semantic-search] Cleared search results')
  }, [clearHighlight])

  const handleNavigateResult = useCallback((direction: 'prev' | 'next') => {
    if (searchResults.length <= 1) return

    const newIndex = direction === 'prev'
      ? (currentResultIndex - 1 + searchResults.length) % searchResults.length
      : (currentResultIndex + 1) % searchResults.length

    setCurrentResultIndex(newIndex)

    const result = searchResults[newIndex]
    highlightSentence(result.sentence.text, result.element, result.selector)
    log('[semantic-search] Navigated to result', newIndex + 1, 'of', searchResults.length)
  }, [searchResults, currentResultIndex, highlightSentence])

  const handlePlayResult = useCallback(() => {
    if (searchResults.length === 0) return

    const result = searchResults[currentResultIndex]
    if (!result) return

    try {
      // Create readable elements from the matched sentence
      const nodes = findReadableNodesUntilNextSection(result.element, document)
      if (nodes.length === 0) {
        log('[semantic-search] No readable nodes found for search result')
        return
      }

      // Find section index
      const sectionIndex = sections.findIndex(s => {
        try {
          const el = document.querySelector(s.cssSelector)
          return el?.contains(result.element) || el === result.element
        } catch (e) {
          return false
        }
      })

      const sectionTitle = sectionIndex !== -1 ? sections[sectionIndex].title : 'Search Result'

      // Create ErpaReadableElements
      const elements = createFromReadableNodes(nodes, sectionIndex, sectionTitle)

      // Clear queue and enqueue new elements
      queueManagerRef.current?.clear()
      queueManagerRef.current?.enqueue(elements)

      // Start playback with auto-progression (for semantic search)
      setTimeout(() => {
        queueManagerRef.current?.startWithAutoProgress()
      }, 100)

      log('[semantic-search] Started TTS playback for search result')
    } catch (error) {
      err('[semantic-search] Error playing search result:', error)
    }
  }, [searchResults, currentResultIndex, sections])

  // Queue manager instance
  const queueManagerRef = useRef<ErpaReadableQueueManager | null>(null)
  const [queueState, setQueueState] = useState({
    isPlaying: false,
    currentSectionIndex: 0,
    currentElement: null as any
  })

  // Focused section state - managed here instead of in SectionHighlight
  const [focusedSectionIndex, setFocusedSectionIndex] = useState(0)
  const [hasReadableContent, setHasReadableContent] = useState(false)

  // Initialize queue manager
  useEffect(() => {
    if (!queueManagerRef.current) {
      queueManagerRef.current = new ErpaReadableQueueManager({
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        autoProgress: false,
        onQueueStart: () => {
          setQueueState(prev => ({ ...prev, isPlaying: true }))
          debug('[Queue] Queue started')
        },
        onQueueEnd: () => {
          setQueueState(prev => ({ ...prev, isPlaying: false }))
          debug('[Queue] Queue ended')
        },
        onSectionChange: (index) => {
          setQueueState(prev => ({ ...prev, currentSectionIndex: index }))
          debug('[Queue] Section changed to:', index)
        },
        onError: (error, element) => {
          err('[Queue] Error:', error, 'Element:', element?.id ?? 'unknown')
        }
      })
    }

    return () => {
      queueManagerRef.current?.stop()
    }
  }, [])

  const handleNavigateToSection = useCallback((selector: string) => {
    debug('[NavigateToSection] Navigating to section:', selector)
    try {
      const section = document.querySelector(selector) as HTMLElement | null
      if (section) {
        section.scrollIntoView({ behavior: "smooth" })

        const sectionIndex = sections.findIndex(s => s.cssSelector === selector)
        if (sectionIndex !== -1 && queueManagerRef.current) {
          queueManagerRef.current.jumpToSection(sectionIndex)
        }
      } else {
        err('[Navigate] Section not found for selector:', selector)
      }
    } catch (error) {
      err('Failed to navigate to section - invalid selector:', selector, error)
      if (selector.includes('h1, h2, h3, h4, h5, h6')) {
        debug('[Navigate] Attempting fallback navigation for heading selector')
      }
    }
  }, [sections])



  useEffect(() => {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

      if (message?.type === "SCROLL_TO_SECTION") {
        debug('Scrolling to section message received', message)
        const section = document.querySelector(message.selector) as HTMLElement | null
        if (!section) {
          err('Section not found for selector:', message.selector)
          sendResponse({ ok: false, error: `Section not found for selector: ${message.selector}` })
          return false
        }
        section.scrollIntoView({ behavior: "smooth" })
        sendResponse({ ok: true })
        return true
      }

      if (message?.type === "SET_SECTIONS") {
        debug('[Erpa] Setting sections for highlight', message.sections)
        setSections(message.sections || [])
        // Reset auto-progression state when sections are updated
        setQueueState(prev => ({ ...prev, currentSectionIndex: 0 }))
      }

      if (message?.type === "DETECT_SECTIONS") {
        try {
          debug('[Erpa] Detecting sections from DOM')
          const detectedSections = detectSections()
          debug('[Erpa] Detected sections:', detectedSections)
          sendResponse({ ok: true, sections: detectedSections })
        } catch (e) {
          err('[Erpa] Failed to detect sections:', e)
          sendResponse({ ok: false, error: (e as Error)?.message || "Unknown error" })
        }
        return true
      }

      if (message?.type === "FIND_READABLE_TEXT_UNTIL_NEXT_SECTION") {
        try {
          // This handler is kept for compatibility but doesn't use currentCursor anymore
          const nodes: HTMLElement[] = []
          sendResponse({ ok: true, nodes: nodes })
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error)?.message || "Unknown error" })
        }
      }

      if (message?.type === "READ_OUT") {
        debug('[READ_OUT] Reading out:', message.targetType, message.target)

        try {
          let targetElement: HTMLElement | null = null

          if (message.targetType === 'SECTION') {
            // Find the section by name in the sections array
            const targetSection = sections.find(s => s.title === message.target)
            if (targetSection) {
              targetElement = document.querySelector(targetSection.cssSelector) as HTMLElement
              debug('[READ_OUT] Found target section element:', targetElement)
            } else {
              err('[READ_OUT] Section not found:', message.target)
              sendResponse({ ok: false, error: `Section "${message.target}" not found` })
              return true
            }
          } else if (message.targetType === 'NODE') {
            // Use the target as a CSS selector
            targetElement = document.querySelector(message.target) as HTMLElement
            debug('[READ_OUT] Found target node element:', targetElement)
          }

          if (!targetElement) {
            err('[READ_OUT] Target element not found for:', message.target)
            sendResponse({ ok: false, error: `Target element not found: ${message.target}` })
            return true
          }

          // Navigate and create readable elements
          targetElement.scrollIntoView({ behavior: "smooth" })

          const nodes = findReadableNodesUntilNextSection(targetElement, document)
          if (nodes.length === 0) {
            sendResponse({ ok: false, error: 'No readable content found' })
            return true
          }

          // Find section index
          const sectionIndex = sections.findIndex(s => {
            try {
              const el = document.querySelector(s.cssSelector)
              return el?.contains(targetElement) || el === targetElement
            } catch (e) {
              return false
            }
          })

          const sectionTitle = sectionIndex !== -1 ? sections[sectionIndex].title : 'Unknown Section'

          // Create ErpaReadableElements
          const elements = createFromReadableNodes(nodes, sectionIndex, sectionTitle)

          // Clear queue and enqueue new elements
          queueManagerRef.current?.clear()
          queueManagerRef.current?.enqueue(elements)

          // Start playback with auto-progression (for READ_OUT)
          setTimeout(() => {
            queueManagerRef.current?.startWithAutoProgress()
          }, 100)

          sendResponse({ ok: true })
        } catch (error) {
          err('[READ_OUT] Error reading out:', error)
          sendResponse({ ok: false, error: (error as Error)?.message || "Unknown error" })
        }
        return true
      }

      if (message?.type === "GET_CONTENT") {
        try {
          debug('[GET_CONTENT] Getting content for selector:', message.selector)
          const targetElement = document.querySelector(message.selector) as HTMLElement | null

          if (!targetElement) {
            sendResponse({ ok: false, error: `Element not found for selector: ${message.selector}` })
            return true
          }

          // Use findReadableNodesUntilNextSection to get readable content
          const nodes = findReadableNodesUntilNextSection(targetElement, document)
          debug('[GET_CONTENT] Found readable nodes:', nodes)

          // Extract and concatenate HTML content from each node
          const content = nodes.map(node => node.outerHTML).join('\n')

          sendResponse({ ok: true, content })
        } catch (e) {
          err('[GET_CONTENT] Error getting content:', e)
          sendResponse({ ok: false, error: (e as Error)?.message || "Unknown error" })
        }
        return true
      }

      if (message?.type === "SEMANTIC_SEARCH") {
        // Handle async semantic search
        (async () => {
          try {
            debug('[semantic-search] Performing semantic search:', message.query)

            const results = await searchEngine.search(message.query, {
              maxCandidates: 10,
              useGeminiRanking: true,
              autoPlayFirst: message.autoPlayFirst || false
            })

            if (results.length > 0) {
              const firstResult = results[0]
              highlightSentence(firstResult.sentence.text, firstResult.element, firstResult.selector)

              // Auto-play if requested
              if (message.autoPlayFirst) {
                setTimeout(() => {
                  handlePlayResult()
                }, 500)
              }
            }

            sendResponse({
              ok: true,
              results: results.map(r => ({
                text: r.sentence.text,
                score: r.score,
                confidence: r.confidence,
                answer: r.answer
              })),
              bestMatch: results[0] ? {
                text: results[0].sentence.text,
                score: results[0].score,
                confidence: results[0].confidence,
                answer: results[0].answer
              } : null,
              totalResults: results.length
            })
          } catch (e) {
            err('[semantic-search] Error performing search:', e)
            sendResponse({ ok: false, error: (e as Error)?.message || "Unknown error" })
          }
        })()
        return true // Keep message channel open for async response
      }
    })
  }, [sections, searchEngine, highlightSentence, handlePlayResult])

  // Scroll-based content refresh detection
  // Change section when the next section reaches the top 20% of the viewport
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout

    const handleScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout)

      scrollTimeout = setTimeout(() => {
        if (sections.length === 0 || !queueManagerRef.current) return

        const viewportTop = window.scrollY
        const viewportHeight = window.innerHeight
        const thresholdPosition = viewportTop + viewportHeight * 0.2 // Top 20% of viewport

        let newSectionIndex = 0

        // Start from the last section and work backwards to find the first section whose top
        // has passed the threshold position
        for (let i = sections.length - 1; i >= 0; i--) {
          try {
            const element = document.querySelector(sections[i].cssSelector) as HTMLElement
            if (element && element.offsetTop <= thresholdPosition) {
              newSectionIndex = i
              break
            }
          } catch (e) {
            warn('[Scroll] Error getting element:', e)
          }
        }

        if (newSectionIndex !== queueState.currentSectionIndex) {
          setQueueState(prev => ({ ...prev, currentSectionIndex: newSectionIndex }))
        }

        // Update focused section index
        if (newSectionIndex !== focusedSectionIndex) {
          setFocusedSectionIndex(newSectionIndex)
          
          // Reset queue manager to handle section change
          if (queueManagerRef.current) {
            queueManagerRef.current.currentSectionIndex = newSectionIndex
            // Clear existing queue elements to allow fresh start in new section
            queueManagerRef.current.clear()
            setHasReadableContent(false)
          }
        }
      }, 150)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) clearTimeout(scrollTimeout)
    }
  }, [sections, queueState.currentSectionIndex, focusedSectionIndex])


  const handlePlayPause = useCallback(() => {
    if (!queueManagerRef.current) return

    if (queueState.isPlaying) {
      queueManagerRef.current.pause()
      debug('[TTS] TTS paused')
    } else {
      queueManagerRef.current.start()
      debug('[TTS] TTS started/resumed')
    }
  }, [queueState.isPlaying])

  const handleStop = useCallback(() => {
    if (!queueManagerRef.current) return

    queueManagerRef.current.stop()
    debug('[TTS] TTS stopped')
  }, [])

  useEffect(() => {
    if (sections.length > 0) {
      setIsVisible(true)
    }
  }, [sections])

  const handleToggleMic = useCallback(() => {
    return speechRecognition.toggleListening()
  }, [speechRecognition])


  // Tab key listener for single-element navigation within sections
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        debug('[TTS] Tab key pressed - navigating to next readable element')

        if (!queueManagerRef.current) return

        const focusedSection = sections[focusedSectionIndex]
        if (!focusedSection) return

        // If queue is empty or doesn't have content for current section, populate it
        if (!hasReadableContent || queueManagerRef.current.elements.length === 0) {
          const sectionElement = document.querySelector(focusedSection.cssSelector) as HTMLElement
          if (!sectionElement) return

          // Find readable nodes from focused section
          const nodes = findReadableNodesUntilNextSection(sectionElement, document)
          if (nodes.length === 0) {
            debug('[TTS] No readable content found in focused section')
            return
          }

          // Create ErpaReadableElements and enqueue them
          const elements = createFromReadableNodes(nodes, focusedSectionIndex, focusedSection.title)
          queueManagerRef.current.clear()
          queueManagerRef.current.enqueue(elements)
          queueManagerRef.current.currentSectionIndex = focusedSectionIndex
          setHasReadableContent(true)

          debug('[TTS] Populated queue with', elements.length, 'elements from focused section')

          // Start reading the first element
          queueManagerRef.current.startCurrentSection()
          return
        }

        // Try to navigate to next element within the current section
        const navigated = queueManagerRef.current.nextInSection()
        
        if (!navigated) {
          debug('[TTS] No more elements in current section')
          // Could implement auto-advance to next section here if desired
          // For now, just log that we've reached the end of the section
        }
      }

      // If the key is ctrl + command + enter, send a message to the sidepanel to toggle the mic
      if (e.ctrlKey && e.metaKey && e.key === 'Enter') {
        e.preventDefault()
        debug('[TTS] Ctrl + Command + Enter key pressed')
        chrome.runtime.sendMessage({
          type: "toggle-mic",
          target: "sidepanel",
          isListening: speechRecognition.isListening
        })
        handleToggleMic()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [sections, focusedSectionIndex, hasReadableContent, handleToggleMic, speechRecognition.isListening])

  return (
    <div
      className={`pointer-events-none z-[-9999] flex fixed top-0 right-0 w-full h-full transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 hidden'}`}
      id="erpa-overlay"
    >
      <SectionHighlight
        sections={sections}
        onNavigateToSection={handleNavigateToSection}
        currentSectionIndex={focusedSectionIndex}
        onSectionChange={setFocusedSectionIndex}
      />

      {/* Semantic Search Bar */}
      <SearchBar
        onSearch={handleSearch}
        onClear={handleClearSearch}
        isLoading={isSearching}
        resultCount={searchResults.length}
        currentResultIndex={currentResultIndex}
        onNavigateResult={handleNavigateResult}
        onPlayResult={handlePlayResult}
        className="pointer-events-auto"
      />

      {/* Sentence Highlight */}
      {activeHighlight && (
        <SentenceHighlight
          sentence={activeHighlight.sentence}
          element={activeHighlight.element}
          selector={activeHighlight.selector}
          isActive={true}
          onPlay={handlePlayResult}
          onStop={() => queueManagerRef.current?.stop()}
          isPlaying={queueState.isPlaying}
        />
      )}

      <div className="pointer-events-auto z-10 absolute bottom-2 left-1/2 transform -translate-x-1/2 w-48 h-12 flex justify-center items-end">
        <TtsPlayback
          isListening={speechRecognition.isListening}
          isPlaying={queueState.isPlaying}
          onPlayPause={handlePlayPause}
          onStop={handleStop}
          onHandsUp={handleToggleMic}
          className="w-full h-full border-2 border-white backdrop-blur-xl bg-black/20 rounded-lg py-2 px-4 flex items-center justify-center"
        />
      </div>
    </div>
  )
}

export default PlasmoOverlay

// Expose cache debugging utilities to console
if (typeof window !== 'undefined') {
  // @ts-ignore - Global debugging utilities
  window.erpaCacheDebug = {
    async stats() {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CACHE_STATS' });
      if (response?.success) {
        console.log('📊 Semantic Search Cache Stats:');
        console.log('  Total URLs cached:', response.stats.totalUrls);
        console.log('  Total sentences:', response.stats.totalSentences);
        console.log('  Total embeddings:', response.stats.totalEmbeddings);
        if (response.stats.oldestEntry) {
          console.log('  Oldest entry:', new Date(response.stats.oldestEntry).toLocaleString());
        }
        if (response.stats.newestEntry) {
          console.log('  Newest entry:', new Date(response.stats.newestEntry).toLocaleString());
        }
        return response.stats;
      } else {
        console.error('❌ Failed to get cache stats:', response?.error);
        return null;
      }
    },
    async inspect() {
      // Directly check chrome.storage.local
      const { Storage } = await import('@plasmohq/storage');
      const storage = new Storage({ area: 'local' });
      const data = await storage.get('semantic_search_embeddings');

      if (!data) {
        console.log('❌ No cache data found in chrome.storage.local');
        console.log('   Key checked: "semantic_search_embeddings"');
        return null;
      }

      const urls = Object.keys(data);
      console.log('🔍 Direct Storage Inspection:');
      console.log('  Storage area: chrome.storage.local');
      console.log('  Cache key: "semantic_search_embeddings"');
      console.log('  URLs in cache:', urls.length);

      urls.forEach((url, i) => {
        const entry = data[url];
        console.log(`\n  [${i + 1}] URL: ${url}`);
        console.log(`      Sentences: ${entry.sentences?.length || 0}`);
        console.log(`      Embeddings: ${entry.embeddings?.length || 0}`);
        console.log(`      Hash: ${entry.pageHash}`);
        console.log(`      Age: ${Math.round((Date.now() - entry.timestamp) / 1000 / 60)} minutes`);
      });

      return data;
    },
    async clear() {
      const response = await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_CACHE' });
      if (response?.success) {
        console.log('✅ Cache cleared successfully');
        return true;
      } else {
        console.error('❌ Failed to clear cache:', response?.error);
        return false;
      }
    },
    help() {
      console.log('🔍 Erpa Cache Debug Utilities:');
      console.log('  erpaCacheDebug.stats()    - Show cache statistics');
      console.log('  erpaCacheDebug.inspect()  - Directly inspect chrome.storage.local');
      console.log('  erpaCacheDebug.clear()    - Clear all cached embeddings');
      console.log('  erpaCacheDebug.help()     - Show this help message');
    }
  };

  // Show help on load
  console.log('💡 Erpa semantic search cache debugging is available!');
  console.log('   Type "erpaCacheDebug.help()" for available commands');
}

// Handle requests from extension UI (e.g., sidepanel) to fetch the page's main content