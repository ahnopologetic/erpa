import { vi } from 'vitest'

/**
 * Creates a mock implementation of window.scrollTo that can be spied on
 */
export const createScrollToMock = () => {
  return vi.fn().mockImplementation((options: any) => {
    if (typeof options === 'number') {
      // scrollTo(x, y)
      Object.defineProperty(window, 'scrollX', { value: options, writable: true })
      Object.defineProperty(window, 'scrollY', { value: arguments[1] || 0, writable: true })
    } else if (options && typeof options === 'object') {
      // scrollTo({ top, left, behavior })
      if (options.top !== undefined) {
        Object.defineProperty(window, 'scrollY', { value: options.top, writable: true })
      }
      if (options.left !== undefined) {
        Object.defineProperty(window, 'scrollX', { value: options.left, writable: true })
      }
    }
  })
}

/**
 * Mocks the IntersectionObserver with a controllable implementation
 */
export const createIntersectionObserverMock = () => {
  const mockObserver = {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }
  
  const MockIntersectionObserver = vi.fn().mockImplementation((callback, options) => {
    mockObserver.callback = callback
    mockObserver.options = options
    return mockObserver
  })
  
  // Make it globally available
  global.IntersectionObserver = MockIntersectionObserver as any
  window.IntersectionObserver = MockIntersectionObserver as any
  
  return { mockObserver, MockIntersectionObserver }
}

/**
 * Triggers intersection observer callback with specified entries
 */
export const triggerIntersectionObserver = (mockObserver: any, entries: IntersectionObserverEntry[]) => {
  if (mockObserver.callback) {
    mockObserver.callback(entries)
  }
}

/**
 * Creates a mock IntersectionObserverEntry
 */
export const createIntersectionEntry = (
  target: Element,
  isIntersecting: boolean,
  intersectionRatio: number = isIntersecting ? 1 : 0
): IntersectionObserverEntry => ({
  target,
  isIntersecting,
  intersectionRatio,
  boundingClientRect: target.getBoundingClientRect(),
  intersectionRect: isIntersecting ? target.getBoundingClientRect() : new DOMRect(),
  rootBounds: new DOMRect(0, 0, window.innerWidth, window.innerHeight),
  time: Date.now(),
})

/**
 * Advances timers and waits for async operations
 */
export const advanceTimersAndWait = async (ms: number = 1000) => {
  vi.advanceTimersByTime(ms)
  await new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Sets up a test environment with proper DOM structure
 */
export const setupTestEnvironment = () => {
  // Create a basic HTML structure
  document.body.innerHTML = `
    <div id="root">
      <div id="section-1">Section 1 Content</div>
      <div id="section-2">Section 2 Content</div>
      <div id="section-3">Section 3 Content</div>
    </div>
  `
  
  // Set up window properties
  Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })
  Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
  Object.defineProperty(window, 'scrollY', { value: 0, writable: true })
  Object.defineProperty(window, 'scrollX', { value: 0, writable: true })
}

/**
 * Cleans up test environment
 */
export const cleanupTestEnvironment = () => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.restoreAllMocks()
}

/**
 * Waits for a condition to be true
 */
export const waitForCondition = async (
  condition: () => boolean,
  timeout: number = 1000,
  interval: number = 10
): Promise<void> => {
  const start = Date.now()
  
  while (Date.now() - start < timeout) {
    if (condition()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  
  throw new Error(`Condition not met within ${timeout}ms`)
}

/**
 * Mocks console methods for cleaner test output
 */
export const mockConsole = () => {
  const originalConsole = global.console
  
  global.console = {
    ...originalConsole,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    // Keep warn and error for debugging
  }
  
  return () => {
    global.console = originalConsole
  }
}
