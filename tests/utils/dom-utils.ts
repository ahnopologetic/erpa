import { vi } from 'vitest'

/**
 * Creates a mock DOM element with specified properties
 */
export const createMockElement = (properties: Partial<HTMLElement> = {}): HTMLElement => {
  const element = document.createElement('div')
  
  // Set up default mock properties
  Object.defineProperty(element, 'offsetTop', {
    value: properties.offsetTop ?? 0,
    writable: true,
  })
  
  Object.defineProperty(element, 'offsetHeight', {
    value: properties.offsetHeight ?? 100,
    writable: true,
  })
  
  Object.defineProperty(element, 'offsetLeft', {
    value: properties.offsetLeft ?? 0,
    writable: true,
  })
  
  Object.defineProperty(element, 'offsetWidth', {
    value: properties.offsetWidth ?? 100,
    writable: true,
  })
  
  return element
}

/**
 * Creates multiple mock sections with different positions
 */
export const createMockSections = (count: number, startOffset = 0): HTMLElement[] => {
  const sections: HTMLElement[] = []
  
  for (let i = 0; i < count; i++) {
    const section = createMockElement({
      offsetTop: startOffset + (i * 500), // Each section 500px apart
      offsetHeight: 200,
    })
    section.id = `section-${i}`
    section.textContent = `Section ${i + 1}`
    sections.push(section)
  }
  
  return sections
}

/**
 * Mocks document.querySelector to return specific elements
 */
export const mockQuerySelector = (elements: HTMLElement[]) => {
  return vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
    // Find element by ID or return null
    if (selector.startsWith('#')) {
      const id = selector.substring(1)
      return elements.find(el => el.id === id) || null
    }
    
    // Handle other selectors as needed
    return null
  })
}

/**
 * Simulates scroll events
 */
export const simulateScroll = (scrollY: number) => {
  Object.defineProperty(window, 'scrollY', {
    value: scrollY,
    writable: true,
  })
  
  // Trigger scroll event
  window.dispatchEvent(new Event('scroll'))
}

/**
 * Simulates window resize
 */
export const simulateResize = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    writable: true,
  })
  
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    writable: true,
  })
  
  window.dispatchEvent(new Event('resize'))
}

/**
 * Mocks smooth scrolling behavior
 */
export const mockSmoothScroll = () => {
  const scrollToSpy = vi.spyOn(window, 'scrollTo')
  scrollToSpy.mockImplementation((options: any) => {
    // Simulate smooth scroll by updating scrollY immediately
    if (options?.top !== undefined) {
      Object.defineProperty(window, 'scrollY', {
        value: options.top,
        writable: true,
      })
    }
  })
  return scrollToSpy
}

/**
 * Creates a mock keyboard event
 */
export const createKeyboardEvent = (
  key: string,
  options: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}
) => {
  return new KeyboardEvent('keydown', {
    key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    altKey: options.altKey ?? false,
    bubbles: true,
  })
}

/**
 * Waits for a specified amount of time
 */
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Cleans up DOM after tests
 */
export const cleanupDOM = () => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
}
