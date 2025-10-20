import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn()
mockIntersectionObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null,
})
window.IntersectionObserver = mockIntersectionObserver
global.IntersectionObserver = mockIntersectionObserver

// Mock ResizeObserver
const mockResizeObserver = vi.fn()
mockResizeObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null,
})
window.ResizeObserver = mockResizeObserver
global.ResizeObserver = mockResizeObserver

// Mock scrollTo
window.scrollTo = vi.fn()

// Mock getBoundingClientRect
Element.prototype.getBoundingClientRect = vi.fn(() => ({
  width: 120,
  height: 120,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
  x: 0,
  y: 0,
  toJSON: vi.fn(),
}))

// Mock offsetTop and offsetHeight
Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
  value: 0,
  writable: true,
})

Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  value: 100,
  writable: true,
})

Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
  value: 0,
  writable: true,
})

Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  value: 100,
  writable: true,
})

// Mock window properties
Object.defineProperty(window, 'innerHeight', {
  value: 768,
  writable: true,
})

Object.defineProperty(window, 'innerWidth', {
  value: 1024,
  writable: true,
})

Object.defineProperty(window, 'scrollY', {
  value: 0,
  writable: true,
})

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Keep error and warn for debugging
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}

// Mock the log utility from lib
vi.mock('~lib/log', () => ({
  log: vi.fn(),
}))

// Mock Chrome APIs if needed
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
} as any
