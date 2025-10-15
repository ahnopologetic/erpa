import type { Section } from "~hooks/useDetectSections";
import { log } from "~lib/log";

type Granularity = 'paragraph' | 'heading' | 'listitem' | 'cell' | 'control' | 'landmark';
type ReadableType = Granularity | 'staticText';

function isElement(n: Node): n is Element { return n.nodeType === Node.ELEMENT_NODE; }
function isText(n: Node): n is Text { return n.nodeType === Node.TEXT_NODE; }

function isHiddenInAX(el: Element): boolean {
    if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return true;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    // Collapse <details> content when closed:
    const details = el.closest('details');
    if (details && !details.open && !el.closest('summary')) return true;
    return false;
}

function isFocusable(el: Element): boolean {
    const focusable = (el as HTMLElement).tabIndex >= 0;
    const n = el.nodeName.toLowerCase();
    const native = ['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(n);
    return focusable || native;
}

function roleOf(el: Element): string | undefined {
    const r = el.getAttribute('role') || '';
    if (r) return r.split(/\s+/)[0];
    // Implicit roles (very partial):
    const n = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(n)) return 'heading';
    if (n === 'a' && el.hasAttribute('href')) return 'link';
    if (n === 'button') return 'button';
    if (n === 'nav') return 'navigation';
    if (n === 'main') return 'main';
    if (n === 'aside') return 'complementary';
    if (n === 'header') return 'banner';
    if (n === 'footer') return 'contentinfo';
    if (n === 'li') return 'listitem';
    if (n === 'p') return 'paragraph';
    if (n === 'td') return 'cell';
    if (n === 'th') return 'columnheader';
    return undefined;
}

function headingLevel(el: Element): number | undefined {
    const m = el.tagName.toLowerCase().match(/^h([1-6])$/);
    return m ? parseInt(m[1], 10) : undefined;
}

function accessibleName(el: Element): string {
    // Extremely simplified name computation:
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
        const name = labelledby
            .split(/\s+/)
            .map(id => document.getElementById(id)?.textContent?.trim() ?? '')
            .join(' ')
            .trim();
        if (name) return name;
    }
    // Fallback to visible text:
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function isBlockBoundary(el: Element): boolean {
    const r = roleOf(el);
    // Headings are handled separately in readableChunks, so don't treat them as paragraph boundaries
    if (r === 'paragraph' || r === 'listitem' || r === 'cell' || r === 'columnheader') return true;
    // Heuristic: display block/flow root can define paragraph runs
    const d = getComputedStyle(el).display;
    return ['block', 'list-item', 'table-cell', 'table-row', 'table', 'grid', 'flex'].includes(d);
}
/**
 * Helper function to find the next heading at the same or higher level
 */
function findNextHeadingBoundary(currentHeading: Element, root: Element): Element | null {
    const currentLevel = headingLevel(currentHeading);
    if (!currentLevel) return null;

    // Walk through all subsequent elements to find the next heading
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        {
            acceptNode: (n) => {
                if (isElement(n) && !isHiddenInAX(n)) {
                    return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_SKIP;
            }
        }
    );

    // Position walker at current heading
    walker.currentNode = currentHeading;

    // Look for next heading
    let next: Node | null;
    while ((next = walker.nextNode())) {
        if (isElement(next)) {
            const nextLevel = headingLevel(next);
            // Found a heading at same or higher level (lower number = higher level)
            if (nextLevel && nextLevel <= currentLevel) {
                return next;
            }
        }
    }

    return null; // No next heading found
}

/**
 * Create a range that spans from a heading to the next heading (section range)
 */
function createSectionRange(heading: Element, root: Element): Range {
    const rng = document.createRange();
    const nextHeading = findNextHeadingBoundary(heading, root);

    rng.setStartBefore(heading);

    if (nextHeading) {
        // End just before the next heading
        rng.setEndBefore(nextHeading);
    } else {
        // No next heading, extend to end of root
        rng.setEndAfter(root.lastChild || root);
    }

    return rng;
}

function* readableChunks(root: Element): Generator<ReadableChunk> {
    // First pass: collect all headings and their section ranges
    const headings: Element[] = [];
    const headingWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n) => {
            if (isElement(n) && !isHiddenInAX(n) && roleOf(n) === 'heading') {
                return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
        }
    });

    while (headingWalker.nextNode()) {
        headings.push(headingWalker.currentNode as Element);
    }

    // Yield all heading chunks first with their full section ranges
    for (const heading of headings) {
        const rng = createSectionRange(heading, root);
        yield {
            type: 'heading',
            role: 'heading',
            level: headingLevel(heading),
            range: rng,
            node: heading
        };
    }

    // Second pass: process everything else
    // We DON'T skip content inside sections - just let the anchor index priority handle it
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
            acceptNode: (n) => {
                if (isElement(n)) {
                    if (isHiddenInAX(n)) return NodeFilter.FILTER_REJECT;
                    // Skip headings - already processed
                    if (roleOf(n) === 'heading') return NodeFilter.FILTER_SKIP;
                    // Skip pure-presentational:
                    const r = roleOf(n);
                    if (r === 'presentation' || r === 'none') return NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let currentParagraphRange: Range | null = null;
    let currentParagraphAnchor: Node | null = null;

    function flushParagraph() {
        if (currentParagraphRange && currentParagraphAnchor) {
            const chunk: ReadableChunk = {
                type: 'paragraph',
                role: 'paragraph',
                range: currentParagraphRange.cloneRange(),
                node: currentParagraphAnchor
            };
            currentParagraphRange = null;
            currentParagraphAnchor = null;
            return chunk;
        }
        return null;
    }

    let n: Node | null = walker.currentNode;
    while ((n = walker.nextNode())) {
        if (isElement(n)) {
            const r = roleOf(n);

            // Landmarks and focusable controls get their own chunks:
            const isLandmark = r && ['main', 'navigation', 'complementary', 'banner', 'contentinfo', 'region', 'search'].includes(r);
            if (isLandmark) {
                const rng = document.createRange(); rng.selectNodeContents(n);
                yield { type: 'landmark', role: r!, range: rng, node: n };
                continue;
            }

            const isControl = r && ['link', 'button', 'checkbox', 'radio', 'switch', 'textbox', 'combobox'].includes(r);
            if (isControl || isFocusable(n)) {
                // Flush paragraph before emitting control
                const flushed = flushParagraph(); if (flushed) yield flushed;
                const rng = document.createRange(); rng.selectNodeContents(n);
                yield { type: 'control', role: r ?? 'control', name: accessibleName(n), range: rng, node: n };
                continue;
            }

            // List items, table headers/cells become their own chunks:
            if (r === 'listitem' || r === 'cell' || r === 'columnheader') {
                const flushed = flushParagraph(); if (flushed) yield flushed;
                const rng = document.createRange(); rng.selectNodeContents(n);
                yield {
                    type: (r === 'listitem' ? 'listitem' : r === 'cell' ? 'cell' : 'cell'),
                    role: r,
                    range: rng,
                    node: n
                };
                continue;
            }

            // Start a paragraph run when encountering a block boundary
            if (isBlockBoundary(n)) {
                const flushed = flushParagraph(); if (flushed) yield flushed;
                currentParagraphRange = document.createRange();
                currentParagraphRange.selectNodeContents(n);
                currentParagraphAnchor = n;
                const flushed2 = flushParagraph(); if (flushed2) yield flushed2; // emit immediately as a paragraph block
                continue;
            }
        } else if (isText(n)) {
            const text = n.nodeValue?.replace(/\s+/g, ' ').trim();
            if (text) {
                // Ensure we have a paragraph run capturing this text
                if (!currentParagraphRange) {
                    currentParagraphRange = document.createRange();
                    currentParagraphRange.selectNodeContents(n.parentElement ?? n);
                    currentParagraphAnchor = n;
                }
                // Let it accumulate (range already spans parent contents)
            }
        }
    }
}

interface ReadableChunk {
    type: ReadableType;
    role?: string;
    level?: number;
    name?: string;
    range: Range;   // existing
    node: Node;     // existing "anchor"
    // new, filled by indexer:
    _startId?: number;
    _endId?: number;
}

interface ChunkIndex {
    nodeId: WeakMap<Node, number>;           // pre-order id per Node
    anchorToIndex: WeakMap<Node, number>;    // chunk.node -> chunk index
    // arrays used for binary search (parallel to chunks)
    starts: number[];
    ends: number[];
}

/** Pre-order label the DOM under root, returning a WeakMap<Node, number> */
function buildNodeIds(root: Node): WeakMap<Node, number> {
    const ids = new WeakMap<Node, number>();
    let i = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) ids.set(walker.currentNode, i++);
    return ids;
}

/** Build fast lookup structures for chunks. Call this right after you build chunks. */
function indexChunks(root: Element, chunks: ReadableChunk[]): ChunkIndex {
    const nodeId = buildNodeIds(root);
    const anchorToIndex = new WeakMap<Node, number>();
    const starts: number[] = new Array(chunks.length);
    const ends: number[] = new Array(chunks.length);

    for (let k = 0; k < chunks.length; k++) {
        const ch = chunks[k];
        let s = nodeId.get(ch.range.startContainer);
        let e = nodeId.get(ch.range.endContainer);
        // Guard against missing ids (e.g., detached nodes)
        if (s == null) s = nodeId.get(ch.node) ?? -1;
        if (e == null) e = nodeId.get(ch.node) ?? s;
        if (s > e) [s, e] = [e, s];

        ch._startId = s;
        ch._endId = e;
        starts[k] = s;
        ends[k] = e;

        // Map the anchor and its element parent for quicker ancestor hits
        // For heading chunks, always set/overwrite the mapping to ensure priority
        // For other chunks, only set if not already mapped (preserves heading priority)
        if (ch.type === 'heading') {
            anchorToIndex.set(ch.node, k);
            if (ch.node.nodeType === Node.TEXT_NODE && ch.node.parentNode) {
                anchorToIndex.set(ch.node.parentNode, k);
            }
        } else {
            // Only set if not already mapped (heading chunks take priority)
            if (!anchorToIndex.has(ch.node)) {
                anchorToIndex.set(ch.node, k);
            }
            if (ch.node.nodeType === Node.TEXT_NODE && ch.node.parentNode && !anchorToIndex.has(ch.node.parentNode)) {
                anchorToIndex.set(ch.node.parentNode, k);
            }
        }
    }

    // Chunks should already be DOM-ordered; if not, sort them (and keep a remap).
    // Assuming your builder yields in DOM order, we're good.

    return { nodeId, anchorToIndex, starts, ends };
}

/** Walk up ancestors and return first chunk index we find (very fast). */
function findChunkByAncestorMap(cursor: Node, idx: ChunkIndex): number | null {
    let n: Node | null = cursor;
    while (n) {
        const hit = idx.anchorToIndex.get(n);
        if (hit != null) return hit;
        n = n.parentNode;
    }
    return null;
}

/** Binary search helper: find last chunk whose startId <= cursorId. */
function upperBoundStart(starts: number[], cursorId: number): number {
    let lo = 0, hi = starts.length; // [lo, hi)
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (starts[mid] <= cursorId) lo = mid + 1;
        else hi = mid;
    }
    return lo - 1; // may be -1 if all starts > cursorId
}

/** Map a DOM node (cursor) to chunk index quickly. */
function chunkIndexForNode(cursor: Node, chunks: ReadableChunk[], idx: ChunkIndex): number | null {
    // 1) Try ancestor map
    const anc = findChunkByAncestorMap(cursor, idx);
    if (anc != null) return anc;

    // 2) Binary search on interval [startId, endId]
    const cursorId = idx.nodeId.get(cursor);
    if (cursorId == null) return null;

    // Find candidate by startId
    let k = upperBoundStart(idx.starts, cursorId);
    if (k < 0) k = 0;

    // Scan a tiny window to account for paragraphs that start after cursor’s container but still contain it visually.
    // Usually one or two checks are enough because chunks are contiguous.
    for (let j = Math.max(0, k - 2); j <= Math.min(chunks.length - 1, k + 2); j++) {
        const s = chunks[j]._startId!, e = chunks[j]._endId!;
        if (s <= cursorId && cursorId <= e) return j;
    }

    // 3) Fallback: create a Range around the cursor and test containsRange on 1–2 nearby chunks
    try {
        const r = document.createRange();
        r.selectNode(cursor.nodeType === Node.TEXT_NODE ? cursor : (cursor.firstChild || cursor));
        // Try local neighborhood to avoid O(n)
        for (let j = Math.max(0, k - 5); j <= Math.min(chunks.length - 1, k + 5); j++) {
            const cr = chunks[j].range;
            // containsNode is broad; use compareBoundaryPoints if available:
            const startsAfterOrAt = cr.compareBoundaryPoints(Range.START_TO_START, r) <= 0;
            const endsBeforeOrAt = cr.compareBoundaryPoints(Range.END_TO_END, r) >= 0;
            if (startsAfterOrAt && endsBeforeOrAt) return j;
        }
    } catch { /* ignore */ }

    return null;
}

export function findReadableNodesUntilNextSection(startNode: HTMLElement, document: Document): HTMLElement[] {
    const chunks = [...readableChunks(document.body)]
    log('Total chunks generated:', chunks.length)
    log('Heading chunks:', chunks.filter(c => c.type === 'heading').map(c => ({
        type: c.type,
        level: c.level,
        node: c.node,
        nodeTag: (c.node as Element).tagName,
        nodeId: (c.node as Element).id,
        rangeStart: c.range.startContainer,
        rangeEnd: c.range.endContainer
    })))

    const idx = indexChunks(document.body, chunks)
    const currentIndex = chunkIndexForNode(startNode, chunks, idx)

    log('Start node:', startNode, startNode.tagName, startNode.id)
    log('Current chunk index:', currentIndex)
    log('Current chunk details:', currentIndex !== null ? {
        type: chunks[currentIndex].type,
        role: chunks[currentIndex].role,
        node: chunks[currentIndex].node,
        nodeType: chunks[currentIndex].node.nodeType,
        range: chunks[currentIndex].range
    } : null)
    
    if (currentIndex === null) {
        log('No chunk found for the current node')
        return []
    }
    
    const range = chunks[currentIndex].range
    
    // Collect actual DOM nodes from the range instead of cloning
    const nodes: Node[] = []
    const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Check if the node is within the range
                try {
                    const nodeRange = document.createRange()
                    nodeRange.selectNodeContents(node)
                    
                    // Check if this node intersects with our chunk range
                    const startsBeforeOrAt = range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0
                    const endsAfterOrAt = range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0
                    
                    if (startsBeforeOrAt && endsAfterOrAt) {
                        return NodeFilter.FILTER_ACCEPT
                    }
                } catch {
                    // If comparison fails, skip this node
                }
                return NodeFilter.FILTER_SKIP
            }
        }
    )
    
    let node: Node | null
    while ((node = walker.nextNode())) {
        nodes.push(node)
    }
    
    log('Collected actual DOM nodes:', nodes)
    
    return nodes
        .map(node => node as HTMLElement)
        .filter(node => 
            node.nodeType === Node.ELEMENT_NODE || 
            node.nodeType === Node.TEXT_NODE
        )
}