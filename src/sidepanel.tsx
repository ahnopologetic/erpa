import { Brain, Trash2 } from "lucide-react"
import React from "react"
import { TocPopup } from "~components/toc-popup"
import { VoicePoweredOrb } from "~components/ui/voice-powered-orb"
import { ChatInterface } from "~components/ui/chat-interface"
import { usePromptAPI } from "~hooks/usePromptAPI"
import { useVoiceMemoChat } from "~hooks/useVoiceMemoChat"
import { err, log } from "~lib/log"
import "~style.css"

function Sidepanel() {
    const [isListening, setIsListening] = React.useState(false)
    const [contextChanged, setContextChanged] = React.useState(false)
    const [isTranscribing, setIsTranscribing] = React.useState(false)
    const [isSidepanelEnabled, setIsSidepanelEnabled] = React.useState(true)
    // Remove mode toggle - only chat mode
    const [currentTabId, setCurrentTabId] = React.useState<number | null>(null)
    const [currentUrl, setCurrentUrl] = React.useState<string>('')

    const streamRef = React.useRef<MediaStream | null>(null)
    const offscreenDocumentRef = React.useRef<chrome.runtime.ExtensionContext | null>(null)
    const [promptSession, setPromptSession] = React.useState<LanguageModelSession | null>(null)
    const [summarizationPromptSession, setSummarizationPromptSession] = React.useState<LanguageModelSession | null>(null)

    const { initializePromptSession } = usePromptAPI()

    // Voice memo chat functionality
    const {
        messages: chatMessages,
        addUserMessage,
        addAIMessage,
        deleteMessage,
        isLoading: chatLoading,
        error: chatError
    } = useVoiceMemoChat({
        tabId: currentTabId || undefined,
        url: currentUrl || undefined,
        autoLoad: true
    })
    // Listen for messages from background script to close sidepanel
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

        getCurrentTab()

        checkMicrophonePermission()
        checkOffscreenDocument()
        const createPromptSession = async () => {
            const session = await initializePromptSession(undefined, {
                expectedInputs: [{ type: 'audio', languages: ['en'] }],
                expectedOutputs: [{ type: 'text', languages: ['en'] }]
            })
            const clonedSession = await session.clone()
            setSummarizationPromptSession(clonedSession)
            setPromptSession(session)
            log('Prompt session is created and set to state', { session })
        }
        createPromptSession()
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

                // Console.log the audio file details
                console.log("🎵 RECORDED AUDIO FILE:", {
                    blob: audioBlob,
                    fileName: message.fileName,
                    mimeType: message.mimeType,
                    size: audioBlob.size,
                    sizeInMB: (audioBlob.size / (1024 * 1024)).toFixed(2),
                    url: URL.createObjectURL(audioBlob) // For testing - you can open this URL in a new tab
                });

                if (promptSession) {
                    log('Calling audio input to prompt session')
                    setIsTranscribing(true)

                    try {
                        // Use standard transcription for chat mode
                        const transcriptionResult = await promptSession.prompt([
                            {
                                role: 'assistant',
                                content: [
                                    {
                                        type: 'text',
                                        value: 'Please transcribe this audio accurately. Provide a clear, complete transcription of all spoken content.'
                                    },
                                ]
                            },
                            {
                                role: 'user',
                                content: [
                                    {
                                        type: 'audio',
                                        value: audioBlob
                                    }
                                ]
                            }
                        ])
                        log('Transcription result', { transcriptionResult })

                        // Add as user message and generate AI response
                        if (transcriptionResult) {
                            await addUserMessage(audioBlob, transcriptionResult)

                            // Generate AI response
                            try {
                                const aiResponse = await promptSession.prompt([
                                    {
                                        role: 'assistant',
                                        content: [
                                            {
                                                type: 'text',
                                                value: 'Please generate a response to the following user message.'
                                            },
                                        ]
                                    },
                                    {
                                        role: 'user',
                                        content: [
                                            {
                                                type: 'text', value: transcriptionResult
                                            }
                                        ]
                                    }
                                ])

                                if (aiResponse) {
                                    await addAIMessage({ textResponse: aiResponse })
                                }
                            } catch (aiError) {
                                log('AI response error', aiError)
                                await addAIMessage({
                                    textResponse: "I'm sorry, I couldn't process your request right now. Please try again."
                                })
                            }
                        }
                    } catch (error) {
                        log('Transcription error', error)
                        // Add error message to chat
                        await addAIMessage({
                            textResponse: "I'm sorry, I couldn't transcribe your audio. Please try again."
                        })
                    } finally {
                        setIsTranscribing(false)
                    }
                }

                // Stop listening state
                setIsListening(false);
                stopStream();
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);

        return () => {
            chrome.runtime.onMessage.removeListener(handleMessage);
        };
    }, [promptSession]);

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

    React.useEffect(() => {
        if (promptSession) {
            log('promptSession', { promptSession })
        }
    }, [promptSession])

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
                    {isListening ? "Recording your message..." : "Click the voice orb below to start a conversation."}
                </p>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative z-10">
                <ChatInterface
                    messages={chatMessages}
                    onDeleteMessage={deleteMessage}
                    isLoading={chatLoading || isTranscribing}
                    className="h-full"
                />
            </div>

            <div className="action-panel flex z-10 bg-black">
                <div className="toc h-full flex items-center justify-center px-2">
                    <TocPopup promptSession={summarizationPromptSession} />
                </div>
                <div className="flex items-center justify-center bg-transparent py-4" onClick={handleToggleMic}>
                    <VoicePoweredOrb
                        enableVoiceControl={isListening}
                        isRecording={isListening}
                        className="rounded-xl overflow-hidden shadow-2xl hover:scale-120 transition-all duration-300 cursor-pointer max-h-24"
                    />
                </div>
            </div>
        </div>
    )
}

export default Sidepanel