import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useState, useRef } from "react"

import { SectionHighlight } from "~components/ui/section-highlight"
import { detectSections } from "~hooks/useDetectSections"
import { debug, err, log, warn } from "~lib/log"
import { findReadableNodesUntilNextSection } from "~lib/debugging/readable"
import { highlightCursorPosition, highlightNode } from "~lib/utils"
import TtsPlayback from "~components/tts-playback"

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

const PlasmoOverlay = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [sections, setSections] = useState<Array<{ title: string; cssSelector: string }>>([])

  const [currentCursor, setCurrentCursor] = useState<HTMLElement | null>(null)
  const [queue, setQueue] = useState<HTMLElement[]>([])

  // TTS state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentUtterance, setCurrentUtterance] = useState<SpeechSynthesisUtterance | null>(null)
  const [currentCleanup, setCurrentCleanup] = useState<(() => void) | null>(null)

  // Section-aware TTS state
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [isAutoProgressing, setIsAutoProgressing] = useState(false)

  // Ref to avoid circular dependency
  const handleQueueTTSRef = useRef<() => void>()


  const handleNavigateToSection = useCallback((selector: string) => {
    debug('[NavigateToSection] Navigating to section:', selector)
    try {
      const section = document.querySelector(selector) as HTMLElement | null
      if (section) {
        section.scrollIntoView({ behavior: "smooth" })
        debug('[Navigate] Successfully navigated to section:', selector)
        setCurrentCursor(section)

        // Update current section index
        const sectionIndex = sections.findIndex(s => s.cssSelector === selector)
        if (sectionIndex !== -1) {
          setCurrentSectionIndex(sectionIndex)
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

  const speakText = useCallback((text: string) => {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)

    utterance.onstart = () => {
      setIsPlaying(true)
      debug('[TTS] TTS started:', text.substring(0, 50) + '...')
    }

    utterance.onend = () => {
      setIsPlaying(false)
      setCurrentUtterance(null)
      if (currentCleanup) {
        currentCleanup()
        setCurrentCleanup(null)
      }
      debug('[TTS] TTS ended')

      // Auto-continue to next section if queue is empty
      setTimeout(() => {
        if (queue.length === 0 && handleQueueTTSRef.current) {
          debug('[TTS] Queue is empty after TTS ended, checking for auto-progression')
          handleQueueTTSRef.current()
        }
      }, 100)
    }

    utterance.onerror = (event) => {
      err('[TTS] TTS error:', event)
      setIsPlaying(false)
      setCurrentUtterance(null)
      if (currentCleanup) {
        currentCleanup()
        setCurrentCleanup(null)
      }
    }

    setCurrentUtterance(utterance)
    window.speechSynthesis.speak(utterance)
  }, [currentCleanup, queue])

  const handleQueueTTS = useCallback(() => {
    if (!currentCursor) {
      debug('No current cursor set. Please navigate to a section first.')
      return
    }

    if (sections.length === 0) {
      debug('No sections available. Please detect sections first.')
      return
    }

    if (queue.length === 0) {
      const nodes = findReadableNodesUntilNextSection(currentCursor, document)
      debug('Found readable nodes:', nodes)

      if (nodes.length === 0) {
        // No more readable content in current section, try to auto-progress to next section
        debug('[TTS] No more readable content in current section, attempting auto-progression')

        const nextSectionIndex = currentSectionIndex + 1
        if (nextSectionIndex >= sections.length) {
          debug('[TTS] Reached end of document, no more sections to progress to')
          return
        }

        debug('[TTS] Auto-progressing to next section:', sections[nextSectionIndex]?.title)
        setIsAutoProgressing(true)

        // Navigate to next section
        const nextSection = sections[nextSectionIndex]
        if (nextSection) {
          handleNavigateToSection(nextSection.cssSelector)
          setCurrentSectionIndex(nextSectionIndex)

          // Clear current queue and find new readable content
          setQueue([])

          // Small delay to allow scroll animation to complete, then find new content
          setTimeout(() => {
            const nextCursor = document.querySelector(nextSection.cssSelector) as HTMLElement
            if (nextCursor) {
              setCurrentCursor(nextCursor)
              const nodes = findReadableNodesUntilNextSection(nextCursor, document)
              debug('[TTS] Found readable nodes in next section:', nodes)
              if (nodes.length > 0) {
                setQueue(nodes)
                // Continue TTS with new content
                setTimeout(() => handleQueueTTS(), 100)
              }
            }
            setIsAutoProgressing(false)
          }, 1000) // Wait for scroll animation
        }
        return
      }

      setQueue((prevQueue) => [...prevQueue, ...nodes])
      return
    }

    setQueue((prevQueue) => {
      const newQueue = [...prevQueue]
      const readableNode = newQueue.shift()

      if (readableNode) {
        setCurrentCursor(readableNode)

        // Read out loud with TTS
        const text = (readableNode.textContent || '').trim()
        if (text) {
          speakText(text)
        }

        // Highlight the node while speaking
        const cleanup = highlightNode(readableNode)
        setCurrentCleanup(() => cleanup)
      }

      return newQueue
    })
  }, [currentCursor, sections, queue, speakText, currentSectionIndex, handleNavigateToSection])

  // Set the ref to avoid circular dependency
  useEffect(() => {
    handleQueueTTSRef.current = handleQueueTTS
  }, [handleQueueTTS])

  useEffect(() => {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SCROLL_TO_SECTION") {
        debug('[Erpa] Scrolling to section message received', message)
        const section = document.querySelector(message.selector) as HTMLElement | null
        if (!section) {
          err('[Erpa] Section not found for selector:', message.selector)
          sendResponse({ ok: false, error: `Section not found for selector: ${message.selector}` })
          return false
        }
        section.scrollIntoView({ behavior: "smooth" })
        setCurrentCursor(section)
        sendResponse({ ok: true })
        return true
      }

      if (message?.type === "SET_SECTIONS") {
        debug('[Erpa] Setting sections for highlight', message.sections)
        setSections(message.sections || [])
        // Reset auto-progression state when sections are updated
        setIsAutoProgressing(false)
        setCurrentSectionIndex(0)
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
          const nodes = findReadableNodesUntilNextSection(currentCursor, document)
          sendResponse({ ok: true, nodes: nodes })
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error)?.message || "Unknown error" })
        }
      }

      if (message?.type === "READ_OUT") {
        debug('[READ_OUT] Reading out:', message.targetType, message.target)
        debug('[READ_OUT] Queue length:', queue.length)

        const nodes = findReadableNodesUntilNextSection(currentCursor, document)
        debug('[READ_OUT] Found readable nodes:', nodes)
        setQueue((prevQueue) => [...prevQueue, ...nodes])

        while (queue.length > 0) {
          debug('[READ_OUT] Reading out next node')
          handleQueueTTS()
        }
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
    })
  }, [currentCursor, queue, handleQueueTTS])

  // Scroll-based content refresh detection
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout

    const handleScroll = () => {
      // Clear existing timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }

      // Debounce scroll events
      scrollTimeout = setTimeout(() => {
        if (sections.length === 0) return

        // Find the currently visible section based on scroll position
        const scrollPosition = window.scrollY + window.innerHeight / 2
        let newSectionIndex = 0
        let closestDistance = Infinity

        sections.forEach((section, index) => {
          let element: HTMLElement | null = null
          try {
            element = document.querySelector(section.cssSelector) as HTMLElement
          } catch (e) {
            warn('[TTS] Error getting element for section:', e)
            return
          }
          if (element) {
            const elementTop = element.offsetTop
            const distance = Math.abs(scrollPosition - elementTop)
            if (distance < closestDistance) {
              closestDistance = distance
              newSectionIndex = index
            }
          }
        })

        // If user scrolled to a different section, refresh the content
        if (newSectionIndex !== currentSectionIndex && !isAutoProgressing) {
          debug('[TTS] User scrolled to new section, refreshing content:', sections[newSectionIndex]?.title)

          setCurrentSectionIndex(newSectionIndex)

          // Find the new section element and update cursor
          const newSection = sections[newSectionIndex]
          if (newSection) {
            const newCursor = document.querySelector(newSection.cssSelector) as HTMLElement
            if (newCursor) {
              setCurrentCursor(newCursor)

              // Refresh the readable content queue
              const nodes = findReadableNodesUntilNextSection(newCursor, document)
              debug('[TTS] Refreshed readable nodes after scroll:', nodes)
              setQueue(nodes)

              // If TTS was playing, restart with new content
              if (isPlaying) {
                handleQueueTTS()
              }
            }
          }
        }
      }, 150) // Debounce delay
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }
    }
  }, [sections, currentSectionIndex, isAutoProgressing, isPlaying, handleQueueTTS])


  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      window.speechSynthesis.pause()
      setIsPlaying(false)
      debug('[TTS] TTS paused')
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume()
      setIsPlaying(true)
      debug('[TTS] TTS resumed')
    }
  }, [isPlaying])

  const handleStop = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsPlaying(false)
    setCurrentUtterance(null)
    setIsAutoProgressing(false) // Stop auto-progression
    if (currentCleanup) {
      currentCleanup()
      setCurrentCleanup(null)
    }
    debug('[TTS] TTS stopped')
  }, [currentCleanup])

  useEffect(() => {
    if (sections.length > 0) {
      setIsVisible(true)
    }
  }, [sections])

  // Cleanup TTS on unmount and handle section changes
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel()
      setIsAutoProgressing(false)
    }
  }, [])

  // Reset auto-progression state when sections change
  useEffect(() => {
    if (sections.length > 0) {
      setIsAutoProgressing(false)
      setCurrentSectionIndex(0)
    }
  }, [sections])


  // Tab key listener for testing TTS cursor-following functionality
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        debug('[TTS] Tab key pressed - triggering TTS queue processing')
        handleQueueTTS()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleQueueTTS])

  return (
    <div
      className={`pointer-events-none z-[-9999] flex fixed top-0 right-0 w-full h-full transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 hidden'}`}
      id="erpa-overlay"
    >
      <SectionHighlight
        sections={sections}
        onNavigateToSection={handleNavigateToSection}
      />

      <div className="pointer-events-auto z-10 absolute bottom-2 left-1/2 transform -translate-x-1/2 w-48 h-12 flex justify-center items-end">
        <TtsPlayback
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onStop={handleStop}
          className="w-full h-full border-2 border-white backdrop-blur-xl bg-black/20 rounded-lg py-2 px-4 flex items-center justify-center"
        />
      </div>
    </div>
  )
}

export default PlasmoOverlay

// Handle requests from extension UI (e.g., sidepanel) to fetch the page's main content