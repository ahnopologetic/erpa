import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Play, Pause, Download, Trash2, AlertCircle, Brain } from "lucide-react";
import { usePromptAPI } from "~hooks/usePromptAPI";
import "~style.css";

interface TranscriptionResult {
  text: string;
  confidence?: number;
  timestamp: number;
  isStreaming?: boolean;
}

interface StreamingTranscription {
  id: string;
  text: string;
  isComplete: boolean;
  timestamp: number;
}

function AudioTest() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [streamingTranscription, setStreamingTranscription] = useState<StreamingTranscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [useStreaming, setUseStreaming] = useState(true);

  // Use the existing PromptAPI hook
  const {
    isLoading: isPromptLoading,
    error: promptError,
    downloadProgress,
    notDownloaded,
    session,
    checkModelAvailability,
    initializePromptSession,
    setError: setPromptError
  } = usePromptAPI({ autoInitialize: false });

  // Audio-specific session state
  const [audioSession, setAudioSession] = useState<LanguageModelSession | null>(null);
  const [isInitializingAudioSession, setIsInitializingAudioSession] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check Prompt API availability on mount
  useEffect(() => {
    checkModelAvailability();
  }, [checkModelAvailability]);

  // Cleanup audio session on unmount
  useEffect(() => {
    return () => {
      if (audioSession) {
        audioSession.destroy();
      }
    };
  }, [audioSession]);

  // Initialize audio-specific session
  const initializeAudioSession = useCallback(async () => {
    if (!('LanguageModel' in window)) {
      setError('LanguageModel API is not available');
      return;
    }

    setIsInitializingAudioSession(true);
    setError(null);

    try {
      const availability = await LanguageModel.availability();
      if (availability === 'unavailable') {
        setError('LanguageModel API is not available. Please ensure you are using Chrome with AI features enabled.');
        return;
      }

      // Create session with audio input configuration
      const newAudioSession = await LanguageModel.create({
        expectedInputs: [{ type: 'audio' }]
      });

      setAudioSession(newAudioSession);
      console.log('Audio session initialized successfully');
    } catch (err) {
      console.error('Failed to initialize audio session:', err);
      setError('Failed to initialize audio session. Please try again.');
    } finally {
      setIsInitializingAudioSession(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);

        // Create audio URL for playback
        if (audioRef.current) {
          audioRef.current.src = URL.createObjectURL(audioBlob);
        }

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 0.1);
      }, 100);

    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Failed to start recording. Please check microphone permissions.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }
  }, [isRecording]);

  const playAudio = useCallback(() => {
    if (audioRef.current && audioBlob) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);

        audioRef.current.onended = () => {
          setIsPlaying(false);
        };
      }
    }
  }, [isPlaying, audioBlob]);

  const transcribeAudio = useCallback(async () => {
    if (!audioBlob) {
      setError('No audio to transcribe');
      return;
    }

    setError(null);
    setStreamingTranscription(null);
    setTranscription(null);

    try {
      // Check if Prompt API is available
      const availability = await checkModelAvailability();
      if (availability === 'unavailable') {
        setError('LanguageModel API is not available. Please ensure you are using Chrome with AI features enabled.');
        return;
      }

      // Use audio session if available, otherwise create one
      let currentSession = audioSession;
      if (!currentSession) {
        // Create a new session specifically configured for audio input
        currentSession = await LanguageModel.create({
          expectedInputs: [{ type: 'audio' }]
        });
        if (!currentSession) {
          setError('Failed to initialize LanguageModel session for audio');
          return;
        }
        // Store the session for future use
        setAudioSession(currentSession);
      }

      if (useStreaming) {
        // Use streaming transcription with multimodal prompt
        const streamingId = `stream-${Date.now()}`;
        setStreamingTranscription({
          id: streamingId,
          text: '',
          isComplete: false,
          timestamp: Date.now()
        });

        const stream = currentSession.promptStreaming([
          {
            role: 'user',
            content: [
              { type: 'text', value: 'Please transcribe this audio accurately. Provide a clear, complete transcription of all spoken content.' },
              { type: 'audio', value: audioBlob }
            ]
          }
        ]);

        let fullText = '';

        for await (const chunk of stream) {
          fullText += chunk;
          setStreamingTranscription(prev => prev ? {
            ...prev,
            text: fullText,
            isComplete: false
          } : null);
        }

        // Mark as complete
        setStreamingTranscription(prev => prev ? {
          ...prev,
          text: fullText,
          isComplete: true
        } : null);

        // Also set in regular transcription for consistency
        setTranscription({
          text: fullText,
          timestamp: Date.now(),
          isStreaming: true
        });

      } else {
        // Use regular prompt (non-streaming) with multimodal prompt
        const result = await currentSession.prompt([
          {
            role: 'user',
            content: [
              { type: 'text', value: 'Please transcribe this audio accurately. Provide a clear, complete transcription of all spoken content.' },
              { type: 'audio', value: audioBlob }
            ]
          }
        ]);

        setTranscription({
          text: result,
          timestamp: Date.now(),
          isStreaming: false
        });
      }

    } catch (err) {
      console.error('Transcription error:', err);
      setError('Failed to transcribe audio. Please try again.');
      setStreamingTranscription(null);
    }
  }, [
    audioBlob,
    audioSession,
    useStreaming,
    checkModelAvailability
  ]);

  const downloadAudio = useCallback(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${new Date().toISOString().slice(0, 19)}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [audioBlob]);

  const clearAll = useCallback(() => {
    setTranscription(null);
    setAudioBlob(null);
    setRecordingDuration(0);
    setError(null);

    if (audioRef.current) {
      audioRef.current.src = '';
    }

    // Revoke any existing audio URLs
    if (audioBlob) {
      URL.revokeObjectURL(URL.createObjectURL(audioBlob));
    }
  }, [audioBlob]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-50">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-2">Audio Transcription</h1>
        <p className="text-gray-600 text-center mb-8">
          Record audio and get it transcribed using Chrome's LanguageModel Prompt API
        </p>

        {/* LanguageModel Status */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-blue-800">LanguageModel Status</h3>
          </div>

          {isPromptLoading && (
            <div className="mb-2">
              <div className="flex justify-between text-sm text-blue-700 mb-1">
                <span>{notDownloaded ? 'Downloading model...' : 'Initializing...'}</span>
                <span>{Math.round(downloadProgress.value * 100)}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress.value * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {audioSession && (
            <p className="text-sm text-green-700">✅ Audio-optimized session ready for transcription</p>
          )}

          {!audioSession && !isInitializingAudioSession && (
            <p className="text-sm text-orange-700">⚠️ Audio session not initialized. Click "Initialize Audio Session" to start.</p>
          )}

          {isInitializingAudioSession && (
            <p className="text-sm text-blue-700">🔄 Initializing audio-optimized session...</p>
          )}

          <div className="flex space-x-2 mt-2">
            <button
              onClick={checkModelAvailability}
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
            >
              Check Availability
            </button>
            {!audioSession && (
              <button
                onClick={initializeAudioSession}
                disabled={isInitializingAudioSession}
                className="text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-3 py-1 rounded transition-colors"
              >
                {isInitializingAudioSession ? 'Initializing...' : 'Initialize Audio Session'}
              </button>
            )}
          </div>
        </div>

        {/* Streaming Toggle */}
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">Transcription Mode</h3>
              <p className="text-sm text-gray-600">
                {useStreaming ? 'Streaming mode shows transcription in real-time' : 'Standard mode waits for complete transcription'}
              </p>
            </div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={useStreaming}
                onChange={(e) => setUseStreaming(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Streaming</span>
            </label>
          </div>
        </div>

        {/* Recording Controls */}
        <div className="flex flex-col items-center space-y-6 mb-8">
          <div className="flex items-center space-x-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                <Mic className="w-5 h-5" />
                <span>Start Recording</span>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center space-x-2 bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                <Square className="w-5 h-5" />
                <span>Stop Recording</span>
              </button>
            )}
          </div>

          {isRecording && (
            <div className="text-center">
              <div className="text-2xl font-mono text-red-500 mb-2">
                🔴 {formatDuration(recordingDuration)}
              </div>
              <p className="text-sm text-gray-600">Recording in progress...</p>
            </div>
          )}
        </div>

        {/* Audio Playback Controls */}
        {audioBlob && !isRecording && (
          <div className="flex flex-col items-center space-y-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Recording completed ({formatDuration(recordingDuration)})</p>
            <div className="flex items-center space-x-4">
              <button
                onClick={playAudio}
                className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                onClick={downloadAudio}
                className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>

              <button
                onClick={transcribeAudio}
                disabled={!audioSession && !isInitializingAudioSession}
                className="flex items-center space-x-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                {isInitializingAudioSession ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Brain className="w-4 h-4" />
                )}
                <span>{isInitializingAudioSession ? 'Initializing...' : 'Transcribe with AI'}</span>
              </button>

              <button
                onClick={clearAll}
                className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {(error || promptError) && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <p className="font-semibold">Error:</p>
            <p>{error || (promptError as string)}</p>
          </div>
        )}

        {/* Streaming Transcription Display */}
        {streamingTranscription && (
          <div className="bg-blue-50 rounded-lg p-6 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-blue-800">Live Transcription</h3>
              {!streamingTranscription.isComplete && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-blue-600">Streaming...</span>
                </div>
              )}
              {streamingTranscription.isComplete && (
                <span className="text-sm text-green-600">✓ Complete</span>
              )}
            </div>
            <div className="bg-white p-4 rounded border border-blue-200">
              <p className="text-gray-800 leading-relaxed">
                {streamingTranscription.text}
                {!streamingTranscription.isComplete && (
                  <span className="inline-block w-2 h-5 bg-blue-500 ml-1 animate-pulse"></span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Final Transcription Results */}
        {transcription && (
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-3">
              {transcription.isStreaming ? 'Final Transcription' : 'Transcription Result'}
            </h3>
            <div className="mb-4">
              <p className="text-gray-600 text-sm mb-2">
                Mode: {transcription.isStreaming ? 'Streaming' : 'Standard'} |
                Timestamp: {new Date(transcription.timestamp).toLocaleString()}
              </p>
              <div className="bg-white p-4 rounded border">
                <p className="text-gray-800 leading-relaxed">{transcription.text}</p>
              </div>
            </div>
          </div>
        )}

        {/* Hidden Audio Element */}
        <audio ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

export default AudioTest;
