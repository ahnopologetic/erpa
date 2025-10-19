import { MicIcon, PencilIcon, SendIcon } from "lucide-react"
import React from "react"
import { TocPopup } from "~components/toc-popup"
import { Button } from "~components/ui/button"
import { ChatInterface } from "~components/ui/chat-interface"
import { Textarea } from "~components/ui/textarea"
import { VoicePoweredOrb } from "~components/ui/voice-powered-orb"
import { err, log, warn } from "~lib/log"
import { ErpaChatAgent, useErpaChatAgent } from "~hooks/useErpaChatAgent"
import { getContentFunction, navigateFunction, readOutFunction } from "~lib/functions/definitions"
// Remove summarizer imports - using existing Prompt API instead
import "~style.css"
import type { ChatMessage } from "~types/voice-memo"
import erpaAgentSystemPrompt from "~prompt"

function Sidepanel() {
    const [isListening, setIsListening] = React.useState(false)
    const [contextChanged, setContextChanged] = React.useState(false)
    const [isTranscribing, setIsTranscribing] = React.useState(false)
    const [isSidepanelEnabled, setIsSidepanelEnabled] = React.useState(true)
    // Remove mode toggle - only chat mode
    const [currentTabId, setCurrentTabId] = React.useState<number | null>(null)
    const [currentUrl, setCurrentUrl] = React.useState<string>('')
    const [mode, setMode] = React.useState<"voice" | "text">("voice")
    const [textInput, setTextInput] = React.useState("")
    const [isProcessingText, setIsProcessingText] = React.useState(false)
    const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([])
    const [chatLoading, setChatLoading] = React.useState(false)
    const [currentStreamingMessageId, setCurrentStreamingMessageId] = React.useState<string | null>(null)

    const streamRef = React.useRef<MediaStream | null>(null)
    const offscreenDocumentRef = React.useRef<chrome.runtime.ExtensionContext | null>(null)
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

        const checkMicrophonePermission = async () => {
            const permission = await navigator.permissions.query({ name: "microphone" })
            log('Microphone permission', { permission })
            if (!permission) {
                chrome.tabs.create({ url: "tabs/permission.html" })
            }
        }
        const checkOffscreenDocument = async () => {
            const contexts = await chrome.runtime.getContexts({});
            const offscreenDocument = contexts.find(
                (c) => c.contextType === "OFFSCREEN_DOCUMENT"
            );
            log('Offscreen document', { offscreenDocument })
            offscreenDocumentRef.current = offscreenDocument
        }

        const initializeErpaAgent = async () => {
            agent.current = new ErpaChatAgent({
                functions: [navigateFunction, readOutFunction, getContentFunction],
                systemPrompt: erpaAgentSystemPrompt,
                maxIterations: 2,
                onMessageUpdate: handleAgentMessageUpdate,
                onProgressUpdate: handleAgentProgressUpdate,
            })
        }

        initializeErpaAgent()
        getCurrentTab()

        checkMicrophonePermission()
        checkOffscreenDocument()
        return () => {
            stopStream()
        }
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
            if (message.type === "recording-error") {
                log(`Recording error: ${message.error}`, message.details);
                setIsListening(false);
                stopStream();
                alert(`Recording error: ${message.error}`);
            }
            if (message.type === "recording-stopped" && message.target === "sidepanel") {
                log(`Received recording data:`, {
                    fileName: message.fileName,
                    mimeType: message.mimeType,
                    audioDataLength: message.audioData?.length
                });

                // Convert base64 back to blob
                const binaryString = atob(message.audioData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const audioBlob = new Blob([bytes], { type: message.mimeType });

                log("🎵 RECORDED AUDIO FILE:", {
                    blob: audioBlob,
                    fileName: message.fileName,
                    mimeType: message.mimeType,
                    size: audioBlob.size,
                    sizeInMB: (audioBlob.size / (1024 * 1024)).toFixed(2),
                    url: URL.createObjectURL(audioBlob) // For testing - you can open this URL in a new tab
                });

                // Stop listening state
                setIsListening(false);
                stopStream();
            }

            if (message.type === 'TRIGGER_PAGE_SUMMARY') {
                log('Received TRIGGER_PAGE_SUMMARY message');
                handlePageSummary();
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);

        return () => {
            chrome.runtime.onMessage.removeListener(handleMessage);
        };
    }, []);

    const stopStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop())
            streamRef.current = null
        }
    }


    const handleToggleMic = async () => {
        if (isListening) {
            stopStream()
            setIsListening(false)
            if (offscreenDocumentRef.current) {
                const response = await chrome.runtime.sendMessage({
                    type: "stop-recording",
                    target: "offscreen"
                })
                log('Stop recording response', { response })
            }
            return
        }

        try {
            // Get microphone permission first
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = micStream
            setIsListening(true)

            // Check if we can capture the current tab
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });

            if (!tab) {
                throw new Error("No active tab found");
            }

            if (
                tab.url?.startsWith("chrome://") ||
                tab.url?.startsWith("chrome-extension://") ||
                tab.url?.startsWith("chrome-extension://") ||
                tab.url?.startsWith("edge://") ||
                tab.url?.startsWith("moz-extension://")
            ) {
                throw new Error("Cannot record Chrome system pages. Please try on a regular webpage.");
            }

            log('Attempting to get tab stream ID for tab:', { tabId: tab.id, url: tab.url });

            // Get tab capture stream ID via background script with proper invocation
            const response = await chrome.runtime.sendMessage({
                type: "get-tab-stream-id",
                tabId: tab.id
            });

            if (!response.success) {
                throw new Error(response.error || "Failed to get tab stream ID");
            }

            const streamId = response.streamId;
            log('Tab stream ID received via background script', { streamId });

            // Send recording start message to offscreen document
            if (offscreenDocumentRef.current) {
                const recordingResponse = await chrome.runtime.sendMessage({
                    type: "start-recording",
                    data: streamId,
                    target: "offscreen"
                })
                log('Start recording response', { recordingResponse })
            }
        } catch (error) {
            err("Recording setup failed", error)
            setIsListening(false)
            stopStream()

            // Show user-friendly error message
            if (error.message.includes("Cannot record Chrome system pages")) {
                alert(error.message);
            } else if (error.message.includes("Permission denied") || error.message.includes("NotAllowedError")) {
                alert("Microphone permission denied. Please allow microphone access and try again.");
            } else {
                alert("Failed to start recording. Please try again.");
            }
        }
    }

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

    const handlePageSummary = React.useCallback(async () => {
        try {
            setChatLoading(true);
            log('Starting page summary generation using Prompt API');

            // Get page content with detected sections from active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab.id) {
                throw new Error('No active tab found');
            }

            const response = await chrome.tabs.sendMessage(tab.id, {
                type: 'GET_PAGE_CONTENT'
            });

            if (!response.ok) {
                throw new Error(response.error);
            }

            log('Page content collected:', {
                sectionsCount: response.sections.length,
                pageTitle: response.pageTitle,
                mainContentLength: response.mainContent.length
            });

            // Initialize agent if not already done
            if (!agent.current) {
                throw new Error('Agent not initialized');
            }

            await agent.current.initialize();

            // Add page context to agent with detailed section information
            const sectionsInfo = response.sections.map(s =>
                `Section: ${s.title}\nContent: ${s.content}`
            ).join('\n\n');

            await agent.current.addToContext([{
                role: 'system',
                content: `You are summarizing a webpage titled "${response.pageTitle}" for a visually impaired user. 

Page content sample: ${response.mainContent}

Available sections with their content:
${sectionsInfo}

Please provide a concise summary in a natural, spoken format (under 200 words) that includes:
1. A brief overview of what this page is about
2. Key points from different sections with quotes
3. A recommendation for where to start reading

Format your response as natural speech, like you're talking to someone:

"This page is about [topic]. Here's what you'll find:

First, in the [Section Name] section, it says [quote]. This is important because...

Next, the [Section Name] section covers [quote]. This means...

Finally, the [Section Name] section explains [quote]. This is useful because...

I recommend starting with the [Section Name] section to get the best overview of this topic."

IMPORTANT: Keep your response under 200 words. Use natural transitions like "First", "Next", "Also", "Finally" and speak as if you're having a conversation. Be concise but informative.`
            }]);

            // Set up streaming capture BEFORE running the agent
            const originalOnMessageUpdate = agent.current.onMessageUpdate;
            let summaryText = '';
            let messageCount = 0;
            let ttsTriggered = false;
            
            // Override the message update handler to capture streaming text
            agent.current.onMessageUpdate = (message: ChatMessage) => {
                messageCount++;
                log(`[DEBUG] Message update #${messageCount}:`, {
                    id: message.id,
                    type: message.voiceMemo?.type,
                    hasTranscription: !!message.voiceMemo?.transcription,
                    transcriptionLength: message.voiceMemo?.transcription?.length || 0
                });
                
                // Call the original handler first
                originalOnMessageUpdate?.(message);
                
                // Capture streaming text for summary
                if (message.voiceMemo?.type === 'ai' && message.voiceMemo.transcription) {
                    summaryText = message.voiceMemo.transcription;
                    log('[DEBUG] Captured streaming text:', {
                        length: summaryText.length,
                        preview: summaryText.substring(0, 100) + '...',
                        fullText: summaryText
                    });
                    
                    // Trigger TTS immediately when we have substantial text (not just the first few characters)
                    if (summaryText.length > 100 && !ttsTriggered) {
                        ttsTriggered = true;
                        log('[DEBUG] Triggering TTS immediately with streaming text');
                        
                        // Trigger TTS asynchronously without blocking
                        setTimeout(async () => {
                            try {
                                // Create a temporary element in the page for TTS to capture
                                await chrome.tabs.sendMessage(tab.id, {
                                    type: 'CREATE_TTS_ELEMENT',
                                    text: summaryText,
                                    id: 'page-summary-text'
                                });

                                // Use the content script TTS system to read the summary
                                await chrome.tabs.sendMessage(tab.id, {
                                    type: 'READ_OUT_TEXT',
                                    text: summaryText
                                });
                                
                                log('[DEBUG] TTS triggered successfully with streaming text');
                            } catch (error) {
                                log('[DEBUG] Failed to trigger TTS with streaming text:', error);
                            }
                        }, 500); // Small delay to ensure message is processed
                    }
                }
            };

            // Use the agent to generate summary
            const summaryTask = `Please summarize this webpage in a conversational, spoken format. Include key quotes from the sections and tell me where to start reading.`;

            log('Running agent with summary task:', summaryTask);
            await agent.current.run(summaryTask);

            log('Summary generation completed via Prompt API');
            
            // Set up a fallback timeout in case streaming capture fails
            setTimeout(async () => {
                try {
                    log('[DEBUG] Fallback TTS trigger timeout reached');
                    
                    if (!ttsTriggered && summaryText) {
                        log('[DEBUG] Using fallback streaming text for TTS');

                        // Create a temporary element in the page for TTS to capture
                        await chrome.tabs.sendMessage(tab.id, {
                            type: 'CREATE_TTS_ELEMENT',
                            text: summaryText,
                            id: 'page-summary-text'
                        });

                        // Use the content script TTS system to read the summary
                        await chrome.tabs.sendMessage(tab.id, {
                            type: 'READ_OUT_TEXT',
                            text: summaryText
                        });
                    } else if (!ttsTriggered) {
                        log('[DEBUG] No streaming text captured, trying fallback from chat messages');
                        // Fallback: try to get from chat messages
                        const latestMessage = chatMessages[chatMessages.length - 1];
                        log('[DEBUG] Latest message from chat:', {
                            exists: !!latestMessage,
                            type: latestMessage?.voiceMemo?.type,
                            hasTranscription: !!latestMessage?.voiceMemo?.transcription,
                            transcriptionLength: latestMessage?.voiceMemo?.transcription?.length || 0
                        });
                        
                        if (latestMessage && latestMessage.voiceMemo?.type === 'ai') {
                            const fallbackText = latestMessage.voiceMemo.transcription;
                            if (fallbackText) {
                                log('[DEBUG] Using fallback text for TTS:', fallbackText.substring(0, 100) + '...');
                                await chrome.tabs.sendMessage(tab.id, {
                                    type: 'CREATE_TTS_ELEMENT',
                                    text: fallbackText,
                                    id: 'page-summary-text'
                                });
                                await chrome.tabs.sendMessage(tab.id, {
                                    type: 'READ_OUT_TEXT',
                                    text: fallbackText
                                });
                            } else {
                                log('[DEBUG] Fallback message has no transcription');
                            }
                        } else {
                            log('[DEBUG] No valid fallback message found');
                        }
                    }
                    
                    // Restore original handler
                    agent.current!.onMessageUpdate = originalOnMessageUpdate;
                } catch (error) {
                    log('[DEBUG] Failed to trigger fallback TTS for summary:', error);
                }
            }, 2000); // Wait 2 seconds for the agent to complete

        } catch (error) {
            err('Summary generation failed:', error);
            // Show error message to user
            const errorMessage: ChatMessage = {
                id: `error-${Date.now()}`,
                voiceMemo: {
                    id: `error-${Date.now()}`,
                    type: 'ai',
                    audioBlob: new Blob(),
                    transcription: `Failed to generate summary: ${error.message}`,
                    timestamp: Date.now()
                },
                createdAt: Date.now()
            };
            setChatMessages(prev => [...prev, errorMessage]);
        } finally {
            setChatLoading(false);
        }
    }, [agent, chatMessages]);

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
                    {isListening && (
                        <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                            <span className="text-sm text-red-400">Recording...</span>
                        </div>
                    )}
                </div>
                <p className="mt-2 text-sm text-gray-400">
                    {isListening ? "Recording your message..." :
                        (isProcessingText) ? "Processing your message..." :
                            mode === "voice" ? "Click the voice orb below to start a conversation." :
                                "Type your message below to start a conversation."}
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
                    <Button variant="ghost" size="sm" onClick={() => setMode(mode === "voice" ? "text" : "voice")}>
                        {
                            mode === "voice" ? (
                                <PencilIcon className="w-4 h-4" />
                            ) : (
                                <MicIcon className="w-4 h-4" />
                            )
                        }
                    </Button>
                </div>
                <div className="flex items-center justify-center bg-transparent py-4">
                    {
                        mode === "voice" ? (
                            <div onClick={handleToggleMic} className="cursor-pointer">
                                <VoicePoweredOrb
                                    enableVoiceControl={isListening}
                                    isRecording={isListening}
                                    className="rounded-xl overflow-hidden shadow-2xl hover:scale-120 transition-all duration-300 max-h-24"
                                />
                            </div>
                        ) : (
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
                        )
                    }
                </div>
            </div>
        </div>
    )
}

export default Sidepanel