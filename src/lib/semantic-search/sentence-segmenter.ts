import { findReadableNodesUntilNextSection } from "~lib/debugging/readable";
import { log } from "~lib/log";
import { detectSections } from "~hooks/useDetectSections";

export interface SentenceSegment {
  text: string;
  element: HTMLElement;
  selector: string;
  startOffset: number;
  endOffset: number;
  index: number;
}

/**
 * Generates a unique CSS selector for an element
 */
function generateUniqueSelector(el: Element): string {
  if (!el) return '';
  const path: string[] = [];
  let element: Element | null = el;

  while (element && element.nodeType === Node.ELEMENT_NODE && element.tagName.toLowerCase() !== 'body') {
    let selector = element.nodeName.toLowerCase();
    if (element.id) {
      // Escape ID if it starts with a digit or contains special characters
      const escapedId = CSS.escape(element.id);
      selector += `#${escapedId}`;
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
 * Segments text into sentences using Intl.Segmenter
 */
function segmentTextIntoSentences(text: string): string[] {
  try {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    const segments = [...segmenter.segment(text)]
      .map(seg => seg.segment.trim())
      .filter(s => s.length > 0);
    return segments;
  } catch (error) {
    log('Intl.Segmenter not available, falling back to regex:', error);
    // Fallback to regex-based sentence splitting
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
}

/**
 * Maps sentences back to their DOM elements by finding which element contains each sentence
 */
function mapSentencesToElements(
  sentences: string[],
  elements: HTMLElement[]
): SentenceSegment[] {
  const segments: SentenceSegment[] = [];
  
  for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex++) {
    const sentence = sentences[sentenceIndex];
    
    // Find the element that contains this sentence
    let bestElement: HTMLElement | null = null;
    let bestSelector = '';
    
    for (const element of elements) {
      const elementText = element.textContent || '';
      
      // Check if this sentence appears in this element's text
      if (elementText.includes(sentence)) {
        bestElement = element;
        bestSelector = generateUniqueSelector(element);
        break; // Use the first element that contains the sentence
      }
    }
    
    // If we found an element, create a segment
    if (bestElement) {
      segments.push({
        text: sentence,
        element: bestElement,
        selector: bestSelector,
        startOffset: 0, // We don't need precise offsets for semantic search
        endOffset: sentence.length,
        index: sentenceIndex
      });
    } else {
      // Fallback: assign to the first element if no specific match found
      if (elements.length > 0) {
        segments.push({
          text: sentence,
          element: elements[0],
          selector: generateUniqueSelector(elements[0]),
          startOffset: 0,
          endOffset: sentence.length,
          index: sentenceIndex
        });
      }
    }
  }
  
  log('[semantic-search] Successfully mapped', segments.length, 'sentences to DOM elements');
  return segments;
}

/**
 * Process readable nodes and convert them to sentence segments
 */
function processReadableNodes(readableNodes: HTMLElement[], source: string): SentenceSegment[] {
  // Extract text content from all nodes
  const fullText = readableNodes
    .map(node => node.textContent || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  log('[semantic-search] Extracted text length from', source + ':', fullText.length);

  // Segment into sentences
  const sentences = segmentTextIntoSentences(fullText);
  log('[semantic-search] Segmented into', sentences.length, 'sentences');

  // Map sentences back to their DOM elements
  const segments = mapSentencesToElements(sentences, readableNodes);
  log('[semantic-search] Mapped', segments.length, 'sentences to DOM elements');

  return segments;
}

/**
 * Extracts readable content from the page and segments it into sentences
 */
export function segmentPageIntoSentences(): SentenceSegment[] {
  try {
    log('[semantic-search] Starting page segmentation...');
    
    // Get all detected sections from the page
    const sections = detectSections();
    
    if (sections.length === 0) {
      log('[semantic-search] No sections detected, falling back to document body');
      // Fallback: try to get readable nodes from document body
      const readableNodes = findReadableNodesUntilNextSection(document.body, document);
      if (readableNodes.length === 0) {
        log('[semantic-search] No readable nodes found');
        return [];
      }
      return processReadableNodes(readableNodes, 'body');
    }

    log('[semantic-search] Found', sections.length, 'sections');

    // Collect readable nodes from all sections
    const allReadableNodes: HTMLElement[] = [];
    
    for (const section of sections) {
      try {
        const sectionElement = document.querySelector(section.cssSelector);
        if (sectionElement) {
          const readableNodes = findReadableNodesUntilNextSection(sectionElement as HTMLElement, document);
          allReadableNodes.push(...readableNodes);
          log('[semantic-search] Section "' + section.title + '" contributed', readableNodes.length, 'readable nodes');
        }
      } catch (error) {
        log('[semantic-search] Error processing section "' + section.title + '":', error);
      }
    }

    if (allReadableNodes.length === 0) {
      log('[semantic-search] No readable nodes found in any section');
      return [];
    }

    log('[semantic-search] Total readable nodes collected:', allReadableNodes.length);
    return processReadableNodes(allReadableNodes, 'sections');
    
  } catch (error) {
    log('[semantic-search] Error during page segmentation:', error);
    return [];
  }
}

/**
 * Filters segments to only include meaningful sentences
 */
export function filterMeaningfulSegments(segments: SentenceSegment[]): SentenceSegment[] {
  return segments.filter(segment => {
    const text = segment.text.trim();
    
    // Filter out very short sentences
    if (text.length < 10) return false;
    
    // Filter out sentences that are mostly punctuation or numbers
    const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
    if (alphaRatio < 0.5) return false;
    
    // Filter out common non-content patterns
    const skipPatterns = [
      /^(click|tap|press|enter|submit|continue|next|back|menu|home|search|login|logout)$/i,
      /^\d+$/,
      /^[^\w\s]+$/,
      /^(yes|no|ok|cancel|close|open)$/i
    ];
    
    return !skipPatterns.some(pattern => pattern.test(text));
  });
}
