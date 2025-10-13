import React, { useEffect, useState, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { log } from '~lib/log'

interface SectionHighlightProps {
    sections: Array<{ title: string; cssSelector: string }>
    onNavigateToSection: (selector: string) => void
}

export const SectionHighlight: React.FC<SectionHighlightProps> = ({
    sections,
    onNavigateToSection
}) => {
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
    const [highlightedSection, setHighlightedSection] = useState<HTMLElement | null>(null)

    // Filter out sections with invalid selectors
    const validSections = sections.filter(section => {
        try {
            // Test if selector is valid
            document.querySelector(section.cssSelector)
            return true
        } catch {
            log('[SectionHighlight] Filtering out invalid selector:', section.cssSelector)
            return false
        }
    })

    // Update current section index if it's now invalid
    useEffect(() => {
        if (currentSectionIndex >= validSections.length && validSections.length > 0) {
            setCurrentSectionIndex(0)
        }
    }, [validSections.length, currentSectionIndex])

    // Get current visible section based on scroll position
    const getCurrentSection = useCallback(() => {
        if (validSections.length === 0) return -1

        const scrollPosition = window.scrollY + window.innerHeight / 2
        let closestIndex = 0
        let closestDistance = Infinity

         validSections.forEach((section, index) => {
             const element = document.querySelector(section.cssSelector) as HTMLElement
             if (element) {
                 const elementTop = element.offsetTop
                 const distance = Math.abs(scrollPosition - elementTop)
                 if (distance < closestDistance) {
                     closestDistance = distance
                     closestIndex = index
                 }
             }
         })

        return closestIndex
    }, [validSections])

    // Update current section on scroll
    useEffect(() => {
        const handleScroll = () => {
            const newIndex = getCurrentSection()
            if (newIndex !== currentSectionIndex) {
                setCurrentSectionIndex(newIndex)
            }
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [getCurrentSection, currentSectionIndex])

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
             onNavigateToSection(section.cssSelector)
             setCurrentSectionIndex(prevIndex)
         }
     }, [currentSectionIndex, validSections, onNavigateToSection])

     // Navigate to next section
     const navigateDown = useCallback(() => {
         if (validSections.length === 0) return

         const nextIndex = currentSectionIndex < validSections.length - 1 ? currentSectionIndex + 1 : 0
         const section = validSections[nextIndex]
         if (section) {
             onNavigateToSection(section.cssSelector)
             setCurrentSectionIndex(nextIndex)
         }
     }, [currentSectionIndex, validSections, onNavigateToSection])

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
                className="w-10 h-10 bg-white/90 backdrop-blur-sm border border-gray-200 rounded shadow-lg hover:bg-white hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
                 title={`Previous section (${currentSectionIndex > 0 ? validSections[currentSectionIndex - 1]?.title : validSections[validSections.length - 1]?.title})`}
                 disabled={validSections.length <= 1}
            >
                <ChevronUp
                    className={`w-5 h-5 text-gray-600 group-hover:text-gray-800 transition-colors ${sections.length <= 1 ? 'opacity-30' : ''
                        }`}
                />
            </button>

            {/* Section indicator */}
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500 mb-1">Section</div>
                <div className="text-sm font-medium text-gray-800">
                    {currentSectionIndex + 1} / {sections.length}
                </div>
                <div className="text-xs text-gray-600 max-w-[120px] truncate" title={sections[currentSectionIndex]?.title}>
                    {sections[currentSectionIndex]?.title}
                </div>
            </div>

            {/* Down arrow */}
            <button
                onClick={navigateDown}
                className="w-10 h-10 bg-white/90 backdrop-blur-sm border border-gray-200 rounded shadow-lg hover:bg-white hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
                title={`Next section (${currentSectionIndex < sections.length - 1 ? sections[currentSectionIndex + 1]?.title : sections[0]?.title})`}
                disabled={sections.length <= 1}
            >
                <ChevronDown
                    className={`w-5 h-5 text-gray-600 group-hover:text-gray-800 transition-colors ${sections.length <= 1 ? 'opacity-30' : ''
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
