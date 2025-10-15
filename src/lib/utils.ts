import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { log } from "./log"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Highlights a DOM node with a simple red border.
 * For element nodes: applies red border directly
 * For text nodes: wraps with a span that has a red border
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

    // Handle text nodes - wrap them in a span
    if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text
        const parent = textNode.parentNode

        if (!parent) {
            log("highlightNode: text node has no parent")
            return () => { }
        }

        // Create a wrapper span with red border
        const wrapper = document.createElement("span")
        wrapper.style.border = "2px solid red"
        wrapper.style.borderRadius = "4px"
        wrapper.style.padding = "2px 4px"
        wrapper.style.display = "inline"
        wrapper.style.backgroundColor = "rgba(255, 0, 0, 0.1)"
        wrapper.setAttribute("data-highlight-wrapper", "true")

        // Wrap the text node
        parent.insertBefore(wrapper, textNode)
        wrapper.appendChild(textNode)

        log("highlightNode: wrapped text node")

        // Cleanup function
        return () => {
            if (wrapper.parentNode) {
                wrapper.parentNode.insertBefore(textNode, wrapper)
                wrapper.remove()
                log("highlightNode: removed text node wrapper")
            }
        }
    }

    // Handle element nodes - add red border
    if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement

        // Store original styles
        const originalBorder = element.style.border
        const originalBackgroundColor = element.style.backgroundColor

        // Apply red border
        element.style.border = "2px solid red !important"
        element.style.backgroundColor = "rgba(255, 0, 0, 0.1)"
        element.setAttribute("data-highlighted", "true")

        log("highlightNode: highlighted element node", element)

        // Cleanup function
        return () => {
            element.style.border = originalBorder
            element.style.backgroundColor = originalBackgroundColor
            element.removeAttribute("data-highlighted")
            log("highlightNode: removed element highlight")
        }
    }

    return () => { }
}

/**
 * Highlights the current cursor position in the DOM.
 * Automatically detects the node at the cursor and applies a red border highlight.
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