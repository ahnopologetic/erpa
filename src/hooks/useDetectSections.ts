import { useEffect, useState } from "react"

export interface Section {
    title: string
    cssSelector: string
    startY?: number
    endY?: number
    contentHTML?: string
}

/**
 * Checks if a DOM node is likely part of the main content.
 */
function isContentNode(node: Element | null): boolean {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;

    const tag = node.tagName.toLowerCase();
    if (['script', 'nav', 'footer', 'header', 'aside', 'form', 'style'].includes(tag)) return false;
    if (typeof node.className === "string" && node.className.match(/(ad|banner|cookie|promo|nav)/i)) return false;
    // Some elements may not have visual dimensions
    if (
        "offsetHeight" in node &&
        "offsetWidth" in node &&
        (node as HTMLElement).offsetHeight === 0
    ) return false;
    if ("offsetWidth" in node && (node as HTMLElement).offsetWidth === 0) return false;
    return true;
}

function generateUniqueSelector(el: Element | null): string {
    if (!el) return '';
    const path: string[] = [];
    let element: Element | null = el;

    while (element && element.nodeType === Node.ELEMENT_NODE && element.tagName.toLowerCase() !== 'body') {
        let selector = element.nodeName.toLowerCase();
        if (element.id) {
            selector += `#${element.id}`;
            path.unshift(selector);
            break;
        }
        if (element.className && typeof element.className === 'string') {
            selector += '.' + element.className.trim().replace(/\s+/g, '.');
        }
        // Find sibling index among element node siblings
        const parent = element.parentNode as Element | null;
        let siblingIndex = 1;
        if (parent) {
            const children = Array.from(parent.children);
            siblingIndex = children.indexOf(element) + 1;
        }
        selector += `:nth-child(${siblingIndex})`;
        path.unshift(selector);
        element = element.parentElement;
    }
    return path.join(' > ');
}

/**
 * Extracts HTML content between two elements (exclusive).
 */
function extractContentBetween(startEl: Element, endEl: Element | undefined | null): string {
    const content: string[] = [];
    let node = startEl.nextElementSibling;
    while (node && node !== endEl) {
        if (isContentNode(node)) content.push((node as HTMLElement).outerHTML);
        node = node.nextElementSibling;
    }
    return content.join('\n');
}

/**
 * Finds semantic sections based on headings in the DOM.
 */
export function detectSemanticSections(): Array<{
    title: string
    cssSelector: string
    startY: number
    endY: number
    contentHTML: string
}> {
    const headingTags = 'h1,h2,h3,h4,h5,h6';
    const headings = Array.from(document.body.querySelectorAll(headingTags)) as HTMLElement[];

    return headings.map((h, idx) => {
        const nextHeading = headings[idx + 1];
        const startY = h.getBoundingClientRect().top + window.scrollY;
        const endY =
            nextHeading
                ? nextHeading.getBoundingClientRect().top + window.scrollY
                : document.body.scrollHeight;
        return {
            title: (h.textContent || '').replace('[edit]', '').trim() || `Section ${idx + 1}`,
            cssSelector: h.id ? `#${h.id}` : generateUniqueSelector(h),
            startY,
            endY,
            contentHTML: extractContentBetween(h, nextHeading)
        };
    });
}

/**
 * Detects visually distinct clusters (sections) of content blocks.
 */
export function detectVisualClusters(): Array<{
    title: string
    cssSelector: string
    startY: number
    endY: number
    contentHTML: string
}> {
    const candidateBlocks = Array.from(document.body.querySelectorAll('p, div, article, section')).filter(isContentNode);
    if (candidateBlocks.length === 0) return [];
    const rects = candidateBlocks.map(el => ({ el: el as HTMLElement, rect: el.getBoundingClientRect() }));
    rects.sort((a, b) => a.rect.top - b.rect.top);

    const visualSections: typeof rects[] = [];
    let cluster: typeof rects = [rects[0]];

    for (let i = 1; i < rects.length; i++) {
        const gap = rects[i].rect.top - rects[i - 1].rect.bottom;
        if (gap > 80) {
            visualSections.push(cluster as typeof rects);
            cluster = [];
        }
        cluster.push(rects[i]);
    }
    visualSections.push(cluster);

    return visualSections
        .filter(c => c.length > 0)
        .map((c, idx) => ({
            title: `Visual Cluster ${idx + 1}`,
            cssSelector: '', // could be improved in the future
            startY: c[0].rect.top + window.scrollY,
            endY: c[c.length - 1].rect.bottom + window.scrollY,
            contentHTML: c.map(e => e.el.outerHTML).join('\n')
        }));
}

/**
 * Merges semantic and visual sections, avoiding overlapping regions.
 */
export function mergeSections<T extends { startY: number, endY: number }>(
    semantic: T[],
    visual: T[]
): T[] {
    const merged = [...semantic];
    visual.forEach(v => {
        const overlap = semantic.some(s => !(v.endY < s.startY || v.startY > s.endY));
        if (!overlap) merged.push(v);
    });
    merged.sort((a, b) => a.startY - b.startY);
    return merged;
}

export function detectSections(): Section[] {
    const semanticSections = detectSemanticSections();
    const visualClusters = detectVisualClusters();
    return mergeSections(semanticSections, visualClusters);
}

const useDetectSections = () => {
    const [sections, setSections] = useState<Section[]>([]);
    // Users can call detectSections() directly if needed
    useEffect(() => {
        setSections(detectSections());
    }, []);
    return { sections, detectSections };
}

export default useDetectSections;