console.log('offscreen.ts loaded')
let recorder;
let data = [];
let activeStreams = [];

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target === "offscreen") {
        switch (message.type) {
            case "start-recording":
                startRecording(message.data);
                break;
            case "stop-recording":
                stopRecording();
                break;
            default:
                throw new Error("Unrecognized message:", message.type);
        }
    }
});

async function startRecording(streamId) {
    console.log('[Offscreen] start recording with streamId:', streamId)
    if (recorder?.state === "recording") {
        throw new Error("Called startRecording while recording is in progress.");
    }

    await stopAllStreams();
    console.log('Starting to get tab stream')

    try {
        // Get tab audio stream using the modern API
        const tabStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: "tab",
                    chromeMediaSourceId: streamId,
                },
            },
            video: false,
        });

        console.log('[Offscreen] tabStream obtained', { 
            tabStream, 
            audioTracks: tabStream.getAudioTracks().length,
            videoTracks: tabStream.getVideoTracks().length
        })

        // Get microphone stream with noise cancellation
        const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
            video: false,
        });

        console.log('[Offscreen] micStream obtained', { 
            micStream, 
            audioTracks: micStream.getAudioTracks().length 
        })

        activeStreams.push(tabStream, micStream);

        // Create audio context
        const audioContext = new AudioContext();

        // Create sources and destination
        const tabSource = audioContext.createMediaStreamSource(tabStream);
        const micSource = audioContext.createMediaStreamSource(micStream);
        const destination = audioContext.createMediaStreamDestination();

        // Create gain nodes
        const tabGain = audioContext.createGain();
        const micGain = audioContext.createGain();

        // Set gain values
        tabGain.gain.value = 1.0; // Normal tab volume
        micGain.gain.value = 1.5; // Slightly boosted mic volume

        // Connect tab audio to both speakers and recorder
        tabSource.connect(tabGain);
        tabGain.connect(audioContext.destination);
        tabGain.connect(destination);

        // Connect mic to recorder only (prevents echo)
        micSource.connect(micGain);
        micGain.connect(destination);

        // Start recording with fallback mime types
        let mimeType = "audio/webm;codecs=opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "audio/webm";
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "audio/mp4";
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "audio/wav";
        }
        
        console.log('[Offscreen] Using mime type:', mimeType);
        
        recorder = new MediaRecorder(destination.stream, {
            mimeType: mimeType,
        });
        recorder.ondataavailable = (event) => data.push(event.data);
        recorder.onstop = async () => {
            const blob = new Blob(data, { type: mimeType });
            
            // Convert blob to base64 to send via message
            const arrayBuffer = await blob.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            // Send the audio file to the sidepanel
            chrome.runtime.sendMessage({
                type: "recording-stopped",
                target: "sidepanel",
                audioData: base64,
                fileName: `recording-${new Date().toISOString()}.${mimeType.split('/')[1]}`,
                mimeType: mimeType
            });

            // Also notify service worker
            chrome.runtime.sendMessage({
                type: "recording-stopped",
                target: "service-worker",
            });

            // Cleanup
            recorder = undefined;
            data = [];
        };

        recorder.start();
        window.location.hash = "recording";

        chrome.runtime.sendMessage({
            type: "update-icon",
            target: "service-worker",
            recording: true,
        });
    } catch (error) {
        console.error("Error starting recording:", error);
        
        // Send detailed error information
        chrome.runtime.sendMessage({
            type: "recording-error",
            target: "popup",
            error: error.message,
            details: {
                name: error.name,
                stack: error.stack
            }
        });
        
        // Clean up any partial streams
        await stopAllStreams();
    }
}

async function stopRecording() {
    console.log('[Offscreen] stopRecording')
    if (recorder && recorder.state === "recording") {
        recorder.stop();
    }

    await stopAllStreams();
    window.location.hash = "";

    chrome.runtime.sendMessage({
        type: "update-icon",
        target: "service-worker",
        recording: false,
    });
}

async function stopAllStreams() {
    activeStreams.forEach((stream) => {
        stream.getTracks().forEach((track) => {
            track.stop();
        });
    });

    activeStreams = [];
    await new Promise((resolve) => setTimeout(resolve, 100));
}
