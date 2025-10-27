import { MicIcon, PencilIcon, SendIcon, SettingsIcon } from "lucide-react"
import React from "react"
import { TocPopup } from "~components/toc-popup"
import { Button } from "~components/ui/button"
import { ChatInterface } from "~components/ui/chat-interface"
import { Textarea } from "~components/ui/textarea"
import { VoicePoweredOrb } from "~components/ui/voice-powered-orb"
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "~components/ui/select"
import { err, log, warn } from "~lib/log"
import { ErpaChatAgent, useErpaChatAgent } from "~hooks/useErpaChatAgent"
import { getContentFunction, navigateFunction, readOutFunction, semanticSearchFunction, summarizePageFunction } from "~lib/functions/definitions"
import { UserConfigProvider } from "~contexts/UserConfigContext"
import { SettingsDialog } from "~components/settings/settings-dialog"
import "~style.css"
import type { ChatMessage } from "~types/voice-memo"
import systemPrompt from "~lib/prompt"
import icon from "data-base64:/assets/logo.png"
import "~lib/test-notification"
import { ttsCoordinator } from "~lib/tts-coordinator"


function Sidepanel() {
    const [isListening, setIsListening] = React.useState(false)
    const [isTranscribing, setIsTranscribing] = React.useState(false)
    const [isSidepanelEnabled, setIsSidepanelEnabled] = React.useState(true)
    const [currentTabId, setCurrentTabId] = React.useState<number | null>(null)
    const [currentUrl, setCurrentUrl] = React.useState<string>('')
    const [availableTabs, setAvailableTabs] = React.useState<Array<{ id: number, title: string, url: string }>>([])
    const [mode, setMode] = React.useState<"voice" | "text">("voice")
    const [textInput, setTextInput] = React.useState("")
    const [isProcessingText, setIsProcessingText] = React.useState(false)
    const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([])
    const [chatLoading, setChatLoading] = React.useState(false)
    const [currentStreamingMessageId, setCurrentStreamingMessageId] = React.useState<string | null>(null)
    const [agentInitialized, setAgentInitialized] = React.useState(false)
    const [agentInitializing, setAgentInitializing] = React.useState(true)
    const [settingsOpen, setSettingsOpen] = React.useState(false)

    const agent = React.useRef<ErpaChatAgent | null>(null)

    // Handle agent message updates
    const handleAgentMessageUpdate = React.useCallback((message: ChatMessage) => {
        console.log('Received message update:', message);

        setChatMessages(prev => {
            console.log('Current messages before update:', prev);

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

                console.log('Updated messages:', updated);
                return updated;
            } else {
                // Add new message
                if (message.id.startsWith('text-')) {
                    setCurrentStreamingMessageId(message.id);
                }

                const newMessages = [...prev, message];
                console.log('New messages:', newMessages);
                return newMessages;
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

        const getAllTabs = async () => {
            try {
                const tabs = await chrome.tabs.query({ currentWindow: true });
                const tabList = tabs
                    .filter(tab => tab.id && tab.title && tab.url)
                    .map(tab => ({
                        id: tab.id!,
                        title: tab.title || 'Untitled',
                        url: tab.url || ''
                    }));
                setAvailableTabs(tabList);
            } catch (error) {
                log('Failed to get all tabs', error);
            }
        };


        const initializeErpaAgent = async () => {
            try {
                log('Initializing Erpa agent...')
                setAgentInitializing(true)
                setAgentInitialized(false)

                agent.current = new ErpaChatAgent({
                    functions: [navigateFunction, readOutFunction, getContentFunction, semanticSearchFunction, summarizePageFunction],
                    systemPrompt: systemPrompt,
                    maxIterations: 10,
                    onMessageUpdate: handleAgentMessageUpdate,
                    onProgressUpdate: handleAgentProgressUpdate,
                })
                await agent.current.initialize()

                setAgentInitialized(true)
                setAgentInitializing(false)
                log('Erpa agent initialized successfully')
            } catch (error) {
                err('Failed to initialize Erpa agent:', error)
                // Clear the agent reference if initialization failed
                agent.current = null
                setAgentInitialized(false)
                setAgentInitializing(false)
            }
        }

        initializeErpaAgent()
        getCurrentTab()
        getAllTabs()
    }, [])

    React.useEffect(() => {
        const handleMessage = async (message: any) => {
            if (message.type === "close-sidepanel") {
                log(`Received close message: ${message.type}`);
                setIsSidepanelEnabled(false);
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
            if (message.type === "speech-recognition-state-update") {
                log('[speech-recognition-state-update] Received state update', { message })
                log('[speech-recognition-state-update] Updating isListening from', isListening, 'to', message.isListening)
                setIsListening(message.isListening)
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);

        return () => {
            chrome.runtime.onMessage.removeListener(handleMessage);
        };
    }, [agent.current, isListening]);

    // Listen for tab updates to refresh the tab list
    React.useEffect(() => {
        const handleTabUpdate = () => {
            chrome.tabs.query({ currentWindow: true }).then(tabs => {
                const tabList = tabs
                    .filter(tab => tab.id && tab.title && tab.url)
                    .map(tab => ({
                        id: tab.id!,
                        title: tab.title || 'Untitled',
                        url: tab.url || ''
                    }));
                setAvailableTabs(tabList);
            }).catch(error => {
                log('Failed to refresh tabs', error);
            });
        };

        const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
            setCurrentTabId(activeInfo.tabId);
            handleTabUpdate();
        };

        chrome.tabs.onUpdated.addListener(handleTabUpdate);
        chrome.tabs.onActivated.addListener(handleTabActivated);
        chrome.tabs.onRemoved.addListener(handleTabUpdate);

        return () => {
            chrome.tabs.onUpdated.removeListener(handleTabUpdate);
            chrome.tabs.onActivated.removeListener(handleTabActivated);
            chrome.tabs.onRemoved.removeListener(handleTabUpdate);
        };
    }, []);

    // TTS control keyboard shortcuts
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // TTS control shortcuts: ctrl+cmd+option+spacebar for pause/resume, ctrl+cmd+option+enter for stop
            if (e.ctrlKey && e.metaKey && e.altKey) {
                if (e.key === 'Space' || e.key === ' ') {
                    e.preventDefault();
                    log('[TTS] Ctrl + Command + Option + Spacebar pressed - toggling pause/resume');
                    if (ttsCoordinator.isCurrentlyPlaying()) {
                        ttsCoordinator.togglePause();
                    }
                    return;
                }
                
                if (e.key === 'Enter') {
                    e.preventDefault();
                    log('[TTS] Ctrl + Command + Option + Enter pressed - stopping TTS');
                    ttsCoordinator.cancelCurrent();
                    return;
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

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
        if (!textInput.trim()) {
            log('No text input provided')
            return
        }

        if (!agentInitialized || !agent.current) {
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

    const handleTabChange = async (tabId: string) => {
        try {
            const targetTabId = parseInt(tabId);
            await chrome.tabs.update(targetTabId, { active: true });
            setCurrentTabId(targetTabId);

            // Update current URL
            const tab = await chrome.tabs.get(targetTabId);
            if (tab.url) {
                setCurrentUrl(tab.url);
            }

            log(`Switched to tab ${targetTabId}`);
        } catch (error) {
            err('Failed to switch tab:', error);
        }
    }

    const abbreviateText = (text: string, maxLength: number = 8) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    const getCurrentTabDisplayText = () => {
        const currentTab = availableTabs.find(tab => tab.id === currentTabId);
        if (!currentTab) return "Select tab";
        return abbreviateText(currentTab.title, 6);
    }

    if (!isSidepanelEnabled) {
        return (
            <div className="dark h-screen flex flex-col bg-gray-900 text-white">
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
                    <div className="flex items-center gap-3">
                        <img 
                            src={icon} 
                            alt="Erpa Logo" 
                            className="w-8 h-8 rounded-lg"
                        />
                        <h1 className="text-xl font-semibold">Erpa</h1>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSettingsOpen(true)}
                        className="hover:bg-gray-800"
                        aria-label="Settings"
                    >
                        <SettingsIcon className="w-5 h-5" />
                    </Button>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                    {agentInitializing ? "Agent is initializing..." :
                        !agentInitialized ? "Agent failed to initialize. Please reload the extension." :
                            isProcessingText ? "Processing your message..." :
                                "Type your message below to start a conversation, or use speech recognition from the content script."}
                </p>
                <div className="flex items-center mt-2">
                    <span
                        className={`inline-block w-3 h-3 rounded-full mr-2 ${agentInitializing
                            ? 'bg-yellow-400 animate-pulse'
                            : agentInitialized
                                ? 'bg-green-500'
                                : 'bg-red-500'
                            }`}
                        aria-label={
                            agentInitializing
                                ? "Agent is initializing"
                                : agentInitialized
                                    ? "Agent is online"
                                    : "Agent failed"
                        }
                    />
                    <span className="text-xs text-gray-400">
                        {agentInitializing
                            ? "Initializing..."
                            : agentInitialized
                                ? "Agent online"
                                : "Agent failed"}
                    </span>
                </div>
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
                <div className="action-panel-indicators flex flex-col items-center justify-center gap-1 px-2">
                    <div className="tab-selector">
                        <Select value={currentTabId?.toString()} onValueChange={handleTabChange}>
                            <SelectTrigger className="w-32 h-8 text-xs border-gray-600 text-white px-2">
                                <SelectValue placeholder="Select tab">
                                    {getCurrentTabDisplayText()}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-600">
                                {availableTabs.map((tab) => (
                                    <SelectItem
                                        key={tab.id}
                                        value={tab.id.toString()}
                                        className="text-white hover:bg-gray-700 focus:bg-gray-700"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium truncate max-w-32">
                                                {tab.title}
                                            </span>
                                            <span className="text-xs text-gray-400 truncate max-w-32">
                                                {(() => {
                                                    try {
                                                        return new URL(tab.url).hostname;
                                                    } catch {
                                                        return tab.url;
                                                    }
                                                })()}
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="toc flex items-center gap-1">
                        <TocPopup onTocGenerated={handleTocGenerated} />
                        {
                            mode === "text" ? (
                                <Button variant="ghost" size="sm" onClick={() => setMode("voice")}>
                                    <MicIcon className="w-4 h-4" />
                                </Button>
                            ) : (
                                <Button variant="ghost" size="sm" onClick={() => setMode("text")}>
                                    <PencilIcon className="w-4 h-4" />
                                </Button>
                            )
                        }
                    </div>
                </div>
                <div className="flex items-center justify-center bg-transparent py-2 flex-1 pl-2">
                    {mode === "voice" && (
                        <div className="px-1" onClick={(e) => e.stopPropagation()}>
                            <div
                                onClick={async () => {
                                    log('[toggle-mic] Clicked')
                                    log('[toggle-mic] Sending toggle command to content script')

                                    // Send message to the active tab's content script
                                    if (currentTabId) {
                                        try {
                                            log('[toggle-mic] Sending message to tab', currentTabId, 'with payload:', {
                                                type: 'toggle-mic',
                                                target: 'content',
                                                isListening: !isListening
                                            })
                                            await chrome.tabs.sendMessage(currentTabId, {
                                                type: 'toggle-mic',
                                                target: 'content',
                                                isListening: !isListening
                                            })
                                            log('[toggle-mic] Message sent to content script successfully')
                                        } catch (error) {
                                            err('[toggle-mic] Failed to send message to content script:', error)
                                            // Try to get tab info for debugging
                                            try {
                                                const tab = await chrome.tabs.get(currentTabId)
                                                log('[toggle-mic] Tab info:', { id: tab.id, url: tab.url, status: tab.status })
                                            } catch (tabError) {
                                                err('[toggle-mic] Could not get tab info:', tabError)
                                            }
                                        }
                                    } else {
                                        warn('[toggle-mic] No current tab ID available')
                                    }
                                }}
                                className="cursor-pointer w-20 h-20 flex items-center justify-center"
                            >
                                <VoicePoweredOrb
                                    enableVoiceControl={false}
                                    isRecording={isListening}
                                    responsive={true}
                                    className="rounded-xl overflow-hidden shadow-2xl hover:scale-120 transition-all duration-300 w-full h-full"
                                />
                            </div>
                        </div>
                    )}
                    {mode === "text" && (
                        <div className="w-full px-1 flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
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
            
            {/* Settings Dialog */}
            <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
    )
}

export default function SidepanelWithProvider() {
    return (
        <UserConfigProvider>
            <Sidepanel />
        </UserConfigProvider>
    )
}