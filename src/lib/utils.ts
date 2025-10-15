import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { log } from "./log"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Injects keyframes for gradient animation if not already present
 */
function injectGradientAnimationStyles() {
    const styleId = "erpa-gradient-highlight-styles"
    if (document.getElementById(styleId)) return

    const style = document.createElement("style")
    style.id = styleId
    style.textContent = `
        @keyframes erpa-gradient-shift {
            0% {
                background-position: 0% 50%;
            }
            50% {
                background-position: 100% 50%;
            }
            100% {
                background-position: 0% 50%;
            }
        }
        
        @keyframes erpa-pulse-glow {
            0%, 100% {
                box-shadow: 0 0 20px rgba(156, 67, 254, 0.6),
                            0 0 40px rgba(76, 194, 233, 0.4),
                            inset 0 0 20px rgba(156, 67, 254, 0.2);
            }
            50% {
                box-shadow: 0 0 30px rgba(156, 67, 254, 0.8),
                            0 0 60px rgba(76, 194, 233, 0.6),
                            inset 0 0 30px rgba(156, 67, 254, 0.3);
            }
        }
        
        @keyframes erpa-fade-in {
            from {
                opacity: 0;
                transform: scale(0.98);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }
    `
    document.head.appendChild(style)
}

/**
 * Highlights a DOM node with beautiful gradient effects.
 * For element nodes: applies gradient border and background directly
 * For text nodes: wraps with a span that has gradient effects
 * 
 * @param node - The DOM node to highlight
 * @returns Cleanup function to remove the highlight
 */
export function highlightNode(node: Node | null): () => void {
    if (!node) {
        log("highlightNode: no node provided")
        return () => { }
    }

    log("highlightNode: highlighting node", node)

    // Inject animation styles
    injectGradientAnimationStyles()

    // Handle text nodes - wrap them in a span
    if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text
        const parent = textNode.parentNode

        if (!parent) {
            log("highlightNode: text node has no parent")
            return () => { }
        }

        // Create a wrapper span with gradient effects
        const wrapper = document.createElement("span")
        wrapper.style.cssText = `
            display: inline-block;
            position: relative;
            padding: 4px 8px;
            margin: 0 2px;
            border-radius: 8px;
            background: linear-gradient(135deg, 
                rgba(156, 67, 254, 0.15) 0%, 
                rgba(76, 194, 233, 0.15) 50%, 
                rgba(16, 20, 153, 0.15) 100%);
            background-size: 200% 200%;
            animation: erpa-gradient-shift 3s ease infinite, erpa-fade-in 0.3s ease-out;
            box-shadow: 0 0 20px rgba(156, 67, 254, 0.6),
                        0 0 40px rgba(76, 194, 233, 0.4),
                        inset 0 0 20px rgba(156, 67, 254, 0.2);
            border: 2px solid transparent;
            background-clip: padding-box;
            transition: all 0.3s ease;
        `
        
        // Add gradient border effect using pseudo-element
        const borderGradient = document.createElement("span")
        borderGradient.style.cssText = `
            position: absolute;
            inset: -2px;
            border-radius: 8px;
            padding: 2px;
            background: linear-gradient(135deg, 
                #9C43FE 0%, 
                #4CC2E9 50%, 
                #101499 100%);
            background-size: 200% 200%;
            animation: erpa-gradient-shift 3s ease infinite;
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            pointer-events: none;
            z-index: -1;
        `
        wrapper.appendChild(borderGradient)
        
        wrapper.setAttribute("data-highlight-wrapper", "true")

        // Wrap the text node
        parent.insertBefore(wrapper, textNode)
        wrapper.appendChild(textNode)

        log("highlightNode: wrapped text node with gradient")

        // Cleanup function
        return () => {
            if (wrapper.parentNode) {
                wrapper.parentNode.insertBefore(textNode, wrapper)
                wrapper.remove()
                log("highlightNode: removed text node wrapper")
            }
        }
    }

    // Handle element nodes - add gradient effects
    if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement

        // Store original styles
        const originalBackground = element.style.background
        const originalBackgroundImage = element.style.backgroundImage
        const originalBackgroundSize = element.style.backgroundSize
        const originalAnimation = element.style.animation
        const originalBoxShadow = element.style.boxShadow
        const originalBorderRadius = element.style.borderRadius
        const originalTransition = element.style.transition
        const originalPosition = element.style.position
        const originalZIndex = element.style.zIndex

        // Store computed position to restore properly
        const computedPosition = getComputedStyle(element).position
        const needsPositionFix = computedPosition === 'static'

        // Apply gradient effects
        if (needsPositionFix) {
            element.style.position = "relative"
        }
        
        element.style.background = `linear-gradient(135deg, 
            rgba(156, 67, 254, 0.12) 0%, 
            rgba(76, 194, 233, 0.12) 50%, 
            rgba(16, 20, 153, 0.12) 100%)`
        element.style.backgroundSize = "200% 200%"
        element.style.animation = "erpa-gradient-shift 3s ease infinite, erpa-pulse-glow 2s ease-in-out infinite, erpa-fade-in 0.3s ease-out"
        element.style.borderRadius = element.style.borderRadius || "8px"
        element.style.transition = "all 0.3s ease"
        element.setAttribute("data-highlighted", "true")

        // Create overlay for gradient border
        const overlay = document.createElement("div")
        overlay.style.cssText = `
            position: absolute;
            inset: -3px;
            border-radius: ${element.style.borderRadius};
            background: linear-gradient(135deg, 
                #9C43FE 0%, 
                #4CC2E9 50%, 
                #101499 100%);
            background-size: 200% 200%;
            animation: erpa-gradient-shift 3s ease infinite;
            z-index: -1;
            pointer-events: none;
            opacity: 0.8;
        `
        overlay.setAttribute("data-highlight-overlay", "true")
        element.insertBefore(overlay, element.firstChild)

        log("highlightNode: highlighted element node with gradient", element)

        // Cleanup function
        return () => {
            element.style.background = originalBackground
            element.style.backgroundImage = originalBackgroundImage
            element.style.backgroundSize = originalBackgroundSize
            element.style.animation = originalAnimation
            element.style.boxShadow = originalBoxShadow
            element.style.borderRadius = originalBorderRadius
            element.style.transition = originalTransition
            element.style.zIndex = originalZIndex
            
            if (needsPositionFix) {
                element.style.position = originalPosition
            }
            
            // Remove overlay
            const overlayElement = element.querySelector('[data-highlight-overlay]')
            if (overlayElement) {
                overlayElement.remove()
            }
            
            element.removeAttribute("data-highlighted")
            log("highlightNode: removed element highlight")
        }
    }

    return () => { }
}

/**
 * Highlights the current cursor position in the DOM.
 * Automatically detects the node at the cursor and applies beautiful gradient highlight effects.
 * 
 * @returns Cleanup function to remove the highlight
 */
export function highlightCursorPosition(): () => void {
    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0) {
        log("highlightCursorPosition: no selection")
        return () => { }
    }

    const range = selection.getRangeAt(0)
    const node = range.startContainer

    log("highlightCursorPosition: cursor at node", node)

    return highlightNode(node)
}