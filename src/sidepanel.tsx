import React from "react"
import { TocPopup } from "~components/toc-popup"
import { usePromptAPI } from "~hooks/usePromptAPI"
import { err, log } from "~lib/log"
import "~style.css"

function Sidepanel() {
    const [isListening, setIsListening] = React.useState(false)
    const [contextChanged, setContextChanged] = React.useState(false)
    const streamRef = React.useRef<MediaStream | null>(null)
    const offscreenDocumentRef = React.useRef<chrome.runtime.ExtensionContext | null>(null)
    const [promptSession, setPromptSession] = React.useState<LanguageModelSession | null>(null)
    const [summarizationPromptSession, setSummarizationPromptSession] = React.useState<LanguageModelSession | null>(null)

    const { initializePromptSession } = usePromptAPI()
    // Listen for messages from background script to close sidepanel
    React.useEffect(() => {
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

        checkMicrophonePermission()
        checkOffscreenDocument()
        const createPromptSession = async () => {
            const session = await initializePromptSession(undefined, {
                expectedInputs: [{ type: 'audio', languages: ['en'] }],
                expectedOutputs: [{ type: 'text', languages: ['en'] }]
            })
            const clonedSession = await session.clone()
            setSummarizationPromptSession(clonedSession)
            await session.append(
                [
                    {
                        role: 'system',
                        content: `You're a helpful chrome extension assistant that can answer questions and help them navigate the website.
                        Based on the user's query, you should decide which tool to use.

                        There are three tools available to you:
                        - navigate(anchor_or_css_selector: string): navigate to specific html selector
                        - summarize(outer_html: string): summarize the content of selected html portion
                        - ask(question: string): ask a question to the user

                        ### Important rules
                        - If you don't have enough information to answer the user's question, you should ask the user for more information.
                        - You can use the tools to answer the user's question.

                        ### Output format
                        Case 1. Plain text response
                        {
                            "type": "plain_text",
                            "text": "The response to the user's question"
                        }

                        Case 2. Tool response
                        You should always use the tools to answer the user's question.
                        {
                            "type": "tool",
                            "tool": "navigate",
                            "tool_args": {
                                "anchor_or_css_selector": "The anchor or css selector to navigate to"
                            }
                        }

                        Case 3. Tool response with additional information
                        [
                            {
                                "type": "tool",
                                "tool": "navigate",
                                "tool_args": {
                                    "anchor_or_css_selector": "The anchor or css selector to navigate to"
                                }
                            },
                            {
                                "type": "plain_text",
                                "text": "The additional information to the user's question"
                            }
                        ]
                        `
                    },
                ]
            )
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
                setContextChanged(true);
                log('Context changed - showing notification');
            }
            if (message.type === "close-sidepanel") {
                log(`Received close message: ${message.type}`);
                chrome.sidePanel.setOptions({ enabled: false });
                chrome.sidePanel.setOptions({ enabled: true });
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
                    const response = await promptSession.prompt([
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
                    log('Prompt session response', { response })
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
            {/* Foreground UI */}
            <div className="flex-1 overflow-auto p-4 relative z-10">
                <h1 className="text-xl font-semibold">Sidepanel</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    {isListening ? "Listening..." : "Click the logo below to start the mic."}
                </p>
            </div>

            <div className="action-panel flex z-10">
                <div className="toc h-full flex items-center justify-center px-2">
                    {/* popup component */}
                    <TocPopup promptSession={summarizationPromptSession} />
                </div>
                <button
                    onClick={handleToggleMic}
                    className={`w-full p-4 bg-black text-center text-sm font-medium select-none focus:outline-none ${isListening ? "bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-300" : ""}`}
                    style={{ cursor: "pointer" }}
                    aria-pressed={isListening}
                    aria-label={isListening ? "Turn microphone off" : "Turn microphone on"}
                >
                    <div className={`grid grid-cols-4 gap-2 items-center justify-center px-4 hover:scale-105 transition-all duration-300`}>
                        <div
                            className={`h-8 w-8 rounded-full border-4 border-transparent bg-gray-400 hover:bg-gray-500 hover:cursor-pointer hover:scale-105 transition-all duration-300 justify-self-end col-span-1
                                ${isListening
                                    ? "border-4 border-gradient-to-r from-red-500 to-orange-500 p-0.5"
                                    : "border-muted-foreground"
                                }
                            `}
                        />
                        <span className="col-span-3 justify-self-center">{isListening ? "Mic On" : "Tap to Turn Mic On"}</span>
                    </div>
                </button>
            </div>
        </div>
    )
}

export default Sidepanel