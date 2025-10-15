import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { log } from "./log"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Highlights a DOM node with a visual indicator to show cursor position.
 * For element nodes: applies a focus ring/border
 * For text nodes: wraps with background highlight
 * 
 * @param node - The DOM node to highlight
 * @param options - Customization options
 * @returns Cleanup function to remove the highlight
 */
export function highlightNode(
    node: Node | null,
    options: {
        color?: string
        ringWidth?: string
        backgroundColor?: string
        textDecoration?: boolean
    } = {}
): () => void {
    if (!node) {
        return () => { }
    }

    const {
        color = "#3b82f6", // blue-500
        ringWidth = "2px",
        backgroundColor = "rgba(59, 130, 246, 0.15)", // blue-500 with opacity
        textDecoration = true
    } = options

    // Handle text nodes
    if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text
        const parent = textNode.parentNode

        if (!parent) {
            return () => { }
        }

        // Create a wrapper span to highlight the text
        const wrapper = document.createElement("span")
        wrapper.style.cssText = `
            background-color: ${backgroundColor};
            ${textDecoration ? `text-decoration: underline;` : ''}
            text-decoration-color: ${color};
            text-decoration-thickness: ${ringWidth};
            border-radius: 2px;
            padding: 0 2px;
            transition: all 0.2s ease-in-out;
        `
        wrapper.setAttribute("data-highlight-wrapper", "true")

        // Wrap the text node
        parent.insertBefore(wrapper, textNode)
        wrapper.appendChild(textNode)

        // Cleanup function
        return () => {
            if (wrapper.parentNode) {
                wrapper.parentNode.insertBefore(textNode, wrapper)
                wrapper.remove()
            }
        }
    }

    // Handle element nodes
    if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement

        // Store original styles
        const originalOutline = element.style.outline
        const originalOutlineOffset = element.style.outlineOffset
        const originalBoxShadow = element.style.boxShadow
        const originalTransition = element.style.transition

        // Apply highlight styles
        element.style.outline = `${ringWidth} solid ${color}`
        element.style.outlineOffset = "2px"
        element.style.boxShadow = `0 0 0 4px ${backgroundColor}`
        element.style.transition = "all 0.2s ease-in-out"
        element.setAttribute("data-highlighted", "true")

        // Cleanup function
        return () => {
            element.style.outline = originalOutline
            element.style.outlineOffset = originalOutlineOffset
            element.style.boxShadow = originalBoxShadow
            element.style.transition = originalTransition
            element.removeAttribute("data-highlighted")
        }
    }

    return () => { }
}

/**
 * Highlights the current cursor position in the DOM.
 * Automatically detects the node at the cursor and applies appropriate highlighting.
 * 
 * @param options - Customization options for the highlight
 * @returns Cleanup function to remove the highlight
 */
export function highlightCursorPosition(
    options?: Parameters<typeof highlightNode>[1]
): () => void {
    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0) {
        return () => { }
    }

    const range = selection.getRangeAt(0)
    const node = range.startContainer

    return highlightNode(node, options)
}