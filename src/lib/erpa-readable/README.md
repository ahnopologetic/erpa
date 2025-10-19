# ErpaReadableElement System

A unified system for managing TTS playback, highlighting, and section navigation in the ERPA extension.

## Overview

The ErpaReadableElement system provides a cohesive interface for:
- **TTS Management**: Speech synthesis with proper queue management
- **Highlighting**: Visual highlighting of elements being read
- **Section Navigation**: Automatic progression between document sections
- **State Management**: Unified state tracking for all components

## Architecture

### Core Components

1. **ErpaReadableElement**: The main interface that represents a readable DOM element
2. **ErpaReadableQueueManager**: Manages the queue of elements and playback state
3. **Element Factory**: Creates ErpaReadableElement instances from DOM nodes
4. **Test Environment**: Isolated testing environment for development

### Key Features

- **Unified State**: Each element tracks its own highlighting, TTS, and completion state
- **Section Awareness**: Elements are pre-associated with their sections
- **Auto-progression**: Automatic movement between sections when current section is complete
- **Error Handling**: Graceful error handling with callbacks
- **Validation**: Automatic validation of DOM elements

## Usage

### Basic Usage

```typescript
import { ErpaReadableQueueManager, createFromReadableNodes } from './erpa-readable';

// Create queue manager
const queueManager = new ErpaReadableQueueManager({
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  autoProgress: true,
  onQueueStart: () => console.log('Queue started'),
  onQueueEnd: () => console.log('Queue ended'),
  onSectionChange: (index) => console.log(`Section changed to: ${index}`),
  onError: (error, element) => console.error(`Error in element ${element.id}:`, error)
});

// Create readable elements from DOM nodes
const elements = createFromReadableNodes(nodes, sectionIndex, sectionTitle);

// Enqueue and start
queueManager.enqueue(elements);
queueManager.start();
```

### Advanced Usage

```typescript
// Manual control
queueManager.pause();
queueManager.next();
queueManager.previous();

// Navigation
queueManager.jumpToElement('element-id');
queueManager.jumpToSection(2);

// State inspection
const state = queueManager.getState();
console.log('Current element:', state.currentElement);
console.log('Queue length:', state.elements.length);
```

## Testing

### Test Environment

The system includes a comprehensive test environment:

1. **Mock DOM**: Creates test DOM elements for isolated testing
2. **Test Runner**: Automated test execution
3. **Test Website**: Interactive browser-based testing

### Running Tests

#### Browser Testing

1. Open `test.html` in a browser
2. Click test buttons to run different test scenarios
3. Use manual test mode for interactive testing

#### Programmatic Testing

```typescript
import { createTestEnvironment } from './test-environment';

const runner = createTestEnvironment();
await runner.runBasicTest();
await runner.runComprehensiveTest();
await runner.runQueueOperationsTest();
```

### Test Scenarios

1. **Basic Test**: Simple document with basic elements
2. **Comprehensive Test**: Complex document with multiple sections
3. **Queue Operations Test**: Test queue management functions
4. **Manual Test**: Interactive testing with console controls

## Integration

### Replacing Current System

To integrate with the existing ERPA codebase:

1. **Replace Queue Management**: Replace the current `queue` state with `ErpaReadableQueueManager`
2. **Update TTS Logic**: Use the queue manager's TTS methods instead of direct `speakText`
3. **Update Highlighting**: Use the queue manager's highlighting methods
4. **Update Section Navigation**: Use the queue manager's section methods

### Migration Steps

1. Import the new system
2. Create a queue manager instance
3. Replace current queue operations
4. Update TTS and highlighting logic
5. Test thoroughly

## API Reference

### ErpaReadableElement

```typescript
interface ErpaReadableElement {
  id: string;                    // Unique identifier
  node: HTMLElement;             // DOM element
  text: string;                  // Text content
  sectionIndex: number;          // Section index
  sectionTitle: string;          // Section title
  isActive: boolean;             // Currently being read
  isCompleted: boolean;          // Already been read
  isHighlighted: boolean;        // Currently highlighted
  type: ReadableElementType;     // Element type
  level?: number;                // Heading level
  order: number;                 // Reading order
  // ... callbacks and methods
}
```

### ErpaReadableQueueManager

```typescript
class ErpaReadableQueueManager {
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
  
  // State
  getState(): QueueState;
}
```

## Configuration

### ErpaReadableConfig

```typescript
interface ErpaReadableConfig {
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
  autoProgress?: boolean;        // Auto-move to next section
  loopMode?: boolean;           // Loop back to start
  
  // Callbacks
  onQueueStart?: () => void;
  onQueueEnd?: () => void;
  onSectionChange?: (sectionIndex: number) => void;
  onError?: (error: Error, element: ErpaReadableElement) => void;
}
```

## Development

### File Structure

```
src/lib/erpa-readable/
├── types.ts              # Core interfaces and types
├── element-factory.ts    # Factory functions for creating elements
├── queue-manager.ts      # Queue management implementation
├── test-environment.ts   # Test environment and utilities
├── test-website.ts       # Browser-based test website
├── test.html            # HTML test page
├── index.ts             # Main exports
└── README.md            # This file
```

### Adding New Features

1. Update types in `types.ts`
2. Implement functionality in appropriate files
3. Add tests to `test-environment.ts`
4. Update documentation

### Testing New Features

1. Add test cases to `test-environment.ts`
2. Update `test.html` if needed
3. Run tests in browser
4. Verify integration with existing system

## Troubleshooting

### Common Issues

1. **Elements not highlighting**: Check if DOM nodes are still valid
2. **TTS not working**: Verify speech synthesis is available
3. **Queue not progressing**: Check auto-progression settings
4. **Section navigation issues**: Verify section selectors are correct

### Debug Mode

Enable debug logging by setting:

```typescript
const queueManager = new ErpaReadableQueueManager({
  onError: (error, element) => {
    console.error('Queue error:', error);
    console.error('Element:', element);
  }
});
```

## Future Enhancements

- **Voice Selection**: UI for selecting different TTS voices
- **Speed Control**: Dynamic speed adjustment during playback
- **Bookmarking**: Save and restore reading positions
- **Analytics**: Track reading progress and behavior
- **Custom Highlighting**: User-configurable highlight styles
