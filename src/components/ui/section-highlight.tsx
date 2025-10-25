import React, { useEffect, useState, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { log } from '~lib/log'

interface SectionHighlightProps {
    sections: Array<{ title: string; cssSelector: string }>
    onNavigateToSection: (selector: string) => void
    currentSectionIndex: number
    onSectionChange: (index: number) => void
}

export const SectionHighlight: React.FC<SectionHighlightProps> = ({
    sections,
    onNavigateToSection,
    currentSectionIndex,
    onSectionChange
}) => {
    const [highlightedSection, setHighlightedSection] = useState<HTMLElement | null>(null)
    const [isNavigating, setIsNavigating] = useState(false)

    // Filter out sections with invalid selectors
    const validSections = sections.filter(section => {
        try {
            // Test if selector is valid
            document.querySelector(section.cssSelector)
            return true
        } catch {
            return false
        }
    })

    // Update current section index if it's now invalid
    useEffect(() => {
        if (currentSectionIndex >= validSections.length && validSections.length > 0) {
            onSectionChange(0)
        }
    }, [validSections.length, currentSectionIndex, onSectionChange])

    // Get current visible section based on scroll position
    // Change section when the next section reaches the top 20% of the viewport
    const getCurrentSection = useCallback(() => {
        if (validSections.length === 0) return -1

        const viewportTop = window.scrollY
        const viewportHeight = window.innerHeight
        const thresholdPosition = viewportTop + viewportHeight * 0.2 // Top 20% of viewport

        // Start from the last section and work backwards to find the first section whose top
        // has passed the threshold position
        for (let i = validSections.length - 1; i >= 0; i--) {
            const element = document.querySelector(validSections[i].cssSelector) as HTMLElement
            if (element && element.offsetTop <= thresholdPosition) {
                return i
            }
        }

        // If no section has passed the threshold, return the first section
        return 0
    }, [validSections])

    // Update current section on scroll
    useEffect(() => {
        const handleScroll = () => {
            // Don't update section index if we're currently navigating programmatically
            if (isNavigating) return
            
            const newIndex = getCurrentSection()
            if (newIndex !== currentSectionIndex) {
                onSectionChange(newIndex)
            }
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [getCurrentSection, currentSectionIndex, isNavigating, onSectionChange])

    // Highlight the current section
    useEffect(() => {
        // Remove previous highlight
        if (highlightedSection) {
            highlightedSection.style.outline = ''
            highlightedSection.style.outlineOffset = ''
        }

        // Add new highlight
        if (validSections[currentSectionIndex]) {
            const element = document.querySelector(validSections[currentSectionIndex].cssSelector) as HTMLElement
            if (element) {
                element.style.outline = '3px solid transparent'
                element.style.outlineOffset = '4px'
                element.style.backgroundImage = 'linear-gradient(white, white), linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                element.style.backgroundOrigin = 'border-box'
                element.style.backgroundClip = 'content-box, border-box'
                element.style.borderRadius = '8px'
                setHighlightedSection(element)
            }
        }

        // Cleanup function
        return () => {
            if (highlightedSection) {
                highlightedSection.style.outline = ''
                highlightedSection.style.outlineOffset = ''
                highlightedSection.style.backgroundImage = ''
                highlightedSection.style.backgroundOrigin = ''
                highlightedSection.style.backgroundClip = ''
                highlightedSection.style.borderRadius = ''
            }
        }
    }, [currentSectionIndex, sections, highlightedSection])

    // Navigate to previous section
    const navigateUp = useCallback(() => {
        if (validSections.length === 0) return

        const prevIndex = currentSectionIndex > 0 ? currentSectionIndex - 1 : validSections.length - 1
        const section = validSections[prevIndex]
        if (section) {
            setIsNavigating(true)
            onNavigateToSection(section.cssSelector)
            onSectionChange(prevIndex)
            
            // Re-enable scroll listener after animation completes (typical smooth scroll is ~500-1000ms)
            setTimeout(() => {
                setIsNavigating(false)
            }, 1000)
        }
    }, [currentSectionIndex, validSections, onNavigateToSection, onSectionChange])

    // Navigate to next section
    const navigateDown = useCallback(() => {
        if (validSections.length === 0) return

        const nextIndex = currentSectionIndex < validSections.length - 1 ? currentSectionIndex + 1 : 0
        const section = validSections[nextIndex]
        if (section) {
            setIsNavigating(true)
            onNavigateToSection(section.cssSelector)
            onSectionChange(nextIndex)
            
            // Re-enable scroll listener after animation completes (typical smooth scroll is ~500-1000ms)
            setTimeout(() => {
                setIsNavigating(false)
            }, 1000)
        }
    }, [currentSectionIndex, validSections, onNavigateToSection, onSectionChange])

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Check for Ctrl+Cmd+Up/Down (works on both Windows/Linux Ctrl+Alt and macOS Cmd+Ctrl)
            const isUp = event.key === 'ArrowUp' && event.ctrlKey && (event.metaKey || event.altKey)
            const isDown = event.key === 'ArrowDown' && event.ctrlKey && (event.metaKey || event.altKey)

            if (isUp || isDown) {
                event.preventDefault()
                log('[SectionHighlight] Keyboard navigation triggered', { key: event.key, isUp, isDown })

                if (isUp) {
                    navigateUp()
                } else if (isDown) {
                    navigateDown()
                }
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [navigateUp, navigateDown])

    // Don't render if no valid sections
    if (validSections.length === 0) {
        return null
    }

    return (
        <div className="fixed right-4 top-1/2 transform -translate-y-1/2 z-[9999] flex flex-col gap-2 items-end justify-end">
            {/* Up arrow */}
            <button
                onClick={navigateUp}
                className="w-10 h-10 bg-black/20 backdrop-blur-xl border border-gray-300 rounded shadow-lg hover:bg-white hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
                title={`Previous section (${currentSectionIndex > 0 ? validSections[currentSectionIndex - 1]?.title : validSections[validSections.length - 1]?.title})`}
                disabled={validSections.length <= 1}
            >
                <ChevronUp
                    className={`w-5 h-5 text-white group-hover:text-gray-900 transition-colors ${validSections.length <= 1 ? 'opacity-30' : ''
                        }`}
                />
            </button>

            {/* Section indicator */}
            <div className="bg-black/20 backdrop-blur-xl border border-white rounded-lg shadow-lg px-3 py-2 text-center">
                <div className="text-xs text-white mb-1">Section</div>
                <div className="text-sm font-medium text-white">
                    {currentSectionIndex + 1} / {validSections.length}
                </div>
                <div className="text-xs text-white max-w-[120px] truncate" title={validSections[currentSectionIndex]?.title}>
                    {validSections[currentSectionIndex]?.title}
                </div>
            </div>

            {/* Down arrow */}
            <button
                onClick={navigateDown}
                className="w-10 h-10 bg-black/20 backdrop-blur-xl border border-gray-300 rounded shadow-lg hover:bg-white hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
                title={`Next section (${currentSectionIndex < validSections.length - 1 ? validSections[currentSectionIndex + 1]?.title : validSections[0]?.title})`}
                disabled={validSections.length <= 1}
            >
                <ChevronDown
                    className={`w-5 h-5 text-white group-hover:text-gray-900 transition-colors ${validSections.length <= 1 ? 'opacity-30' : ''
                        }`}
                />
            </button>

            {/* Keyboard shortcut hint */}
            <div className="bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                Ctrl+Cmd+↑/↓ to navigate
            </div>
        </div>
    )
}
