import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import TtsPlayback from "~components/tts-playback"
import { SectionHighlight } from "~components/ui/section-highlight"
import { detectSections } from "~hooks/useDetectSections"
import { findReadableNodesUntilNextSection } from "~lib/debugging/readable"
import { ErpaReadableQueueManager } from "~lib/erpa-readable"
import { createFromReadableNodes } from "~lib/erpa-readable/element-factory"
import type { SectionInfo } from "~lib/erpa-readable/types"
import { debug, err, warn } from "~lib/log"

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

  // Queue manager instance
  const queueManagerRef = useRef<ErpaReadableQueueManager | null>(null)
  const [queueState, setQueueState] = useState({
    isPlaying: false,
    currentSectionIndex: 0,
    currentElement: null as any
  })

  // Initialize queue manager
  useEffect(() => {
    if (!queueManagerRef.current) {
      queueManagerRef.current = new ErpaReadableQueueManager({
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        autoProgress: true,
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
        debug('[Erpa] Scrolling to section message received', message)
        const section = document.querySelector(message.selector) as HTMLElement | null
        if (!section) {
          err('[Erpa] Section not found for selector:', message.selector)
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
            const el = document.querySelector(s.cssSelector)
            return el?.contains(targetElement) || el === targetElement
          })

          const sectionTitle = sectionIndex !== -1 ? sections[sectionIndex].title : 'Unknown Section'

          // Create ErpaReadableElements
          const elements = createFromReadableNodes(nodes, sectionIndex, sectionTitle)

          // Clear queue and enqueue new elements
          queueManagerRef.current?.clear()
          queueManagerRef.current?.enqueue(elements)

          // Start playback
          setTimeout(() => {
            queueManagerRef.current?.start()
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
    })
  }, [sections])

  // Scroll-based content refresh detection
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout

    const handleScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout)

      scrollTimeout = setTimeout(() => {
        if (sections.length === 0 || !queueManagerRef.current) return

        const scrollPosition = window.scrollY + window.innerHeight / 2
        let newSectionIndex = 0
        let closestDistance = Infinity

        sections.forEach((section, index) => {
          try {
            const element = document.querySelector(section.cssSelector) as HTMLElement
            if (element) {
              const distance = Math.abs(scrollPosition - element.offsetTop)
              if (distance < closestDistance) {
                closestDistance = distance
                newSectionIndex = index
              }
            }
          } catch (e) {
            warn('[Scroll] Error getting element:', e)
          }
        })

        if (newSectionIndex !== queueState.currentSectionIndex) {
          setQueueState(prev => ({ ...prev, currentSectionIndex: newSectionIndex }))
        }
      }, 150)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) clearTimeout(scrollTimeout)
    }
  }, [sections, queueState.currentSectionIndex])


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



  // Tab key listener for testing TTS cursor-following functionality
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        debug('[TTS] Tab key pressed')

        if (!queueManagerRef.current) return

        // If queue is empty, populate it with current section content
        if (queueManagerRef.current.elements.length === 0) {
          // Find current section element
          const currentSection = sections[queueState.currentSectionIndex]
          if (!currentSection) return

          const sectionElement = document.querySelector(currentSection.cssSelector) as HTMLElement
          if (!sectionElement) return

          // Find readable nodes from current section
          const nodes = findReadableNodesUntilNextSection(sectionElement, document)
          if (nodes.length === 0) {
            debug('[TTS] No readable content found in current section')
            return
          }

          // Create ErpaReadableElements and enqueue them
          const elements = createFromReadableNodes(nodes, queueState.currentSectionIndex, currentSection.title)
          queueManagerRef.current.enqueue(elements)

          debug('[TTS] Populated queue with', elements.length, 'elements from current section')
        }

        // If queue is already playing, don't interrupt - let it continue naturally
        // If queue is not playing, start it
        if (queueManagerRef.current.elements.length > 0 && !queueManagerRef.current.isPlaying) {
          queueManagerRef.current.start()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [sections, queueState.currentSectionIndex])

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
          isPlaying={queueState.isPlaying}
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