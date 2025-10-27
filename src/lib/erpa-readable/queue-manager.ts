/**
 * Queue manager for ErpaReadableElement instances
 */

import type { ErpaReadableElement, ErpaReadableQueue, ErpaReadableConfig, QueueState } from './types';
import { validateErpaReadableElement } from './element-factory';
import { highlightNode } from '../utils';
import { ttsCoordinator } from '../tts-coordinator';

export class ErpaReadableQueueManager implements ErpaReadableQueue {
  public elements: ErpaReadableElement[] = [];
  public currentIndex: number = -1;
  public isPlaying: boolean = false;
  public currentElement?: ErpaReadableElement;

  private config: ErpaReadableConfig;
  private currentUtterance?: SpeechSynthesisUtterance;
  private isAutoProgressing: boolean = false;
  public currentSectionIndex: number = 0;

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
   * Update TTS settings dynamically
   */
  updateTTSSettings(settings: {
    rate?: number;
    pitch?: number;
    volume?: number;
    voice?: SpeechSynthesisVoice | null;
  }): void {
    if (settings.rate !== undefined) this.config.rate = settings.rate;
    if (settings.pitch !== undefined) this.config.pitch = settings.pitch;
    if (settings.volume !== undefined) this.config.volume = settings.volume;
    if (settings.voice !== undefined) this.config.voice = settings.voice || undefined;
    
    console.log('[QueueManager] TTS settings updated:', {
      rate: this.config.rate,
      pitch: this.config.pitch,
      volume: this.config.volume,
      voice: this.config.voice?.name
    });
  }

  /**
   * Start playing from the current position
   */
  async start(): Promise<void> {
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

    await this.playCurrentElement();
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

    // Stop TTS through coordinator
    ttsCoordinator.cancelBySource('content');
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
  async next(): Promise<void> {
    if (this.currentIndex < this.elements.length - 1) {
      this.currentIndex++;
      this.currentElement = this.elements[this.currentIndex];
      await this.playCurrentElement();
    } else if (this.config.loopMode) {
      // Loop back to the beginning
      this.currentIndex = 0;
      this.currentElement = this.elements[this.currentIndex];
      await this.playCurrentElement();
    } else {
      // End of queue
      this.stop();
      this.config.onQueueEnd?.();
    }
  }

  /**
   * Move to the previous element
   */
  async previous(): Promise<void> {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.currentElement = this.elements[this.currentIndex];
      await this.playCurrentElement();
    }
  }

  /**
   * Jump to a specific element by ID
   */
  async jumpToElement(elementId: string): Promise<void> {
    const index = this.elements.findIndex(element => element.id === elementId);
    if (index !== -1) {
      this.stop();
      this.currentIndex = index;
      this.currentElement = this.elements[index];

      if (this.isPlaying) {
        await this.playCurrentElement();
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
   * Get the next unread element within the current section
   */
  getNextElementInCurrentSection(): ErpaReadableElement | null {
    if (this.elements.length === 0) return null;
    
    const currentSectionIndex = this.currentElement?.sectionIndex ?? this.currentSectionIndex;
    const currentOrder = this.currentElement?.order ?? -1;
    
    // Find the next element in the same section that hasn't been completed
    const nextElement = this.elements.find(element => 
      element.sectionIndex === currentSectionIndex && 
      element.order > currentOrder && 
      !element.isCompleted
    );
    
    return nextElement || null;
  }

  /**
   * Get the first unread element in the current section
   */
  getFirstElementInCurrentSection(): ErpaReadableElement | null {
    if (this.elements.length === 0) return null;
    
    const currentSectionIndex = this.currentElement?.sectionIndex ?? this.currentSectionIndex;
    
    // Find the first element in the current section that hasn't been completed
    const firstElement = this.elements.find(element => 
      element.sectionIndex === currentSectionIndex && 
      !element.isCompleted
    );
    
    return firstElement || null;
  }

  /**
   * Navigate to the next element within the current section only
   * Returns true if navigation occurred, false if no more elements in section
   */
  nextInSection(): boolean {
    const nextElement = this.getNextElementInCurrentSection();
    
    if (nextElement) {
      // Stop current playback properly
      this.stop();
      
      // Jump to the next element and start playing it
      this.jumpToElement(nextElement.id);
      this.start();
      return true;
    }
    
    return false;
  }

  /**
   * Start reading from the first element of the current section
   */
  startCurrentSection(): void {
    const firstElement = this.getFirstElementInCurrentSection();
    
    if (firstElement) {
      // Stop current playback properly
      this.stop();
      
      // Jump to first element and start playing it
      this.jumpToElement(firstElement.id);
      this.start();
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
  private async playCurrentElement(): Promise<void> {
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
    await this.createAndPlayTTS();
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
  private async createAndPlayTTS(): Promise<void> {
    if (!this.currentElement) {
      return;
    }

    const requestId = `queue-element-${this.currentElement.id}-${Date.now()}`;

    // Request TTS through coordinator
    await ttsCoordinator.requestTTS({
      id: requestId,
      text: this.currentElement.text,
      settings: {
        voice: this.config.voice || null,
        rate: this.config.rate || 1.0,
        pitch: this.config.pitch || 1.0,
        volume: this.config.volume || 1.0
      },
      priority: 'normal', // Content script has normal priority
      source: 'content',
      onStart: () => {
        console.log(`TTS started for element: ${this.currentElement!.id}`);
      },
      onEnd: () => {
        console.log(`TTS ended for element: ${this.currentElement!.id}`);
        this.handleElementComplete();
      },
      onError: (event) => {
        console.error(`TTS error for element ${this.currentElement?.id ?? 'unknown'}:`, event);
        this.config.onError?.(event as any, this.currentElement!);
        this.handleElementComplete();
      }
    });
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
  private async handleAutoProgression(): Promise<void> {
    // First, try to find the next element in the current section
    const nextElement = this.elements.find(
      element => !element.isCompleted && element !== this.currentElement
    );

    if (nextElement) {
      // Move to next element in queue
      this.currentIndex = this.elements.indexOf(nextElement);
      this.currentElement = nextElement;
      await this.playCurrentElement();
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

  /**
   * Start playback with auto-progression enabled (for READ_OUT functionality)
   */
  startWithAutoProgress(): void {
    // Temporarily enable auto-progression
    const originalAutoProgress = this.config.autoProgress;
    this.config.autoProgress = true;

    // Start normal playback
    this.start();

    // Set up a handler to restore original setting when queue ends
    const originalOnQueueEnd = this.config.onQueueEnd;
    this.config.onQueueEnd = () => {
      // Restore original auto-progression setting
      this.config.autoProgress = originalAutoProgress;
      this.config.onQueueEnd = originalOnQueueEnd;
      
      // Call original onQueueEnd if it exists
      originalOnQueueEnd?.();
    };
  }
}
