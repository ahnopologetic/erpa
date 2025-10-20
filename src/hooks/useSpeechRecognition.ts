import { log, err, debug } from "~lib/log"
const useSpeechRecognition = () => {

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        err('[Speech Recognition] Speech recognition not supported in this browser')
        throw new Error('Speech recognition not supported in this browser')
    }


    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    // Configure speech recognition
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    // Set up event handlers
    recognition.onstart = () => {
        log('[Speech Recognition] Speech recognition started')
    };

    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        if (finalTranscript) {
            log('[Speech Recognition] Final transcript:', finalTranscript)
            // You can add logic here to handle the recognized speech
            // For example, send it to the sidepanel or process it
            chrome.runtime.sendMessage({
                type: "speech-recognition-result",
                transcript: finalTranscript,
                target: "sidepanel"
            })
        }

        if (interimTranscript) {
            debug('[Speech Recognition] Interim transcript:', interimTranscript)
        }
    };

    recognition.onerror = (event) => {
        console.error('[Speech Recognition] Error:', event.error)
    };

    recognition.onend = () => {
        log('[Speech Recognition] Speech recognition ended')
    };

    return {
        start: () => {
            recognition.start();
        },
        stop: () => {
            recognition.stop();
        },
        recognition: recognition,
    }
}

export default useSpeechRecognition