import { TableOfContentsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { useFastSections } from "../hooks/useFastSections";
import type { Section } from "../hooks/useDetectSections";
import { err, log } from "~lib/log";

type TocPopupProps = {
    promptSession: LanguageModelSession
    onTocGenerated: (toc: Array<{ title: string; cssSelector: string }>) => void
}

export const TocPopup = ({ promptSession, onTocGenerated }: TocPopupProps) => {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const [sections, setSections] = useState<Section[]>([])
    const tocSentRef = useRef(false)

    // Use the new fast sections hook instead of prompt API
    const {
        sections: detectedSections,
        isLoading,
        error,
        loadSections,
        navigateToSection,
        loadContextForCurrentTab,
        saveContextForCurrentTab,
        setError
    } = useFastSections()

    const handleFetchSections = async () => {
        try {
            // Reset the ref when fetching new sections
            tocSentRef.current = false
            
            const detectedSections = await loadSections()
            setSections(detectedSections)
            // Save context for future use
            await saveContextForCurrentTab(detectedSections)
            // Notify parent component
            if (promptSession) {
                onTocGenerated(detectedSections)
                tocSentRef.current = true
            }
        } catch (error) {
            err('Failed to fetch sections', error)
        }
    }

    const loadContextForTab = async () => {
        try {
            // Reset the ref when loading new sections for a different tab
            tocSentRef.current = false
            
            const contextSections = await loadContextForCurrentTab()
            if (contextSections.length > 0) {
                log('Context found, setting sections', { contextSections })
                setSections(contextSections)
                // IMPORTANT: Always notify parent component when sections are loaded from localStorage
                // This ensures the prompt session gets the TOC for read out function
                if (promptSession) {
                    onTocGenerated(contextSections)
                    tocSentRef.current = true
                    log('Called onTocGenerated with sections from localStorage', { count: contextSections.length })
                } else {
                    log('Prompt session not ready yet, will send TOC when it becomes available')
                }
            } else {
                log('No context found, trying to detect new sections')
                await handleFetchSections()
            }
        } catch (error) {
            err('Failed to load context for tab', error)
            // Even on error, try to detect fresh sections
            await handleFetchSections()
        }
    }

    const handleNavigateToSection = async (cssSelector: string) => {
        try {
            await navigateToSection(cssSelector)
            setIsOpen(false)
        } catch (error) {
            err('Failed to navigate to section', error)
        }
    }


    // Auto-load sections when component mounts
    useEffect(() => {
        loadContextForTab()
    }, [])

    // Ensure TOC is sent to prompt session when it becomes available
    // This handles the race condition where sections might load before promptSession is ready
    useEffect(() => {
        if (promptSession && sections.length > 0 && !tocSentRef.current) {
            log('Prompt session is now available, ensuring TOC is sent', { sectionsCount: sections.length })
            onTocGenerated(sections)
            tocSentRef.current = true
        }
    }, [promptSession, sections, onTocGenerated])

    // Listen for tab changes
    useEffect(() => {
        const handleTabChange = () => {
            loadContextForTab()
        }

        // Listen for tab activation changes
        chrome.tabs.onActivated.addListener(handleTabChange)
        chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
            if (changeInfo.status === 'complete') {
                handleTabChange()
            }
        })

        return () => {
            chrome.tabs.onActivated.removeListener(handleTabChange)
            chrome.tabs.onUpdated.removeListener(handleTabChange)
        }
    }, [])

    // Handle click outside to close popover
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])


    // Show loading state
    if (!sections.length && isLoading) {
        return (
            <div ref={containerRef} className="relative">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <Spinner className="w-4 h-4 mr-2" />
                </Button>

                {isOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 duration-200">
                        <div className="flex items-center justify-center p-4">
                            <div className="text-center">
                                <Spinner className="w-8 h-8 mx-auto mb-2" />
                                <p className="text-sm text-gray-600">
                                    Detecting page sections...
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Show error state
    if (error) {
        return (
            <div ref={containerRef} className="relative">
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    Error
                </Button>

                {isOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 duration-200">
                        <div className="p-4">
                            <h3 className="font-semibold text-red-600 mb-2">Extraction Failed</h3>
                            <p className="text-sm text-gray-600">
                                {error instanceof Error ? error.message : 'Unknown error occurred'}
                            </p>
                            <Button
                                onClick={handleFetchSections}
                                size="sm"
                                className="mt-3"
                                variant="outline"
                            >
                                Retry
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Show completed state with sections
    return (
        <div ref={containerRef} className="relative">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(!isOpen)}
            >
                <TableOfContentsIcon className="w-4 h-4 mr-1" />
                <span className="text-xs">{sections.length}</span>
            </Button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-[66vw] max-h-96 border border-gray-200 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 duration-200 overflow-hidden text-primary bg-black">
                    <div className="overflow-y-auto max-h-96">
                        <div className="space-y-3 p-4">
                            <div className="flex items-center justify-between pb-2 border-b">
                                <h3 className="font-semibold text-lg">Page Sections</h3>
                                <div className="text-xs text-gray-500">
                                    Fast Detection
                                </div>
                            </div>

                            {sections.length > 0 ? (
                                <div className="space-y-2">
                                    {sections.map((section, index) => (
                                        <Button
                                            key={index}
                                            variant="ghost"
                                            className="w-full justify-start h-auto p-3 text-left hover:bg-muted"
                                            onClick={() => handleNavigateToSection(section.cssSelector)}
                                        >
                                            <div className="flex flex-col items-start">
                                                <div className="font-medium text-sm text-primary">{section.title}</div>
                                                <div className="text-xs text-gray-500 font-mono mt-1 text-primary">{section.cssSelector}</div>
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-gray-500">
                                    <p className="text-sm">No sections found</p>
                                    <Button
                                        onClick={handleFetchSections}
                                        size="sm"
                                        variant="outline"
                                        className="mt-2"
                                    >
                                        Detect Sections
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}