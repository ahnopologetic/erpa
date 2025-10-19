/**
 * Core types and interfaces for the ErpaReadableElement system
 */

export type ReadableElementType = 'heading' | 'paragraph' | 'listitem' | 'control' | 'landmark' | 'cell' | 'staticText';

export interface ErpaReadableElement {
  // Core identification
  id: string;                    // Unique identifier for this element
  node: HTMLElement;             // The actual DOM element
  text: string;                  // The text content to be read
  
  // Section context
  sectionIndex: number;          // Which section this element belongs to
  sectionTitle: string;          // Human-readable section name
  
  // Reading state
  isActive: boolean;             // Currently being read
  isCompleted: boolean;          // Already been read
  isHighlighted: boolean;        // Currently highlighted
  
  // Highlight management
  highlightCleanup?: () => void; // Function to remove highlight
  
  // TTS management
  utterance?: SpeechSynthesisUtterance; // TTS utterance for this element
  
  // Metadata
  type: ReadableElementType;
  level?: number;                // For headings (h1=1, h2=2, etc.)
  order: number;                 // Reading order within section
  
  // Lifecycle callbacks
  onStart?: () => void;          // Called when reading starts
  onEnd?: () => void;            // Called when reading ends
  onHighlight?: () => void;      // Called when highlighting starts
  onUnhighlight?: () => void;    // Called when highlighting ends
}

export interface ErpaReadableQueue {
  elements: ErpaReadableElement[];
  currentIndex: number;
  isPlaying: boolean;
  currentElement?: ErpaReadableElement;
  
  // Queue operations
  enqueue(elements: ErpaReadableElement[]): void;
  dequeue(): ErpaReadableElement | null;
  peek(): ErpaReadableElement | null;
  clear(): void;
  
  // Playback control
  start(): void;
  pause(): void;
  stop(): void;
  next(): void;
  previous(): void;
  
  // Navigation
  jumpToElement(elementId: string): void;
  jumpToSection(sectionIndex: number): void;
  findNearestElement(cursor: HTMLElement): ErpaReadableElement | null;
}

export interface ErpaReadableConfig {
  // TTS settings
  voice?: SpeechSynthesisVoice;
  rate?: number;
  pitch?: number;
  volume?: number;
  
  // Highlight settings
  highlightStyle?: {
    background?: string;
    border?: string;
    animation?: string;
  };
  
  // Queue settings
  autoProgress?: boolean;        // Auto-move to next section when current is complete
  loopMode?: boolean;           // Loop back to start when reaching end
  
  // Callbacks
  onQueueStart?: () => void;
  onQueueEnd?: () => void;
  onSectionChange?: (sectionIndex: number) => void;
  onError?: (error: Error, element: ErpaReadableElement) => void;
}

export interface SectionInfo {
  index: number;
  title: string;
  cssSelector: string;
  element: HTMLElement;
}

export interface ErpaReadableElementFactoryOptions {
  node: HTMLElement;
  text: string;
  type: ReadableElementType;
  sectionIndex: number;
  sectionTitle: string;
  order: number;
  level?: number;
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onHighlight?: () => void;
    onUnhighlight?: () => void;
  };
}

export interface QueueState {
  elements: ErpaReadableElement[];
  currentIndex: number;
  isPlaying: boolean;
  currentElement?: ErpaReadableElement;
  isAutoProgressing: boolean;
  currentSectionIndex: number;
}
