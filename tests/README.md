# Test Suite for ERPA Extension

This directory contains comprehensive tests for the ERPA browser extension, focusing on DOM manipulation, intersection observers, and React component testing.

## Test Setup

The test environment is configured with:

- **Vitest** - Fast unit test runner
- **jsdom** - DOM simulation environment
- **@testing-library/react** - React component testing utilities
- **@testing-library/jest-dom** - Custom Jest matchers for DOM assertions

## Test Structure

```
tests/
├── setup.ts                    # Global test setup and mocks
├── utils/
│   ├── dom-utils.ts           # DOM manipulation utilities
│   └── test-helpers.ts        # Additional test helpers
└── components/
    └── ui/
        └── section-highlight.test.tsx  # Section highlight component tests
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests once (CI mode)
pnpm test:run

# Run tests with coverage
pnpm test:coverage
```

## Test Categories

### Section Highlight Component Tests

The `section-highlight.test.tsx` file includes comprehensive tests for:

#### 1. Rendering Tests
- Component renders with valid sections
- Component doesn't render with invalid sections
- Correct section information display
- Button state management (disabled when only one section)

#### 2. Navigation Tests
- Up/down button navigation
- Wrap-around navigation (last to first, first to last)
- Keyboard navigation (Ctrl+Cmd+Up/Down)
- Cross-platform keyboard support (Windows/Linux Ctrl+Alt)

#### 3. Scroll-based Detection
- Automatic section detection based on scroll position
- Prevention of scroll updates during programmatic navigation
- Re-enabling scroll detection after navigation timeout

#### 4. Section Highlighting
- Visual highlighting of current section
- Proper cleanup of previous highlights
- CSS style application and removal

#### 5. Edge Cases
- Empty sections array
- Invalid CSS selectors
- Rapid navigation clicks
- Window resize handling
- Section removal during navigation

#### 6. Accessibility
- Proper button titles and tooltips
- Keyboard shortcut hints
- ARIA attributes

## Mock Utilities

### DOM Utils (`dom-utils.ts`)
- `createMockElement()` - Creates mock DOM elements with properties
- `createMockSections()` - Creates multiple mock sections
- `mockQuerySelector()` - Mocks document.querySelector
- `simulateScroll()` - Simulates scroll events
- `mockSmoothScroll()` - Mocks smooth scrolling behavior
- `createKeyboardEvent()` - Creates keyboard events for testing

### Test Helpers (`test-helpers.ts`)
- `createScrollToMock()` - Advanced scroll mocking
- `createIntersectionObserverMock()` - Intersection Observer mocking
- `setupTestEnvironment()` - Sets up test DOM structure
- `waitForCondition()` - Waits for async conditions
- `mockConsole()` - Console output mocking

## Key Features Tested

### Intersection Observer
- Proper mocking of IntersectionObserver API
- Callback triggering for testing
- Entry creation for different scenarios

### DOM Manipulation
- Element creation and property setting
- Query selector mocking
- Scroll event simulation
- Window resize simulation

### React Component Testing
- Component rendering and state changes
- User interaction simulation
- Event handling verification
- Async operation testing

## Best Practices

1. **Isolation**: Each test is isolated with proper setup/teardown
2. **Mocking**: Comprehensive mocking of browser APIs
3. **Edge Cases**: Field testing of edge cases and error conditions
4. **Accessibility**: Testing accessibility features and keyboard navigation
5. **Performance**: Testing rapid interactions and async operations

## Adding New Tests

When adding new tests:

1. Follow the existing naming convention (`*.test.tsx`)
2. Use the provided utilities for DOM manipulation
3. Mock browser APIs appropriately
4. Test both happy path and edge cases
5. Include accessibility testing where applicable
6. Clean up after each test

## Debugging Tests

- Use `console.log` in tests (mocked by default, but can be enabled)
- Use `pnpm test:ui` for interactive debugging
- Check coverage reports with `pnpm test:coverage`
- Use `waitFor` for async operations
- Use `vi.advanceTimersByTime()` for timer-based tests
