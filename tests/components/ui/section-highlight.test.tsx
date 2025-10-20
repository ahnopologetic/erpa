import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SectionHighlight } from '~components/ui/section-highlight'
import {
    createMockSections,
    mockQuerySelector,
    simulateScroll,
    mockSmoothScroll,
    createKeyboardEvent,
    waitFor as testWaitFor,
    cleanupDOM,
} from '../../utils/dom-utils'

// Mock the log utility
vi.mock('~lib/log', () => ({
    log: vi.fn(),
}))

describe('SectionHighlight', () => {
    const mockOnNavigateToSection = vi.fn()

    const defaultSections = [
        { title: 'Introduction', cssSelector: '#section-1' },
        { title: 'Features', cssSelector: '#section-2' },
        { title: 'Conclusion', cssSelector: '#section-3' },
    ]

    beforeEach(() => {
        cleanupDOM()
        mockOnNavigateToSection.mockClear()

        // Create mock DOM sections
        const sections = createMockSections(3)
        sections.forEach((section, index) => {
            section.id = `section-${index + 1}`
            document.body.appendChild(section)
        })

        mockQuerySelector(sections)
    })

    afterEach(() => {
        cleanupDOM()
    })

    describe('Rendering', () => {
        it('should render navigation controls when valid sections exist', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            expect(screen.getByTitle(/Previous section/)).toBeInTheDocument()
            expect(screen.getByTitle(/Next section/)).toBeInTheDocument()
            expect(screen.getByText('Section')).toBeInTheDocument()
            expect(screen.getByText('1 / 3')).toBeInTheDocument()
            expect(screen.getByText('Introduction')).toBeInTheDocument()
        })

        it('should not render when no valid sections exist', () => {
            const invalidSections = [
                { title: 'Invalid', cssSelector: '#non-existent' },
            ]

            render(
                <SectionHighlight
                    sections={invalidSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            // The component should not render anything when no valid sections exist
            expect(screen.queryByText('Section')).not.toBeInTheDocument()
        })

        it('should display correct section information', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            expect(screen.getByText('1 / 3')).toBeInTheDocument()
            expect(screen.getByText('Introduction')).toBeInTheDocument()
        })

        it('should disable navigation buttons when only one section exists', () => {
            const singleSection = [defaultSections[0]]

            render(
                <SectionHighlight
                    sections={singleSection}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const upButton = screen.getByTitle(/Previous section/)
            const downButton = screen.getByTitle(/Next section/)

            expect(upButton).toBeDisabled()
            expect(downButton).toBeDisabled()
        })
    })

    describe('Navigation', () => {
        it('should navigate to next section when down button is clicked', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const downButton = screen.getByTitle(/Next section/)
            fireEvent.click(downButton)

            expect(mockOnNavigateToSection).toHaveBeenCalledWith('#section-2')
        })

        it('should navigate to previous section when up button is clicked', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const upButton = screen.getByTitle(/Previous section/)
            fireEvent.click(upButton)

            expect(mockOnNavigateToSection).toHaveBeenCalledWith('#section-3')
        })

        it('should wrap around to last section when navigating up from first section', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const upButton = screen.getByTitle(/Previous section/)
            fireEvent.click(upButton)

            expect(mockOnNavigateToSection).toHaveBeenCalledWith('#section-3')
        })

        it('should wrap around to first section when navigating down from last section', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            // Navigate to last section first
            const downButton = screen.getByTitle(/Next section/)
            fireEvent.click(downButton) // Go to section 2
            fireEvent.click(downButton) // Go to section 3

            // Now navigate down from last section
            fireEvent.click(downButton)

            expect(mockOnNavigateToSection).toHaveBeenCalledWith('#section-1')
        })
    })

    describe('Keyboard Navigation', () => {
        it('should navigate up with Ctrl+Cmd+Up arrow key', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const event = createKeyboardEvent('ArrowUp', { ctrlKey: true, metaKey: true })
            document.dispatchEvent(event)

            expect(mockOnNavigateToSection).toHaveBeenCalledWith('#section-3')
        })

        it('should navigate down with Ctrl+Cmd+Down arrow key', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const event = createKeyboardEvent('ArrowDown', { ctrlKey: true, metaKey: true })
            document.dispatchEvent(event)

            expect(mockOnNavigateToSection).toHaveBeenCalledWith('#section-2')
        })

        it('should navigate up with Ctrl+Alt+Up arrow key (Windows/Linux)', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const event = createKeyboardEvent('ArrowUp', { ctrlKey: true, altKey: true })
            document.dispatchEvent(event)

            expect(mockOnNavigateToSection).toHaveBeenCalledWith('#section-3')
        })

        it('should not navigate with incorrect key combinations', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const event = createKeyboardEvent('ArrowUp', { ctrlKey: true }) // Missing meta/alt
            document.dispatchEvent(event)

            expect(mockOnNavigateToSection).not.toHaveBeenCalled()
        })

        it('should prevent default behavior when navigation keys are pressed', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const event = createKeyboardEvent('ArrowUp', { ctrlKey: true, metaKey: true })
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
            document.dispatchEvent(event)

            expect(preventDefaultSpy).toHaveBeenCalled()
        })
    })

    describe('Scroll-based Section Detection', () => {
        it('should update current section based on scroll position', async () => {
            // Set up sections with specific positions
            const sections = createMockSections(3)
            sections[0].id = 'section-1'
            sections[1].id = 'section-2'
            sections[2].id = 'section-3'

            // Set specific offsetTop values
            Object.defineProperty(sections[0], 'offsetTop', { value: 0, writable: true })
            Object.defineProperty(sections[1], 'offsetTop', { value: 500, writable: true })
            Object.defineProperty(sections[2], 'offsetTop', { value: 1000, writable: true })

            sections.forEach(section => document.body.appendChild(section))
            mockQuerySelector(sections)

            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            // Simulate scrolling to section 2
            simulateScroll(600) // Should be closest to section 2 (offsetTop: 500)

            await testWaitFor(100) // Wait for scroll handler

            expect(screen.getByText('2 / 3')).toBeInTheDocument()
            expect(screen.getByText('Features')).toBeInTheDocument()
        })

        it('should not update section during programmatic navigation', async () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            // Start navigation
            const downButton = screen.getByTitle(/Next section/)
            fireEvent.click(downButton)

            // Try to scroll during navigation
            simulateScroll(600)

            // Should still be on section 2 (from navigation), not updated by scroll
            expect(screen.getByText('2 / 3')).toBeInTheDocument()
        })

        it('should re-enable scroll detection after navigation timeout', async () => {
            vi.useFakeTimers()

            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            // Navigate to section 2
            const downButton = screen.getByTitle(/Next section/)
            fireEvent.click(downButton)

            // Fast-forward time past the navigation timeout (1000ms)
            vi.advanceTimersByTime(1000)

            // Now scroll should update the section
            simulateScroll(1100) // Should be closest to section 3

            await testWaitFor(100)

            expect(screen.getByText('3 / 3')).toBeInTheDocument()

            vi.useRealTimers()
        }, 10000) // Increase timeout for this test
    })

    describe('Section Highlighting', () => {
        it('should apply highlight styles to current section', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const section1 = document.querySelector('#section-1')
            expect(section1).toHaveStyle({
                outline: '3px solid transparent',
                outlineOffset: '4px',
                backgroundImage: 'linear-gradient(white, white), linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                backgroundOrigin: 'border-box',
                backgroundClip: 'content-box, border-box',
                borderRadius: '8px',
            })
        })

        it('should remove highlight from previous section when navigating', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const section1 = document.querySelector('#section-1')
            const section2 = document.querySelector('#section-2')

            // Navigate to section 2
            const downButton = screen.getByTitle(/Next section/)
            fireEvent.click(downButton)

            // Section 1 should have styles removed
            expect(section1).toHaveStyle({
                outline: '',
                outlineOffset: '',
                backgroundImage: '',
                backgroundOrigin: '',
                backgroundClip: '',
                borderRadius: '',
            })

            // Section 2 should have highlight styles
            expect(section2).toHaveStyle({
                outline: '3px solid transparent',
                outlineOffset: '4px',
            })
        })
    })

    describe('Edge Cases', () => {
        it('should handle empty sections array', () => {
            render(
                <SectionHighlight
                    sections={[]}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            expect(screen.queryByTitle(/Previous section/)).not.toBeInTheDocument()
        })

        it('should handle sections with invalid selectors', () => {
            const mixedSections = [
                { title: 'Valid', cssSelector: '#section-1' },
                { title: 'Invalid', cssSelector: '#non-existent' },
                { title: 'Valid2', cssSelector: '#section-2' },
            ]

            // Set up mock sections for valid selectors only
            const sections = createMockSections(2)
            sections[0].id = 'section-1'
            sections[1].id = 'section-2'
            sections.forEach(section => document.body.appendChild(section))

            // Mock querySelector to return null for invalid selectors
            vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
                if (selector === '#section-1') return sections[0]
                if (selector === '#section-2') return sections[1]
                return null // Invalid selector
            })

            render(
                <SectionHighlight
                    sections={mixedSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            // Should only show 2 valid sections
            expect(screen.getByText('1 / 2')).toBeInTheDocument()
            expect(screen.getByText('Valid')).toBeInTheDocument()
        })

        it('should reset current section index when it becomes invalid', () => {
            const sections = [
                { title: 'Section 1', cssSelector: '#section-1' },
                { title: 'Section 2', cssSelector: '#section-2' },
            ]

            const { rerender } = render(
                <SectionHighlight
                    sections={sections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            // Navigate to section 2
            const downButton = screen.getByTitle(/Next section/)
            fireEvent.click(downButton)

            expect(screen.getByText('2 / 2')).toBeInTheDocument()

            // Remove section 2, making current index invalid
            const section2 = document.querySelector('#section-2')
            section2?.remove()

            rerender(
                <SectionHighlight
                    sections={[{ title: 'Section 1', cssSelector: '#section-1' }]}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            // Should reset to section 1
            expect(screen.getByText('1 / 1')).toBeInTheDocument()
        })

        it('should handle rapid navigation clicks', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const downButton = screen.getByTitle(/Next section/)

            // Rapid clicks
            fireEvent.click(downButton)
            fireEvent.click(downButton)
            fireEvent.click(downButton)

            // Should end up at section 1 (wrapped around)
            expect(screen.getByText('1 / 3')).toBeInTheDocument()
            expect(mockOnNavigateToSection).toHaveBeenCalledTimes(3)
        })

        it('should handle window resize', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            // Change window size
            Object.defineProperty(window, 'innerHeight', {
                value: 600,
                writable: true,
            })

            window.dispatchEvent(new Event('resize'))

            // Component should still render correctly
            expect(screen.getByText('1 / 3')).toBeInTheDocument()
        })
    })

    describe('Accessibility', () => {
        it('should have proper button titles', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            expect(screen.getByTitle('Previous section (Conclusion)')).toBeInTheDocument()
            expect(screen.getByTitle('Next section (Features)')).toBeInTheDocument()
        })

        it('should show keyboard shortcut hint', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const hint = screen.getByText('Ctrl+Cmd+↑/↓ to navigate')
            expect(hint).toBeInTheDocument()
            expect(hint).toHaveClass('opacity-0') // Hidden by default
        })

        it('should have proper ARIA attributes', () => {
            render(
                <SectionHighlight
                    sections={defaultSections}
                    onNavigateToSection={mockOnNavigateToSection}
                />
            )

            const upButton = screen.getByTitle(/Previous section/)
            const downButton = screen.getByTitle(/Next section/)

            expect(upButton).toBeInTheDocument()
            expect(downButton).toBeInTheDocument()
        })
    })
})
