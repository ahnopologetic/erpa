import { SendIcon } from "lucide-react"
import React from "react"
import { TocPopup } from "~components/toc-popup"
import { Button } from "~components/ui/button"
import { ChatInterface } from "~components/ui/chat-interface"
import { Textarea } from "~components/ui/textarea"
import { VoicePoweredOrb } from "~components/ui/voice-powered-orb"
import { err, log, warn } from "~lib/log"
import { ErpaChatAgent, useErpaChatAgent } from "~hooks/useErpaChatAgent"
import { getContentFunction, navigateFunction, readOutFunction } from "~lib/functions/definitions"
import "~style.css"
import type { ChatMessage } from "~types/voice-memo"

function Sidepanel() {
    const [isListening, setIsListening] = React.useState(false)
    const [contextChanged, setContextChanged] = React.useState(false)
    const [isTranscribing, setIsTranscribing] = React.useState(false)
    const [isSidepanelEnabled, setIsSidepanelEnabled] = React.useState(true)
    const [currentTabId, setCurrentTabId] = React.useState<number | null>(null)
    const [currentUrl, setCurrentUrl] = React.useState<string>('')
    const [mode, setMode] = React.useState<"voice" | "text">("voice")
    const [textInput, setTextInput] = React.useState("")
    const [isProcessingText, setIsProcessingText] = React.useState(false)
    const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([])
    const [chatLoading, setChatLoading] = React.useState(false)
    const [currentStreamingMessageId, setCurrentStreamingMessageId] = React.useState<string | null>(null)

    const agent = React.useRef<ErpaChatAgent | null>(null)

    // Handle agent message updates
    const handleAgentMessageUpdate = React.useCallback((message: ChatMessage) => {
        setChatMessages(prev => {
            // Always create new messages, don't replace existing ones
            // Check if message already exists
            const existingIndex = prev.findIndex(m => m.id === message.id);

            if (existingIndex >= 0) {
                // Update existing message (for streaming text updates)
                const updated = [...prev];
                updated[existingIndex] = message;

                // Set streaming indicator for text messages only
                if (message.id.startsWith('text-')) {
                    setCurrentStreamingMessageId(message.id);
                }

                return updated;
            } else {
                // Add new message
                if (message.id.startsWith('text-')) {
                    setCurrentStreamingMessageId(message.id);
                }

                return [...prev, message];
            }
        });
    }, []);

    // Handle agent progress updates
    const handleAgentProgressUpdate = React.useCallback((iteration: number, action: string, status: string) => {
        // Clear streaming indicator when new iteration starts
        if (action === "Processing") {
            setCurrentStreamingMessageId(null);
        }

        const progressMessage: ChatMessage = {
            id: `progress-${iteration}`,
            progressUpdate: {
                iteration,
                action,
                status
            },
            createdAt: Date.now()
        };

        setChatMessages(prev => {
            // Remove any existing progress message for this iteration
            const filtered = prev.filter(m => m.id !== `progress-${iteration}`);
            return [...filtered, progressMessage];
        });
    }, []);


    React.useEffect(() => {
        const getCurrentTab = async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab && tab.id && tab.url) {
                    setCurrentTabId(tab.id);
                    setCurrentUrl(tab.url);
                }
            } catch (error) {
                log('Failed to get current tab', error);
            }
        };


        const initializeErpaAgent = async () => {
            agent.current = new ErpaChatAgent({
                functions: [navigateFunction, readOutFunction, getContentFunction],
                systemPrompt: "You're a helpful AI browser agent who helps visually impaired users navigate and understand websites.",
                maxIterations: 2,
                onMessageUpdate: handleAgentMessageUpdate,
                onProgressUpdate: handleAgentProgressUpdate,
            })
        }

        initializeErpaAgent()
        getCurrentTab()
    }, [])

    React.useEffect(() => {
        const handleMessage = async (message: any) => {
            if (message.type === 'CLOSE_SIDEPANEL_ON_TAB_SWITCH' ||
                message.type === 'CLOSE_SIDEPANEL_ON_PAGE_NAVIGATION') {
                log(`Received close message: ${message.type} for tab ${message.tabId}`);
                // Show notification that context has changed
                setIsSidepanelEnabled(false);
                setContextChanged(true);
                log('Context changed - showing notification');
            }
            if (message.type === "close-sidepanel") {
                log(`Received close message: ${message.type}`);
                setIsSidepanelEnabled(false);
                setContextChanged(true);
            }

            if (message.type === "speech-recognition-started") {
                setIsListening(true)
            }
            if (message.type === "speech-recognition-result") {
                log('[speech-recognition-result] Speech recognition result received', { message })
                setChatMessages(prev => [...prev, {
                    id: `speech-recognition-result-${Date.now()}`,
                    voiceMemo: {
                        id: `speech-recognition-result-${Date.now()}`,
                        type: 'user',
                        audioBlob: new Blob(),
                        transcription: message.transcript,
                        timestamp: Date.now()
                    },
                    createdAt: Date.now()
                } as ChatMessage])
                await agent.current.run(message.transcript)
            }
            if (message.type === "speech-recognition-error") {
                log('[speech-recognition-error] Speech recognition error received', { message })
                setChatMessages(prev => [...prev, {
                    id: `speech-recognition-error-${Date.now()}`,
                    voiceMemo: {
                        id: `speech-recognition-error-${Date.now()}`,
                        type: 'user',
                        audioBlob: new Blob(),
                        transcription: `Transcription error: ${message.error}`,
                        timestamp: Date.now()
                    },
                    createdAt: Date.now()
                } as ChatMessage])
                setIsListening(false)
            }
            if (message.type === "speech-recognition-ended") {
                log('[speech-recognition-ended] Speech recognition ended', { message })
                setIsListening(false)
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);

        return () => {
            chrome.runtime.onMessage.removeListener(handleMessage);
        };
    }, [agent.current, isListening]);


    const handleTocGenerated = React.useCallback(async (sections: Array<{ title: string; cssSelector: string }>) => {
        if (!sections || sections.length === 0) {
            warn('No sections provided to handleTocGenerated')
            return
        }

        log('Appending table of contents to prompt session', {
            sectionsCount: sections.length,
            sections: sections.map(s => s.title)
        })
        await agent.current.initialize()
        await agent.current.addToContext([{ role: 'system', content: `The table of contents is: ${sections.map(s => `Name: ${s.title} (Selector: ${s.cssSelector})`).join('\n')}` }])
    }, [agent])

    const deleteMessage = React.useCallback((messageId: string) => {
        setChatMessages(prev => prev.filter(msg => msg.id !== messageId))
    }, [])

    const handleTextSubmit = async () => {
        if (!textInput.trim() || !agent.current) {
            log('Agent not initialized')
            return
        }

        const userMessage = textInput.trim()
        const messageId = Date.now().toString()

        // Add user message to chat
        setChatMessages(prev => [...prev, {
            id: messageId,
            voiceMemo: {
                id: messageId,
                type: 'user',
                audioBlob: new Blob(),
                transcription: userMessage,
                timestamp: Date.now()
            },
            createdAt: Date.now()
        } as ChatMessage])

        // Clear input and set loading states
        setTextInput("")
        setIsProcessingText(true)
        setChatLoading(true)

        try {
            log('Starting agent execution with task:', userMessage)

            await agent.current.run(userMessage)

            log('Agent execution completed')
        } catch (error) {
            err('Agent execution failed:', error)

            // Add error message to chat
            const errorMessage: ChatMessage = {
                id: `error-${Date.now()}`,
                voiceMemo: {
                    id: `error-${Date.now()}`,
                    type: 'ai',
                    audioBlob: new Blob(),
                    transcription: `Error: ${error.message}`,
                    timestamp: Date.now()
                },
                createdAt: Date.now()
            };
            setChatMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsProcessingText(false)
            setChatLoading(false)
            setCurrentStreamingMessageId(null)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleTextSubmit()
        }
    }

    if (!isSidepanelEnabled) {
        return (
            <div className="dark h-screen flex flex-col bg-gray-900 text-white">
                {contextChanged && (
                    <div className="bg-yellow-600 text-white p-3 text-center text-sm">
                        <p className="font-medium">Context Changed</p>
                        <p className="text-xs mt-1">Tab or page changed. Context preserved for each tab.</p>
                        <button
                            onClick={() => setContextChanged(false)}
                            className="mt-2 px-3 py-1 bg-yellow-700 hover:bg-yellow-800 rounded text-xs"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
                <div className="flex-1 overflow-auto p-4 relative z-10">
                    <h1 className="text-xl font-semibold">Sidepanel is disabled</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Sidepanel is disabled. Please click the logo above to reopen it.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="dark h-screen flex flex-col bg-gray-900 text-white">
            {contextChanged && (
                <div className="bg-yellow-600 text-white p-3 text-center text-sm">
                    <p className="font-medium">Context Changed</p>
                    <p className="text-xs mt-1">Tab or page changed. Context preserved for each tab.</p>
                    <button
                        onClick={() => setContextChanged(false)}
                        className="mt-2 px-3 py-1 bg-yellow-700 hover:bg-yellow-800 rounded text-xs"
                    >
                        Dismiss
                    </button>
                </div>
            )}
            {/* Background animated Spline */}
            <div className="spline-container absolute top-0 left-0 w-full h-full z-0 pointer-events-none">
                <iframe
                    src="https://my.spline.design/glowingplanetparticles-HmCVKutonlFn3Oqqe6DI9nWi/"
                    frameBorder="0"
                    width="100%"
                    height="100%"
                    id="aura-spline"
                    style={{ pointerEvents: "none" }}
                    aria-hidden="true"
                    tabIndex={-1}
                />
            </div>
            {/* Header */}
            <div className="relative z-10 p-4 border-b border-gray-700">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-semibold">Erpa</h1>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                    {(isProcessingText) ? "Processing your message..." :
                        "Type your message below to start a conversation, or use speech recognition from the content script."}
                </p>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative z-10">
                <ChatInterface
                    messages={chatMessages}
                    onDeleteMessage={deleteMessage}
                    isLoading={chatLoading || isTranscribing || isProcessingText}
                    currentStreamingMessageId={currentStreamingMessageId}
                    className="h-full"
                />
            </div>

            <div className="action-panel flex z-10 bg-black">
                <div className="toc h-full flex items-center justify-center px-2">
                    <TocPopup onTocGenerated={handleTocGenerated} />
                </div>
                <div className="flex items-center justify-center bg-transparent py-4 w-full">
                    {mode === "voice" && (
                        <div className="px-2" onClick={(e) => e.stopPropagation()}>
                            <div onClick={() => {
                                chrome.runtime.sendMessage({ type: 'toggle-mic', target: 'content' })
                            }} className="cursor-pointer">
                                <VoicePoweredOrb
                                    enableVoiceControl={false}
                                    isRecording={isListening}
                                    className="rounded-xl overflow-hidden shadow-2xl hover:scale-120 transition-all duration-300 max-h-24"
                                />
                            </div>
                        </div>
                    )}
                    {mode === "text" && (
                        <div className="w-full px-2 flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                            <Textarea
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                onKeyPress={handleKeyPress}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-xl overflow-hidden shadow-2xl hover:scale-120 transition-all duration-300 max-h-24 w-full px-4 text-sm resize-none"
                                placeholder="Type your message..."
                                disabled={isProcessingText}
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleTextSubmit()
                                }}
                                disabled={!textInput.trim() || isProcessingText}
                                className="flex-shrink-0"
                            >
                                {isProcessingText ? (
                                    <div className="w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <SendIcon className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Sidepanel