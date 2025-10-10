import { TableOfContentsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { usePromptAPI } from "../hooks/usePromptAPI";
import type { TocItem } from "../hooks/usePromptAPI";
import { err, log } from "~lib/log";

export const TocPopup = () => {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const [toc, setToc] = useState<TocItem[]>([])
    const [useChunked, setUseChunked] = useState(false) // Toggle between chunked and single call
    const [currentTabId, setCurrentTabId] = useState<number | null>(null)

    const {
        isLoading,
        error,
        progress,
        downloadProgress,
        notDownloaded,
        checkModelAvailability,
        initializePromptSession,
        fetchToc,
        navigateToSection,
        setError,
        loadContextForCurrentTab,
        getCurrentTabId,
        stopLoading
    } = usePromptAPI()
    const abortController = useRef<AbortController | null>(new AbortController())

    const handleFetchToc = async () => {
        try {
            const items = await fetchToc(useChunked)
            setToc(items)
        } catch (error) {
            err('Failed to fetch TOC', error)
        }
    }

    const loadContextForTab = async () => {
        try {
            const tabId = await getCurrentTabId()
            if (tabId !== currentTabId) {
                setCurrentTabId(tabId)
                const contextToc = await loadContextForCurrentTab()
                if (contextToc.length > 0) {
                    log('sidepanel toc before setToc', { toc, contextToc })
                    setToc(contextToc)
                    log('sidepanel toc after setToc - state will update on next render', { contextToc })
                } else {
                    // No context found, try to fetch new TOC
                    log('No context found, trying to fetch new TOC')
                    const availability = await checkModelAvailability()
                    if (availability === 'available') {
                        handleFetchToc()
                    }
                }
            }
        } catch (error) {
            console.error('[TocPopup] Failed to load context for tab:', error)
        }
    }

    const handleNavigateToSection = async (cssSelector: string) => {
        try {
            await navigateToSection(cssSelector)
            setIsOpen(false)
        } catch (error) {
            // Error is already handled in the hook
        }
    }

    // Log when toc state actually updates
    useEffect(() => {
        log('toc state updated', { toc: toc.length })
        if (toc.length > 0) {
            log('toc state updated - aborting prompt API')
            log('toc : ', { toc })
            abortController.current?.abort()
            stopLoading()
        }
    }, [toc])

    useEffect(() => {
        const initializeComponent = async () => {
            // First, try to load context for current tab
            await loadContextForTab()

            if (toc.length === 0) {
                const availability = await checkModelAvailability()
                if (availability === 'available') {
                    handleFetchToc()
                } else if (availability === 'unavailable') {
                    setError(new Error('LanguageModel is not available on this device'))
                }
            }
        }
        initializeComponent()
    }, [])

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
    }, [currentTabId])

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

    // Show model download state
    if (notDownloaded) {
        return (
            <div ref={containerRef} className="relative">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <Spinner className="w-4 h-4 mr-2" />
                    Loading...
                </Button>

                {isOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 duration-200">
                        <div className="text-sm text-gray-600 flex flex-col items-center justify-center p-4">
                            <h2 className="text-lg font-semibold mb-4">AI Model Required</h2>
                            <p className="text-center mb-4">
                                The AI model needs to be downloaded before you can extract page sections.
                            </p>

                            {!downloadProgress.hidden && (
                                <div className="w-full max-w-xs mb-4">
                                    <div className="flex justify-between text-xs mb-1">
                                        <span>Downloading model...</span>
                                        {!downloadProgress.indeterminate && (
                                            <span>{Math.round(downloadProgress.value * 100)}%</span>
                                        )}
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div
                                            className={`h-2 rounded-full transition-all duration-300 ${downloadProgress.indeterminate
                                                ? 'bg-blue-500 animate-pulse w-full'
                                                : 'bg-blue-500'
                                                }`}
                                            style={{
                                                width: downloadProgress.indeterminate
                                                    ? '100%'
                                                    : `${downloadProgress.value * 100}%`
                                            }}
                                        />
                                    </div>
                                    {downloadProgress.indeterminate && (
                                        <p className="text-xs text-center mt-2">Extracting and loading model...</p>
                                    )}
                                </div>
                            )}

                            <Button
                                onClick={async () => {
                                    try {
                                        const session = await initializePromptSession(abortController.current)
                                        if (session) {
                                            // Model is ready, start the extraction process
                                            handleFetchToc()
                                        }
                                    } catch (error) {
                                        setError(error)
                                    }
                                }}
                                disabled={!downloadProgress.hidden}
                                size="sm"
                            >
                                {downloadProgress.hidden ? 'Download Model' : 'Downloading...'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Show loading state
    if (!toc.length && isLoading) {
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
                                    {progress.total > 0
                                        ? `Processing ${progress.done}/${progress.total} chunks...`
                                        : 'Extracting page sections...'
                                    }
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
                                onClick={handleFetchToc}
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

    // Show completed state with TOC items
    return (
        <div ref={containerRef} className="relative">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(!isOpen)}
            >
                <TableOfContentsIcon className="w-4 h-4 mr-1" />
                <span className="text-xs">{toc.length}</span>
            </Button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-[66vw] max-h-96 border border-gray-200 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 duration-200 overflow-hidden text-primary bg-black">
                    <div className="overflow-y-auto max-h-96">
                        <div className="space-y-3 p-4">
                            <div className="flex items-center justify-between pb-2 border-b">
                                <h3 className="font-semibold text-lg">Page Sections</h3>
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-gray-500">Chunked:</label>
                                    <Button
                                        onClick={() => setUseChunked(!useChunked)}
                                        variant={useChunked ? "default" : "outline"}
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                    >
                                        {useChunked ? 'ON' : 'OFF'}
                                    </Button>
                                </div>
                            </div>

                            {toc.length > 0 ? (
                                <div className="space-y-2">
                                    {toc.map((item, index) => (
                                        <Button
                                            key={index}
                                            variant="ghost"
                                            className="w-full justify-start h-auto p-3 text-left hover:bg-muted"
                                            onClick={() => handleNavigateToSection(item.cssSelector)}
                                        >
                                            <div className="flex flex-col items-start">
                                                <div className="font-medium text-sm text-primary">{item.title}</div>
                                                <div className="text-xs text-gray-500 font-mono mt-1 text-primary">{item.cssSelector}</div>
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-gray-500">
                                    <p className="text-sm">No sections found</p>
                                    <Button
                                        onClick={handleFetchToc}
                                        size="sm"
                                        variant="outline"
                                        className="mt-2"
                                    >
                                        Retry Extraction
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