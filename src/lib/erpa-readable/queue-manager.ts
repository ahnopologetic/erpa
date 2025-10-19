/**
 * Queue manager for ErpaReadableElement instances
 */

import type { ErpaReadableElement, ErpaReadableQueue, ErpaReadableConfig, QueueState } from './types';
import { validateErpaReadableElement } from './element-factory';
import { highlightNode } from '../utils';

export class ErpaReadableQueueManager implements ErpaReadableQueue {
  public elements: ErpaReadableElement[] = [];
  public currentIndex: number = -1;
  public isPlaying: boolean = false;
  public currentElement?: ErpaReadableElement;

  private config: ErpaReadableConfig;
  private currentUtterance?: SpeechSynthesisUtterance;
  private isAutoProgressing: boolean = false;
  private currentSectionIndex: number = 0;

  constructor(config: ErpaReadableConfig = {}) {
    this.config = {
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      autoProgress: true,
      loopMode: false,
      ...config
    };
  }

  /**
   * Add elements to the queue
   */
  enqueue(elements: ErpaReadableElement[]): void {
    // Validate elements before adding
    const validElements = elements.filter(element => {
      if (!validateErpaReadableElement(element)) {
        console.warn(`Skipping invalid element: ${element.id}`);
        return false;
      }
      return true;
    });

    this.elements.push(...validElements);

    // Sort by section index and order
    this.elements.sort((a, b) => {
      if (a.sectionIndex !== b.sectionIndex) {
        return a.sectionIndex - b.sectionIndex;
      }
      return a.order - b.order;
    });

    console.log(`Enqueued ${validElements.length} elements. Total queue size: ${this.elements.length}`);
  }

  /**
   * Remove and return the next element from the queue
   */
  dequeue(): ErpaReadableElement | null {
    if (this.elements.length === 0) {
      return null;
    }

    const element = this.elements.shift()!;

    // Update current index if we're removing the current element
    if (this.currentIndex >= 0 && this.currentIndex >= this.elements.length) {
      this.currentIndex = Math.max(0, this.elements.length - 1);
    }

    return element;
  }

  /**
   * Peek at the next element without removing it
   */
  peek(): ErpaReadableElement | null {
    return this.elements.length > 0 ? this.elements[0] : null;
  }

  /**
   * Clear all elements from the queue
   */
  clear(): void {
    this.stop();
    this.elements = [];
    this.currentIndex = -1;
    this.currentElement = undefined;
    this.isAutoProgressing = false;
  }

  /**
   * Start playing from the current position
   */
  start(): void {
    if (this.isPlaying) {
      return;
    }

    if (this.elements.length === 0) {
      console.warn('Cannot start: queue is empty');
      return;
    }

    this.isPlaying = true;
    this.config.onQueueStart?.();

    // If no current element, start with the first one
    if (!this.currentElement) {
      this.currentIndex = 0;
      this.currentElement = this.elements[this.currentIndex];
    }

    this.playCurrentElement();
  }

  /**
   * Pause the current playback
   */
  pause(): void {
    if (!this.isPlaying) {
      return;
    }

    this.isPlaying = false;
    window.speechSynthesis.pause();
  }

  /**
   * Stop playback and reset position
   */
  stop(): void {
    this.isPlaying = false;
    this.isAutoProgressing = false;

    // Stop TTS
    window.speechSynthesis.cancel();
    this.currentUtterance = undefined;

    // Clean up current element
    if (this.currentElement) {
      this.cleanupCurrentElement();
      this.currentElement = undefined;
    }

    this.currentIndex = -1;
  }

  /**
   * Move to the next element
   */
  next(): void {
    if (this.currentIndex < this.elements.length - 1) {
      this.currentIndex++;
      this.currentElement = this.elements[this.currentIndex];
      this.playCurrentElement();
    } else if (this.config.loopMode) {
      // Loop back to the beginning
      this.currentIndex = 0;
      this.currentElement = this.elements[this.currentIndex];
      this.playCurrentElement();
    } else {
      // End of queue
      this.stop();
      this.config.onQueueEnd?.();
    }
  }

  /**
   * Move to the previous element
   */
  previous(): void {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.currentElement = this.elements[this.currentIndex];
      this.playCurrentElement();
    }
  }

  /**
   * Jump to a specific element by ID
   */
  jumpToElement(elementId: string): void {
    const index = this.elements.findIndex(element => element.id === elementId);
    if (index !== -1) {
      this.stop();
      this.currentIndex = index;
      this.currentElement = this.elements[index];

      if (this.isPlaying) {
        this.playCurrentElement();
      }
    } else {
      console.warn(`Element not found: ${elementId}`);
    }
  }

  /**
   * Jump to the first element of a section
   */
  jumpToSection(sectionIndex: number): void {
    const index = this.elements.findIndex(element => element.sectionIndex === sectionIndex);
    if (index !== -1) {
      this.jumpToElement(this.elements[index].id);
      this.currentSectionIndex = sectionIndex;
      this.config.onSectionChange?.(sectionIndex);
    } else {
      console.warn(`Section not found: ${sectionIndex}`);
    }
  }

  /**
   * Find the nearest element to a cursor position
   */
  findNearestElement(cursor: HTMLElement): ErpaReadableElement | null {
    // Simple implementation: find the element whose node contains or is closest to the cursor
    let nearest: ErpaReadableElement | null = null;
    let minDistance = Infinity;

    for (const element of this.elements) {
      if (!validateErpaReadableElement(element)) {
        continue;
      }

      try {
        // Check if cursor is within this element
        if (element.node.contains(cursor)) {
          return element;
        }

        // Calculate distance based on DOM position
        const elementRect = element.node.getBoundingClientRect();
        const cursorRect = cursor.getBoundingClientRect();

        const distance = Math.abs(elementRect.top - cursorRect.top) +
          Math.abs(elementRect.left - cursorRect.left);

        if (distance < minDistance) {
          minDistance = distance;
          nearest = element;
        }
      } catch (error) {
        console.warn(`Error checking element ${element.id}:`, error);
      }
    }

    return nearest;
  }

  /**
   * Get the current queue state
   */
  getState(): QueueState {
    return {
      elements: [...this.elements],
      currentIndex: this.currentIndex,
      isPlaying: this.isPlaying,
      currentElement: this.currentElement,
      isAutoProgressing: this.isAutoProgressing,
      currentSectionIndex: this.currentSectionIndex
    };
  }

  /**
   * Play the current element
   */
  private playCurrentElement(): void {
    if (!this.currentElement) {
      return;
    }

    // Clean up previous element
    this.cleanupCurrentElement();

    // Mark current element as active
    this.currentElement.isActive = true;
    this.currentElement.onStart?.();

    // Highlight the element
    this.highlightCurrentElement();

    // Create and play TTS
    this.createAndPlayTTS();
  }

  /**
   * Highlight the current element
   */
  private highlightCurrentElement(): void {
    if (!this.currentElement) {
      return;
    }

    try {
      const cleanup = highlightNode(this.currentElement.node);
      this.currentElement.highlightCleanup = cleanup;
      this.currentElement.isHighlighted = true;
      this.currentElement.onHighlight?.();
    } catch (error) {
      console.error(`Failed to highlight element ${this.currentElement.id}:`, error);
      this.config.onError?.(error as Error, this.currentElement);
    }
  }

  /**
   * Create and play TTS for the current element
   */
  private createAndPlayTTS(): void {
    if (!this.currentElement) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(this.currentElement.text);

    // Apply TTS settings
    if (this.config.voice) {
      utterance.voice = this.config.voice;
    }
    utterance.rate = this.config.rate || 1.0;
    utterance.pitch = this.config.pitch || 1.0;
    utterance.volume = this.config.volume || 1.0;

    // Set up event handlers
    utterance.onstart = () => {
      console.log(`TTS started for element: ${this.currentElement!.id}`);
    };

    utterance.onend = () => {
      console.log(`TTS ended for element: ${this.currentElement!.id}`);
      this.handleElementComplete();
    };

    utterance.onerror = (event) => {
      console.error(`TTS error for element ${this.currentElement?.id ?? 'unknown'}:`, event);
      this.config.onError?.(event as any, this.currentElement!);
      this.handleElementComplete();
    };

    this.currentUtterance = utterance;
    this.currentElement.utterance = utterance;

    // Cancel any existing speech and start new one
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Handle completion of current element
   */
  private handleElementComplete(): void {
    if (!this.currentElement) {
      return;
    }

    // Mark element as completed
    this.currentElement.isActive = false;
    this.currentElement.isCompleted = true;
    this.currentElement.onEnd?.();

    // Clean up highlighting
    this.cleanupCurrentElement();

    // Move to next element or handle auto-progression
    if (this.config.autoProgress) {
      this.handleAutoProgression();
    } else {
      this.next();
    }
  }

  /**
   * Handle auto-progression to next element or section
   */
  private handleAutoProgression(): void {
    // First, try to find the next element in the current section
    const nextElement = this.elements.find(
      element => !element.isCompleted && element !== this.currentElement
    );

    if (nextElement) {
      // Move to next element in queue
      this.currentIndex = this.elements.indexOf(nextElement);
      this.currentElement = nextElement;
      this.playCurrentElement();
    } else {
      // No more elements in current section, look for next section
      const currentSection = this.currentElement?.sectionIndex ?? -1;
      const nextSectionElement = this.elements.find(
        element => element.sectionIndex > currentSection && !element.isCompleted
      );

      if (nextSectionElement) {
        // Auto-progress to next section
        this.isAutoProgressing = true;
        this.currentSectionIndex = nextSectionElement.sectionIndex;
        this.config.onSectionChange?.(nextSectionElement.sectionIndex);

        // Scroll to the new section
        nextSectionElement.node.scrollIntoView({ behavior: 'smooth' });

        // Wait for scroll animation, then continue
        setTimeout(() => {
          this.jumpToElement(nextSectionElement.id);
          this.isAutoProgressing = false;
        }, 1000);
      } else {
        // No more elements, end playback
        this.stop();
        this.config.onQueueEnd?.();
      }
    }
  }

  /**
   * Clean up the current element
   */
  private cleanupCurrentElement(): void {
    if (!this.currentElement) {
      return;
    }

    // Remove highlighting
    if (this.currentElement.highlightCleanup) {
      this.currentElement.highlightCleanup();
      this.currentElement.highlightCleanup = undefined;
      this.currentElement.isHighlighted = false;
      this.currentElement.onUnhighlight?.();
    }

    // Clear TTS reference
    if (this.currentElement.utterance) {
      this.currentElement.utterance = undefined;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ErpaReadableConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
