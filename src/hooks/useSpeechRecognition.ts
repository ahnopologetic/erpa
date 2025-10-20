import { log, err, debug } from "~lib/log"
import { useCallback, useRef, useState } from "react"

interface UseSpeechRecognitionOptions {
    onResult?: (transcript: string) => void
    onInterimResult?: (transcript: string) => void
    onError?: (error: string) => void
    onStart?: () => void
    onEnd?: () => void
    continuous?: boolean
    interimResults?: boolean
    lang?: string
    singleTurn?: boolean
}

const useSpeechRecognition = (options: UseSpeechRecognitionOptions = {}) => {
    const {
        onResult,
        onInterimResult,
        onError,
        onStart,
        onEnd,
        continuous = true,
        interimResults = true,
        lang = 'en-US',
        singleTurn = false
    } = options

    const [isListening, setIsListening] = useState(false)
    const [isSupported, setIsSupported] = useState(false)
    const speechRecognitionRef = useRef<SpeechRecognition | null>(null)

    // Check if Speech Recognition is supported
    const checkSupport = useCallback(() => {
        const supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
        setIsSupported(supported)
        if (!supported) {
            err('[Speech Recognition] Speech recognition not supported in this browser')
        }
        return supported
    }, [])

    const startListening = useCallback(() => {
        if (!checkSupport()) {
            return false
        }

        if (isListening) {
            log('[Speech Recognition] Already listening')
            return true
        }

        try {
            // Create speech recognition instance
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
            const recognition = new SpeechRecognition()

            // Configure speech recognition
            recognition.continuous = continuous
            recognition.interimResults = interimResults
            recognition.lang = lang

            // Set up event handlers
            recognition.onstart = () => {
                log('[Speech Recognition] Speech recognition started')
                setIsListening(true)
                onStart?.()
            }

            recognition.onresult = (event) => {
                let finalTranscript = ''
                let interimTranscript = ''

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript
                    } else {
                        interimTranscript += transcript
                    }
                }

                if (finalTranscript) {
                    log('[Speech Recognition] Final transcript:', finalTranscript)
                    onResult?.(finalTranscript)

                    // Send to sidepanel if no custom handler provided
                    if (!onResult) {
                        chrome.runtime.sendMessage({
                            type: "speech-recognition-result",
                            transcript: finalTranscript,
                            target: "sidepanel"
                        })
                    }

                    if (singleTurn) {
                        recognition.stop()
                    }
                }

                if (interimTranscript) {
                    debug('[Speech Recognition] Interim transcript:', interimTranscript)
                    onInterimResult?.(interimTranscript)
                }
            }

            recognition.onerror = (event) => {
                console.error('[Speech Recognition] Error:', event.error)
                setIsListening(false)
                speechRecognitionRef.current = null
                onError?.(event.error)
            }

            recognition.onend = () => {
                log('[Speech Recognition] Speech recognition ended')
                setIsListening(false)
                speechRecognitionRef.current = null
                onEnd?.()
            }

            // Start speech recognition
            speechRecognitionRef.current = recognition
            recognition.start()
            log('[Speech Recognition] Speech recognition enabled')
            return true
        } catch (error) {
            console.error("Error setting up speech recognition:", error)
            onError?.(error instanceof Error ? error.message : 'Unknown error')
            return false
        }
    }, [isListening, continuous, interimResults, lang, onResult, onInterimResult, onError, onStart, onEnd, checkSupport])

    const stopListening = useCallback(() => {
        if (speechRecognitionRef.current) {
            speechRecognitionRef.current.stop()
            speechRecognitionRef.current = null
        }
        setIsListening(false)
        log('[Speech Recognition] Speech recognition disabled')
    }, [])

    const toggleListening = useCallback(() => {
        if (isListening) {
            stopListening()
            return false
        } else {
            return startListening()
        }
    }, [isListening, startListening, stopListening])

    return {
        isListening,
        isSupported: isSupported || checkSupport(),
        startListening,
        stopListening,
        toggleListening,
        recognition: speechRecognitionRef.current
    }
}

export default useSpeechRecognition