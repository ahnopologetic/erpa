import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useState } from "react"

import { SectionHighlight } from "~components/ui/section-highlight"
import { detectSections } from "~hooks/useDetectSections"
import { err, log } from "~lib/log"
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

  const speakText = useCallback((text: string) => {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)

    utterance.onstart = () => {
      setIsPlaying(true)
      log('[TTS] TTS started:', text.substring(0, 50) + '...')
    }

    utterance.onend = () => {
      setIsPlaying(false)
      setCurrentUtterance(null)
      log('[TTS] TTS ended')
    }

    utterance.onerror = (event) => {
      err('[TTS] TTS error:', event)
      setIsPlaying(false)
      setCurrentUtterance(null)
    }

    setCurrentUtterance(utterance)
    window.speechSynthesis.speak(utterance)
  }, [])

  const handleQueueTTS = useCallback(() => {
    if (!currentCursor) {
      log('No current cursor set. Please navigate to a section first.')
      return
    }

    if (sections.length === 0) {
      log('No sections available. Please detect sections first.')
      return
    }

    if (queue.length === 0) {
      const nodes = findReadableNodesUntilNextSection(currentCursor, document)
      log('Found readable nodes:', nodes)
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
        setTimeout(() => {
          cleanup()
        }, 7000)
      }

      return newQueue
    })
  }, [currentCursor, sections, queue, speakText])

  useEffect(() => {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "GET_MAIN_CONTENT") {
        try {
          const mainEl = document.querySelector("main") as HTMLElement | null
          const scope: ParentNode = mainEl || document
          const text = (mainEl?.innerText || document.body.innerText || "").trim()

          const toCssSelector = (el: Element): string => {
            // Try ID first, but escape it properly
            if (el.id) {
              try {
                const escapedId = CSS.escape(el.id)
                return `#${escapedId}`
              } catch (error) {
                err('[Erpa] Failed to escape ID, falling back to position selector:', el.id, error)
              }
            }

            const parts: string[] = []
            let cur: Element | null = el
            let guard = 0
            while (cur && guard < 20 && cur.nodeType === Node.ELEMENT_NODE) {
              const tag = cur.tagName.toLowerCase()
              let idx = 1
              let sib = cur.previousElementSibling
              while (sib) {
                if (sib.tagName.toLowerCase() === tag) idx += 1
                sib = sib.previousElementSibling
              }
              parts.unshift(`${tag}:nth-of-type(${idx})`)
              if (cur.parentElement && (cur.parentElement.matches('main') || cur.parentElement === document.body)) {
                break
              }
              cur = cur.parentElement
              guard += 1
            }
            return parts.length ? parts.join(' > ') : el.tagName.toLowerCase()
          }

          const headings: { text: string; selector: string }[] = Array.from(
            scope.querySelectorAll('h1, h2, h3, h4, h5, h6')
          ).map((h) => ({
            text: (h.textContent || '').trim(),
            selector: toCssSelector(h)
          })).filter(h => h.text.length > 0)

          // Update sections state for the highlight component
          setSections(headings.map(h => ({ title: h.text, cssSelector: h.selector })))

          sendResponse({ ok: true, text, headings })
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error)?.message || "Unknown error" })
        }
        // Indicate async response not needed; we responded synchronously
        return true
      }

      if (message?.type === "SCROLL_TO_SECTION") {
        log('[Erpa] Scrolling to section message received', message)
        const section = document.querySelector(message.selector) as HTMLElement | null
        if (section) {
          section.scrollIntoView({ behavior: "smooth" })
          log('[Erpa] Scrolled to section', section)
          setCurrentCursor(section)
          log('[Erpa] Current cursor set to:', section)
        }
      }

      if (message?.type === "SET_SECTIONS") {
        log('[Erpa] Setting sections for highlight', message.sections)
        setSections(message.sections || [])
      }

      if (message?.type === "DETECT_SECTIONS") {
        try {
          log('[Erpa] Detecting sections from DOM')
          const detectedSections = detectSections()
          log('[Erpa] Detected sections:', detectedSections)
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
        log('[READ_OUT] Reading out:', message.targetType, message.target)
        log('[READ_OUT] Queue length:', queue.length)

        const nodes = findReadableNodesUntilNextSection(currentCursor, document)
        log('[READ_OUT] Found readable nodes:', nodes)
        setQueue((prevQueue) => [...prevQueue, ...nodes])

        while (queue.length > 0) {
          log('[READ_OUT] Reading out next node')
          handleQueueTTS()
        }
      }

      if (message?.type === "GET_CONTENT") {
        try {
          log('[GET_CONTENT] Getting content for selector:', message.selector)
          const targetElement = document.querySelector(message.selector) as HTMLElement | null
          
          if (!targetElement) {
            sendResponse({ ok: false, error: `Element not found for selector: ${message.selector}` })
            return true
          }

          // Use findReadableNodesUntilNextSection to get readable content
          const nodes = findReadableNodesUntilNextSection(targetElement, document)
          log('[GET_CONTENT] Found readable nodes:', nodes)
          
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

  const handleNavigateToSection = (selector: string) => {
    try {
      const section = document.querySelector(selector) as HTMLElement | null
      if (section) {
        section.scrollIntoView({ behavior: "smooth" })
        log('[Erpa] Successfully navigated to section:', selector)
        setCurrentCursor(section)
      } else {
        err('[Erpa] Section not found for selector:', selector)
      }
    } catch (error) {
      err('Failed to navigate to section - invalid selector:', selector, error)
      if (selector.includes('h1, h2, h3, h4, h5, h6')) {
        log('[Erpa] Attempting fallback navigation for heading selector')
      }
    }
  }

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      window.speechSynthesis.pause()
      setIsPlaying(false)
      log('[TTS] TTS paused')
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume()
      setIsPlaying(true)
      log('[TTS] TTS resumed')
    }
  }, [isPlaying])

  const handleStop = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsPlaying(false)
    setCurrentUtterance(null)
    log('[TTS] TTS stopped')
  }, [])

  useEffect(() => {
    if (sections.length > 0) {
      setIsVisible(true)
    }
  }, [sections])

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel()
    }
  }, [])

  // Tab key listener for testing findReadableTextUntilNextSection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        handleQueueTTS()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [currentCursor, sections, queue, speakText])


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