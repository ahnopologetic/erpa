/**
 * Test website for ErpaReadableElement system
 * This file can be run in a browser to test the system
 */

import { ErpaReadableQueueManager } from './queue-manager';
import { MockDOM, TestUtils } from './test-environment';

/**
 * Simple test website that demonstrates the ErpaReadableElement system
 */
export class TestWebsite {
    private queueManager: ErpaReadableQueueManager;
    private testContainer: HTMLElement;

    constructor() {
        this.testContainer = MockDOM.getContainer();
        this.queueManager = new ErpaReadableQueueManager({
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0,
            autoProgress: true,
            onQueueStart: () => console.log('🎵 Queue started'),
            onQueueEnd: () => console.log('🏁 Queue ended'),
            onSectionChange: (index) => console.log(`📖 Section changed to: ${index}`),
            onError: (error, element) => console.error(`❌ Error in element ${element.id}:`, error)
        });

        this.setupTestInterface();
    }

    private setupTestInterface(): void {
        // Create a simple test interface
        this.testContainer.innerHTML = `
      <div style="padding: 20px; font-family: Arial, sans-serif;">
        <h1>🧪 ErpaReadableElement Test Website</h1>
        
        <div style="margin-bottom: 20px;">
          <button onclick="testWebsite.runBasicTest()" style="margin-right: 10px; padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Run Basic Test
          </button>
          <button onclick="testWebsite.runComprehensiveTest()" style="margin-right: 10px; padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Run Comprehensive Test
          </button>
          <button onclick="testWebsite.stopTest()" style="margin-right: 10px; padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Stop Test
          </button>
          <button onclick="testWebsite.cleanup()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Cleanup
          </button>
        </div>
        
        <div id="test-content" style="border: 1px solid #ccc; padding: 20px; margin-bottom: 20px; min-height: 200px; background: white;">
          <p>Test content will appear here...</p>
        </div>
        
        <div id="test-output" style="border: 1px solid #ccc; padding: 20px; background: #f8f9fa; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto;">
          <p>Test output will appear here...</p>
        </div>
      </div>
    `;

        // Make the test website globally available
        (window as any).testWebsite = this;
    }

    public runBasicTest(): void {
        console.log('🧪 Running basic test...');
        this.logOutput('🧪 Running basic test...');

        try {
            // Create a simple test document
            const doc = this.createSimpleTestDocument();

            // Create sections
            const sections = TestUtils.createTestSections(doc);
            this.logOutput(`Created ${sections.length} sections`);

            // Create readable elements
            const elements = TestUtils.createTestReadableElements(sections);
            this.logOutput(`Created ${elements.length} readable elements`);

            // Enqueue elements
            this.queueManager.enqueue(elements);
            this.logOutput('Enqueued elements to queue');

            // Start playback
            this.queueManager.start();
            this.logOutput('Started playback');

            this.logOutput('✅ Basic test completed');
        } catch (error) {
            this.logOutput(`❌ Basic test failed: ${error.message}`);
            console.error(error);
        }
    }

    public runComprehensiveTest(): void {
        console.log('🧪 Running comprehensive test...');
        this.logOutput('🧪 Running comprehensive test...');

        try {
            // Create a complex test document
            const doc = this.createComprehensiveTestDocument();

            // Create sections
            const sections = TestUtils.createTestSections(doc);
            this.logOutput(`Created ${sections.length} sections`);

            // Create readable elements
            const elements = TestUtils.createTestReadableElements(sections);
            this.logOutput(`Created ${elements.length} readable elements`);

            // Enqueue elements
            this.queueManager.enqueue(elements);
            this.logOutput('Enqueued elements to queue');

            // Start playback
            this.queueManager.start();
            this.logOutput('Started playback');

            this.logOutput('✅ Comprehensive test completed');
        } catch (error) {
            this.logOutput(`❌ Comprehensive test failed: ${error.message}`);
            console.error(error);
        }
    }

    public stopTest(): void {
        console.log('⏹️ Stopping test...');
        this.logOutput('⏹️ Stopping test...');

        this.queueManager.stop();
        this.logOutput('✅ Test stopped');
    }

    public cleanup(): void {
        console.log('🧹 Cleaning up...');
        this.logOutput('🧹 Cleaning up...');

        this.queueManager.stop();
        this.queueManager.clear();
        MockDOM.cleanup();

        this.logOutput('✅ Cleanup completed');
    }

    private createSimpleTestDocument(): HTMLElement {
        const doc = document.createElement('div');
        doc.innerHTML = `
      <h1>Simple Test Document</h1>
      <p>This is the first paragraph of our simple test document.</p>
      <p>This is the second paragraph with more content.</p>
      <h2>Subheading</h2>
      <p>This is a paragraph under the subheading.</p>
      <ul>
        <li>First list item</li>
        <li>Second list item</li>
        <li>Third list item</li>
      </ul>
    `;

        const testContent = document.getElementById('test-content');
        if (testContent) {
            testContent.innerHTML = '';
            testContent.appendChild(doc);
        }

        return doc;
    }

    private createComprehensiveTestDocument(): HTMLElement {
        const doc = document.createElement('div');
        doc.innerHTML = `
      <article>
        <header>
          <h1>Comprehensive Test Document</h1>
          <nav>
            <ul>
              <li><a href="#section1">Introduction</a></li>
              <li><a href="#section2">Main Content</a></li>
              <li><a href="#section3">Conclusion</a></li>
            </ul>
          </nav>
        </header>
        
        <main>
          <section id="section1">
            <h2>Introduction</h2>
            <p>This is the introduction section of our comprehensive test document. It contains multiple paragraphs to test the readable element system thoroughly.</p>
            <p>This second paragraph demonstrates how the system handles multiple paragraphs within a section.</p>
            
            <h3>Subsection 1.1</h3>
            <p>This is a subsection with its own content and structure.</p>
            
            <ul>
              <li>First introduction point</li>
              <li>Second introduction point</li>
              <li>Third introduction point</li>
            </ul>
          </section>
          
          <section id="section2">
            <h2>Main Content</h2>
            <p>This is the main content section with more complex structure and content.</p>
            
            <blockquote>
              This is a blockquote that should be treated as a separate readable element. It contains important information that needs to be highlighted.
            </blockquote>
            
            <p>Another paragraph after the blockquote to continue the flow of content.</p>
            
            <h3>Code Example</h3>
            <pre><code>console.log('Hello, World!');</code></pre>
            
            <p>Final paragraph to wrap up the main content section.</p>
          </section>
          
          <section id="section3">
            <h2>Conclusion</h2>
            <p>This is the conclusion section that wraps up our comprehensive test document.</p>
            <p>It demonstrates how the system handles the final section of a document.</p>
          </section>
        </main>
        
        <footer>
          <p>This is the footer content of our test document.</p>
        </footer>
      </article>
    `;

        const testContent = document.getElementById('test-content');
        if (testContent) {
            testContent.innerHTML = '';
            testContent.appendChild(doc);
        }

        return doc;
    }

    private logOutput(message: string): void {
        const output = document.getElementById('test-output');
        if (output) {
            const timestamp = new Date().toLocaleTimeString();
            output.innerHTML += `[${timestamp}] ${message}<br>`;
            output.scrollTop = output.scrollHeight;
        }
    }
}

// Initialize the test website when the module loads
export function initializeTestWebsite(): TestWebsite {
    MockDOM.init();
    return new TestWebsite();
}

// Auto-initialize if running in browser
if (typeof window !== 'undefined') {
    const testWebsite = initializeTestWebsite();
    console.log('🧪 ErpaReadableElement test website initialized');
    console.log('Use testWebsite.runBasicTest() or testWebsite.runComprehensiveTest() to run tests');
}
