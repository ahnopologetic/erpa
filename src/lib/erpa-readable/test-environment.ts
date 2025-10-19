/**
 * Test environment for ErpaReadableElement system
 * Creates mock DOM elements and provides testing utilities
 */

import { ErpaReadableQueueManager } from './queue-manager';
import { ErpaReadableConfig } from './types';
import { createErpaReadableElement, createFromReadableNodes } from './element-factory';
import { ErpaReadableElement, SectionInfo } from './types';

/**
 * Mock DOM utilities for testing
 */
export class MockDOM {
  private static container: HTMLElement;
  
  static init(): void {
    // Create a test container if it doesn't exist
    this.container = document.getElementById('erpa-test-container') || document.createElement('div');
    this.container.id = 'erpa-test-container';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: white;
      z-index: 9999;
      padding: 20px;
      font-family: Arial, sans-serif;
      overflow-y: auto;
    `;
    
    if (!document.getElementById('erpa-test-container')) {
      document.body.appendChild(this.container);
    }
  }
  
  static createMockDocument(): HTMLElement {
    const doc = document.createElement('div');
    doc.innerHTML = `
      <article>
        <header>
          <h1 id="title">Test Document</h1>
          <nav>
            <ul>
              <li><a href="#section1">Section 1</a></li>
              <li><a href="#section2">Section 2</a></li>
            </ul>
          </nav>
        </header>
        
        <main>
          <section id="section1">
            <h2>Introduction</h2>
            <p>This is the first paragraph of the introduction section. It contains some sample text to test the readable element system.</p>
            <p>This is the second paragraph with more content to demonstrate how multiple paragraphs work together.</p>
            
            <h3>Subsection</h3>
            <p>This is a subsection with its own content.</p>
            
            <ul>
              <li>First list item with some text</li>
              <li>Second list item with more content</li>
              <li>Third list item to complete the list</li>
            </ul>
          </section>
          
          <section id="section2">
            <h2>Main Content</h2>
            <p>This section contains the main content of our test document. It has multiple paragraphs to test the queue system.</p>
            
            <blockquote>
              This is a blockquote that should be treated as a separate readable element.
            </blockquote>
            
            <p>Another paragraph after the blockquote to continue the flow of content.</p>
            
            <h3>Code Example</h3>
            <pre><code>console.log('Hello, World!');</code></pre>
            
            <p>Final paragraph to wrap up the section.</p>
          </section>
        </main>
        
        <footer>
          <p>This is the footer content.</p>
        </footer>
      </article>
    `;
    
    this.container.appendChild(doc);
    return doc;
  }
  
  static createSimpleDocument(): HTMLElement {
    const doc = document.createElement('div');
    doc.innerHTML = `
      <h1>Simple Test</h1>
      <p>First paragraph</p>
      <p>Second paragraph</p>
      <h2>Subheading</h2>
      <p>Third paragraph</p>
    `;
    
    this.container.appendChild(doc);
    return doc;
  }
  
  static cleanup(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
  
  static getContainer(): HTMLElement {
    return this.container;
  }
}

/**
 * Test utilities for creating readable elements
 */
export class TestUtils {
  /**
   * Create test sections from a document
   */
  static createTestSections(doc: HTMLElement): SectionInfo[] {
    const sections: SectionInfo[] = [];
    const sectionElements = doc.querySelectorAll('section, h1, h2, h3, h4, h5, h6');
    
    sectionElements.forEach((element, index) => {
      const title = element.textContent?.trim() || `Section ${index + 1}`;
      const selector = element.id ? `#${element.id}` : `section:nth-child(${index + 1})`;
      
      sections.push({
        index,
        title,
        cssSelector: selector,
        element: element as HTMLElement
      });
    });
    
    return sections;
  }
  
  /**
   * Create readable elements from test sections
   */
  static createTestReadableElements(sections: SectionInfo[]): ErpaReadableElement[] {
    const elements: ErpaReadableElement[] = [];
    
    sections.forEach((section, sectionIndex) => {
      // Find all readable nodes within this section
      const sectionElement = section.element;
      const readableNodes = this.findReadableNodesInSection(sectionElement);
      
      // Create ErpaReadableElement instances
      const sectionElements = createFromReadableNodes(
        readableNodes,
        sectionIndex,
        section.title,
        elements.length
      );
      
      elements.push(...sectionElements);
    });
    
    return elements;
  }
  
  /**
   * Find readable nodes within a section (simplified version)
   */
  private static findReadableNodesInSection(section: HTMLElement): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    
    // Find all block-level elements
    const selectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'pre'];
    
    selectors.forEach(selector => {
      const elements = section.querySelectorAll(selector);
      elements.forEach(element => {
        if (element.textContent?.trim()) {
          nodes.push(element as HTMLElement);
        }
      });
    });
    
    // Sort by DOM order
    nodes.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });
    
    return nodes;
  }
}

/**
 * Test runner for the ErpaReadableElement system
 */
export class TestRunner {
  private queueManager: ErpaReadableQueueManager;
  private testContainer: HTMLElement;
  
  constructor(config: ErpaReadableConfig = {}) {
    this.queueManager = new ErpaReadableQueueManager(config);
    this.testContainer = MockDOM.getContainer();
  }
  
  /**
   * Run a basic test with simple document
   */
  async runBasicTest(): Promise<void> {
    console.log('🧪 Running basic test...');
    
    // Create test document
    const doc = MockDOM.createSimpleDocument();
    
    // Create sections
    const sections = TestUtils.createTestSections(doc);
    console.log('Created sections:', sections);
    
    // Create readable elements
    const elements = TestUtils.createTestReadableElements(sections);
    console.log('Created readable elements:', elements);
    
    // Enqueue elements
    this.queueManager.enqueue(elements);
    
    // Start playback
    this.queueManager.start();
    
    console.log('✅ Basic test completed');
  }
  
  /**
   * Run a comprehensive test with complex document
   */
  async runComprehensiveTest(): Promise<void> {
    console.log('🧪 Running comprehensive test...');
    
    // Create complex test document
    const doc = MockDOM.createMockDocument();
    
    // Create sections
    const sections = TestUtils.createTestSections(doc);
    console.log('Created sections:', sections);
    
    // Create readable elements
    const elements = TestUtils.createTestReadableElements(sections);
    console.log('Created readable elements:', elements);
    
    // Set up callbacks
    const config: ErpaReadableConfig = {
      onQueueStart: () => console.log('🎵 Queue started'),
      onQueueEnd: () => console.log('🏁 Queue ended'),
      onSectionChange: (index) => console.log(`📖 Section changed to: ${index}`),
      onError: (error, element) => console.error(`❌ Error in element ${element.id}:`, error)
    };
    
    this.queueManager.updateConfig(config);
    
    // Enqueue elements
    this.queueManager.enqueue(elements);
    
    // Start playback
    this.queueManager.start();
    
    console.log('✅ Comprehensive test completed');
  }
  
  /**
   * Test queue operations
   */
  async runQueueOperationsTest(): Promise<void> {
    console.log('🧪 Running queue operations test...');
    
    const doc = MockDOM.createSimpleDocument();
    const sections = TestUtils.createTestSections(doc);
    const elements = TestUtils.createTestReadableElements(sections);
    
    // Test enqueue
    this.queueManager.enqueue(elements);
    console.log('Enqueued elements:', this.queueManager.elements.length);
    
    // Test peek
    const firstElement = this.queueManager.peek();
    console.log('Peeked element:', firstElement?.id);
    
    // Test dequeue
    const dequeuedElement = this.queueManager.dequeue();
    console.log('Dequeued element:', dequeuedElement?.id);
    
    // Test jump to element
    if (elements.length > 1) {
      this.queueManager.jumpToElement(elements[1].id);
      console.log('Jumped to element:', elements[1].id);
    }
    
    console.log('✅ Queue operations test completed');
  }
  
  /**
   * Clean up test environment
   */
  cleanup(): void {
    this.queueManager.stop();
    MockDOM.cleanup();
  }
  
  /**
   * Get the queue manager for manual testing
   */
  getQueueManager(): ErpaReadableQueueManager {
    return this.queueManager;
  }
}

/**
 * Global test functions for easy access
 */
export function createTestEnvironment(config?: ErpaReadableConfig): TestRunner {
  MockDOM.init();
  return new TestRunner(config);
}

export function runBasicTest(): Promise<void> {
  const runner = createTestEnvironment();
  return runner.runBasicTest();
}

export function runComprehensiveTest(): Promise<void> {
  const runner = createTestEnvironment();
  return runner.runComprehensiveTest();
}

export function runQueueOperationsTest(): Promise<void> {
  const runner = createTestEnvironment();
  return runner.runQueueOperationsTest();
}
