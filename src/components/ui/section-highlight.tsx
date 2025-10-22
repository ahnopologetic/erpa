import React, { useEffect, useState, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { log } from '~lib/log'

interface SectionHighlightProps {
    sections: Array<{ title: string; cssSelector: string }>
    onNavigateToSection: (selector: string) => void
    onSectionChanged?: (sectionIndex: number) => void
}

export const SectionHighlight: React.FC<SectionHighlightProps> = ({
    sections,
    onNavigateToSection,
    onSectionChanged
}) => {
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
    const [highlightedSection, setHighlightedSection] = useState<HTMLElement | null>(null)
    const [isNavigating, setIsNavigating] = useState(false)

    // Filter out sections with invalid selectors or no matching elements
    const validSections = sections.filter(section => {
        try {
            // Test if selector matches an existing element
            const element = document.querySelector(section.cssSelector)
            return element !== null
        } catch {
            return false
        }
    })

    // Update current section index if it's now invalid
    useEffect(() => {
        if (currentSectionIndex >= validSections.length && validSections.length > 0) {
            setCurrentSectionIndex(0)
        }
    }, [validSections.length, currentSectionIndex])

    // Use Intersection Observer to detect current visible section
    useEffect(() => {
        if (validSections.length === 0) return

        const observerOptions = {
            root: null, // Use viewport as root
            rootMargin: '-20% 0px -20% 0px', // Trigger when section is 20% into viewport
            threshold: [0, 0.25, 0.5, 0.75, 1.0] // Multiple thresholds for better accuracy
        }

        const intersectingEntries = new Map<Element, IntersectionObserverEntry>()

        const observer = new IntersectionObserver((entries) => {
            // Don't update section index if we're currently navigating programmatically
            if (isNavigating) return

            // Update the intersecting entries map
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    intersectingEntries.set(entry.target, entry)
                } else {
                    intersectingEntries.delete(entry.target)
                }
            })

            // Find the section with highest intersection ratio
            let maxIntersectionRatio = 0
            let mostVisibleElement: Element | null = null

            intersectingEntries.forEach(entry => {
                if (entry.intersectionRatio > maxIntersectionRatio) {
                    maxIntersectionRatio = entry.intersectionRatio
                    mostVisibleElement = entry.target
                }
            })

            // Find the index of the most visible section
            if (mostVisibleElement) {
                const sectionIndex = validSections.findIndex(section => {
                    const element = document.querySelector(section.cssSelector)
                    return element === mostVisibleElement
                })

                if (sectionIndex !== -1 && sectionIndex !== currentSectionIndex) {
                    setCurrentSectionIndex(sectionIndex)
                    onSectionChanged?.(sectionIndex)
                }
            }
        }, observerOptions)

        // Observe all valid section elements
        validSections.forEach(section => {
            const element = document.querySelector(section.cssSelector)
            if (element) {
                observer.observe(element)
            }
        })

        // Cleanup
        return () => {
            observer.disconnect()
            intersectingEntries.clear()
        }
    }, [validSections, currentSectionIndex, isNavigating, onSectionChanged])

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
    }, [currentSectionIndex, validSections, highlightedSection])

    // Navigate to previous section
    const navigateUp = useCallback(() => {
        if (validSections.length === 0) return

        const prevIndex = currentSectionIndex > 0 ? currentSectionIndex - 1 : validSections.length - 1
        const section = validSections[prevIndex]
        if (section) {
            setIsNavigating(true)
            onNavigateToSection(section.cssSelector)
            setCurrentSectionIndex(prevIndex)
            onSectionChanged?.(prevIndex) // Notify TTS system about section change
            
            // Re-enable scroll listener after animation completes (typical smooth scroll is ~500-1000ms)
            setTimeout(() => {
                setIsNavigating(false)
            }, 1000)
        }
    }, [currentSectionIndex, validSections, onNavigateToSection, onSectionChanged])

    // Navigate to next section
    const navigateDown = useCallback(() => {
        if (validSections.length === 0) return

        const nextIndex = currentSectionIndex < validSections.length - 1 ? currentSectionIndex + 1 : 0
        const section = validSections[nextIndex]
        if (section) {
            setIsNavigating(true)
            onNavigateToSection(section.cssSelector)
            setCurrentSectionIndex(nextIndex)
            onSectionChanged?.(nextIndex) // Notify TTS system about section change
            
            // Re-enable scroll listener after animation completes (typical smooth scroll is ~500-1000ms)
            setTimeout(() => {
                setIsNavigating(false)
            }, 1000)
        }
    }, [currentSectionIndex, validSections, onNavigateToSection, onSectionChanged])

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
