/**
 * Factory functions for creating ErpaReadableElement instances
 */

import type { ErpaReadableElement, ErpaReadableElementFactoryOptions, ReadableElementType } from './types';

/**
 * Creates a unique ID for an element based on its DOM properties
 */
function generateElementId(node: HTMLElement, order: number): string {
    const tagName = node.tagName.toLowerCase();
    const id = node.id || `element-${order}`;
    const className = node.className ? `.${node.className.split(' ').join('.')}` : '';
    const textHash = node.textContent?.slice(0, 20).replace(/\s+/g, '-') || 'empty';

    return `${tagName}-${id}${className}-${textHash}-${order}`.replace(/[^a-zA-Z0-9-]/g, '');
}

/**
 * Determines the element type based on DOM properties
 */
function determineElementType(node: HTMLElement): ReadableElementType {
    const tagName = node.tagName.toLowerCase();
    const role = node.getAttribute('role');

    // Check for headings
    if (/^h[1-6]$/.test(tagName)) {
        return 'heading';
    }

    // Check for list items
    if (tagName === 'li') {
        return 'listitem';
    }

    // Check for table cells
    if (tagName === 'td' || tagName === 'th') {
        return 'cell';
    }

    // Check for interactive elements
    const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
    if (interactiveTags.includes(tagName)) {
        return 'control';
    }

    // Check for landmarks by role
    const landmarkRoles = ['main', 'navigation', 'complementary', 'banner', 'contentinfo', 'region', 'search'];
    if (role && landmarkRoles.includes(role)) {
        return 'landmark';
    }

    // Check for landmarks by tag
    const landmarkTags = ['main', 'nav', 'aside', 'header', 'footer', 'section', 'article'];
    if (landmarkTags.includes(tagName)) {
        return 'landmark';
    }

    // Default to paragraph for block elements
    const blockTags = ['p', 'div', 'blockquote', 'pre'];
    if (blockTags.includes(tagName)) {
        return 'paragraph';
    }

    // Fallback to static text
    return 'staticText';
}

/**
 * Extracts the heading level from a heading element
 */
function getHeadingLevel(node: HTMLElement): number | undefined {
    const tagName = node.tagName.toLowerCase();
    const match = tagName.match(/^h([1-6])$/);
    return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Creates an ErpaReadableElement from a DOM node
 */
export function createErpaReadableElement(options: ErpaReadableElementFactoryOptions): ErpaReadableElement {
    const {
        node,
        text,
        type,
        sectionIndex,
        sectionTitle,
        order,
        level,
        callbacks
    } = options;

    const elementId = generateElementId(node, order);
    const elementType = type || determineElementType(node);
    const headingLevel = level || (elementType === 'heading' ? getHeadingLevel(node) : undefined);

    return {
        id: elementId,
        node,
        text: text.trim(),
        sectionIndex,
        sectionTitle,
        isActive: false,
        isCompleted: false,
        isHighlighted: false,
        type: elementType,
        level: headingLevel,
        order,
        onStart: callbacks?.onStart,
        onEnd: callbacks?.onEnd,
        onHighlight: callbacks?.onHighlight,
        onUnhighlight: callbacks?.onUnhighlight
    };
}

/**
 * Creates multiple ErpaReadableElement instances from an array of DOM nodes
 */
export function createErpaReadableElements(
    nodes: HTMLElement[],
    sectionIndex: number,
    sectionTitle: string,
    callbacks?: {
        onStart?: () => void;
        onEnd?: () => void;
        onHighlight?: () => void;
        onUnhighlight?: () => void;
    }
): ErpaReadableElement[] {
    return nodes.map((node, index) => {
        const text = node.textContent || '';
        const type = determineElementType(node);

        return createErpaReadableElement({
            node,
            text,
            type,
            sectionIndex,
            sectionTitle,
            order: index,
            callbacks
        });
    });
}

/**
 * Creates ErpaReadableElement instances from the result of findReadableNodesUntilNextSection
 */
export function createFromReadableNodes(
    nodes: HTMLElement[],
    sectionIndex: number,
    sectionTitle: string,
    startOrder: number = 0
): ErpaReadableElement[] {
    return nodes.map((node, index) => {
        const text = node.textContent || '';
        const type = determineElementType(node);

        return createErpaReadableElement({
            node,
            text,
            type,
            sectionIndex,
            sectionTitle,
            order: startOrder + index
        });
    });
}

/**
 * Validates that an ErpaReadableElement is still valid (DOM node exists)
 */
export function validateErpaReadableElement(element: ErpaReadableElement): boolean {
    try {
        // Check if the node is still in the DOM
        if (!element.node.isConnected) {
            return false;
        }

        // Check if the text content is still accessible
        const currentText = element.node.textContent || '';
        if (currentText.trim() !== element.text.trim()) {
            // Text has changed, but element might still be valid
            console.warn(`ErpaReadableElement ${element.id} text content has changed`);
        }

        return true;
    } catch (error) {
        console.error(`ErpaReadableElement ${element.id} validation failed:`, error);
        return false;
    }
}

/**
 * Updates an ErpaReadableElement's text content if it has changed
 */
export function refreshErpaReadableElement(element: ErpaReadableElement): ErpaReadableElement {
    if (!validateErpaReadableElement(element)) {
        throw new Error(`Cannot refresh invalid element: ${element.id}`);
    }

    const newText = element.node.textContent || '';
    if (newText.trim() !== element.text.trim()) {
        return {
            ...element,
            text: newText.trim()
        };
    }

    return element;
}
