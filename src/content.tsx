import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"

import { CountButton } from "~features/count-button"

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
  return (
    <div className="plasmo-z-50 plasmo-flex plasmo-fixed plasmo-top-32 plasmo-right-8">
      <CountButton />
    </div>
  )
}

export default PlasmoOverlay

// Handle requests from extension UI (e.g., sidepanel) to fetch the page's main content
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_MAIN_CONTENT") {
    try {
      const mainEl = document.querySelector("main") as HTMLElement | null
      const scope: ParentNode = mainEl || document
      const text = (mainEl?.innerText || document.body.innerText || "").trim()

      const toCssSelector = (el: Element): string => {
        if (el.id) return `#${CSS.escape(el.id)}`
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

      sendResponse({ ok: true, text, headings })
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error)?.message || "Unknown error" })
    }
    // Indicate async response not needed; we responded synchronously
    return true
  }
})
