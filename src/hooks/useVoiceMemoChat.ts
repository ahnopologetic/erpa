import { useState, useEffect, useCallback, useRef } from 'react';
import type { VoiceMemo, ChatMessage, ChatSession, AIResponseOptions, AIResponseResult } from '~types/voice-memo';
import { voiceMemoStorage } from '~lib/voice-memo-storage';
import { log, err } from '~lib/log';

interface UseVoiceMemoChatOptions {
    tabId?: number;
    url?: string;
    autoLoad?: boolean;
}

interface UseVoiceMemoChatReturn {
    // State
    messages: ChatMessage[];
    currentSession: ChatSession | null;
    isLoading: boolean;
    isSaving: boolean;
    error: string | null;

    // Actions
    addUserMessage: (audioBlob: Blob, transcription: string) => Promise<void>;
    addTextMessage: (text: string) => Promise<void>;
    addAIMessage: (options: AIResponseOptions) => Promise<void>;
    addProgressMessage: (iteration: number, action: string, status: string) => Promise<void>;
    deleteMessage: (messageId: string) => Promise<void>;
    loadChatSession: (tabId: number, url: string) => Promise<void>;
    saveChatSession: () => Promise<void>;
    clearChatSession: () => Promise<void>;
    generateAIResponse: (textResponse: string) => Promise<AIResponseResult>;
}

export const useVoiceMemoChat = (options: UseVoiceMemoChatOptions = {}): UseVoiceMemoChatReturn => {
    const { tabId, url, autoLoad = true } = options;

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sessionRef = useRef<ChatSession | null>(null);

    // Load chat session
    const loadChatSession = useCallback(async (sessionTabId: number, sessionUrl: string) => {
        try {
            setIsLoading(true);
            setError(null);

            const session = await voiceMemoStorage.loadChatSession(sessionTabId, sessionUrl);

            if (session) {
                // Load voice memos for each message
                const messagesWithVoiceMemos = await Promise.all(
                    session.messages.map(async (message) => {
                        const voiceMemo = await voiceMemoStorage.loadVoiceMemo(message.voiceMemo.id);
                        if (voiceMemo) {
                            return {
                                ...message,
                                voiceMemo: {
                                    ...voiceMemo,
                                    audioUrl: voiceMemo.audioUrl ?? URL.createObjectURL(voiceMemo.audioBlob)
                                }
                            };
                        }
                        return message;
                    })
                );

                setMessages(messagesWithVoiceMemos);
                setCurrentSession(session);
                sessionRef.current = session;
            } else {
                // Create new session
                const newSession: ChatSession = {
                    id: voiceMemoStorage.generateChatSessionId(sessionTabId, sessionUrl),
                    tabId: sessionTabId,
                    url: sessionUrl,
                    messages: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                setCurrentSession(newSession);
                sessionRef.current = newSession;
                setMessages([]);
            }

            log('Chat session loaded', { sessionTabId, sessionUrl, messageCount: session?.messages.length || 0 });
        } catch (error) {
            err('Failed to load chat session', error);
            setError('Failed to load chat history');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Save chat session
    const saveChatSession = useCallback(async () => {
        if (!sessionRef.current) return;

        try {
            setIsSaving(true);
            setError(null);

            const sessionToSave = {
                ...sessionRef.current,
                messages,
                updatedAt: Date.now()
            };

            await voiceMemoStorage.saveChatSession(sessionToSave);
            setCurrentSession(sessionToSave);
            sessionRef.current = sessionToSave;

            log('Chat session saved', { messageCount: messages.length });
        } catch (error) {
            err('Failed to save chat session', error);
            setError('Failed to save chat history');
        } finally {
            setIsSaving(false);
        }
    }, [messages]);

    // Add text-only user message (for text input mode)
    const addTextMessage = useCallback(async (text: string) => {
        try {
            setError(null);

            // Ensure we have a session - create one if it doesn't exist
            if (!sessionRef.current) {
                if (!tabId || !url) {
                    throw new Error('No tab ID or URL available to create session');
                }

                const newSession: ChatSession = {
                    id: voiceMemoStorage.generateChatSessionId(tabId, url),
                    tabId: tabId,
                    url: url,
                    messages: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                setCurrentSession(newSession);
                sessionRef.current = newSession;
                log('Created new chat session', { tabId, url });
            }

            // Create a minimal audio blob for text messages (empty blob)
            const emptyAudioBlob = new Blob([''], { type: 'audio/wav' });

            const voiceMemo: VoiceMemo = {
                id: voiceMemoStorage.generateVoiceMemoId(),
                type: 'user',
                audioBlob: emptyAudioBlob,
                transcription: text,
                timestamp: Date.now(),
                isTranscribing: false
            };

            const message: ChatMessage = {
                id: `message_${voiceMemo.id}`,
                voiceMemo,
                createdAt: Date.now()
            };

            // Save voice memo to storage
            await voiceMemoStorage.saveVoiceMemo(voiceMemo);

            // Add to current messages
            setMessages(prev => [...prev, message]);

            log('Text message added', { messageId: message.id, text: text.substring(0, 50) });
        } catch (error) {
            err('Failed to add text message', error);
            setError('Failed to save your message');
        }
    }, [tabId, url]);

    // Add user message
    const addUserMessage = useCallback(async (audioBlob: Blob, transcription: string) => {
        try {
            setError(null);

            // Ensure we have a session - create one if it doesn't exist
            if (!sessionRef.current) {
                if (!tabId || !url) {
                    throw new Error('No tab ID or URL available to create session');
                }

                const newSession: ChatSession = {
                    id: voiceMemoStorage.generateChatSessionId(tabId, url),
                    tabId: tabId,
                    url: url,
                    messages: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                setCurrentSession(newSession);
                sessionRef.current = newSession;
                log('Created new chat session', { tabId, url });
            }

            const voiceMemo: VoiceMemo = {
                id: voiceMemoStorage.generateVoiceMemoId(),
                type: 'user',
                audioBlob,
                transcription,
                timestamp: Date.now(),
                isTranscribing: false
            };

            const message: ChatMessage = {
                id: `message_${voiceMemo.id}`,
                voiceMemo,
                createdAt: Date.now()
            };

            // Save voice memo to storage
            await voiceMemoStorage.saveVoiceMemo(voiceMemo);

            // Add to current messages
            setMessages(prev => [...prev, message]);

            log('User message added', { messageId: message.id, transcription: transcription.substring(0, 50) });
        } catch (error) {
            err('Failed to add user message', error);
            setError('Failed to save your message');
        }
    }, [tabId, url]);

    // Generate AI response (text to speech simulation)
    const generateAIResponse = useCallback(async (textResponse: string): Promise<AIResponseResult> => {
        try {
            // For now, we'll create a simple audio blob from text
            // In a real implementation, you'd use a TTS service
            const audioBlob = await textToSpeechBlob(textResponse);
            console.log('audioBlob', audioBlob.size);

            return {
                text: textResponse,
                audioBlob,
                audioUrl: URL.createObjectURL(audioBlob),
                duration: 3.0 // Estimated duration
            };
        } catch (error) {
            err('Failed to generate AI response', error);
            return {
                text: textResponse,
                error: 'Failed to generate audio response'
            };
        }
    }, []);

    // Add progress message
    const addProgressMessage = useCallback(async (iteration: number, action: string, status: string) => {
        try {
            setError(null);

            const message: ChatMessage = {
                id: `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                progressUpdate: {
                    iteration,
                    action,
                    status
                },
                createdAt: Date.now()
            };

            setMessages(prev => [...prev, message]);
            log('Progress message added', { iteration, action, status });
        } catch (error) {
            err('Failed to add progress message', error);
        }
    }, []);

    // Add AI message
    const addAIMessage = useCallback(async (options: AIResponseOptions) => {
        if (options.functionCallResponse) {
            const message: ChatMessage = {
                id: `message_function_call_${Date.now()}__${Math.random().toString(36).substr(2, 9)}`,
                functionCallResponse: options.functionCallResponse,
                createdAt: Date.now(),
                voiceMemo: {
                    id: voiceMemoStorage.generateVoiceMemoId(),
                    type: 'ai',
                    audioBlob: new Blob(),
                    transcription: options.textResponse,
                    timestamp: Date.now()
                }
            };

            setMessages(prev => [...prev, message]);
            return;
        }
        try {
            setError(null);

            // Ensure we have a session - create one if it doesn't exist
            if (!sessionRef.current) {
                if (!tabId || !url) {
                    throw new Error('No tab ID or URL available to create session');
                }

                const newSession: ChatSession = {
                    id: voiceMemoStorage.generateChatSessionId(tabId, url),
                    tabId: tabId,
                    url: url,
                    messages: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                setCurrentSession(newSession);
                sessionRef.current = newSession;
                log('Created new chat session for AI message', { tabId, url });
            }

            const aiResponse = await generateAIResponse(options.textResponse);

            if (aiResponse.error) {
                throw new Error(aiResponse.error);
            }

            const voiceMemo: VoiceMemo = {
                id: voiceMemoStorage.generateVoiceMemoId(),
                type: 'ai',
                audioBlob: aiResponse.audioBlob!,
                audioUrl: aiResponse.audioUrl,
                transcription: aiResponse.text,
                timestamp: Date.now(),
                duration: aiResponse.duration
            };

            const message: ChatMessage = {
                id: `message_${voiceMemo.id}`,
                voiceMemo,
                createdAt: Date.now()
            };

            // Save voice memo to storage
            await voiceMemoStorage.saveVoiceMemo(voiceMemo);

            // Add to current messages
            setMessages(prev => [...prev, message]);

            log('AI message added', { messageId: message.id, text: aiResponse.text.substring(0, 50) });
        } catch (error) {
            err('Failed to add AI message', error);
            setError('Failed to generate AI response');
        }
    }, [generateAIResponse, tabId, url]);

    // Delete message
    const deleteMessage = useCallback(async (messageId: string) => {
        try {
            setError(null);

            const message = messages.find(m => m.id === messageId);
            if (!message) return;

            // Delete voice memo from storage
            await voiceMemoStorage.deleteVoiceMemo(message.voiceMemo.id);

            // Remove from current messages
            setMessages(prev => prev.filter(m => m.id !== messageId));

            log('Message deleted', { messageId });
        } catch (error) {
            err('Failed to delete message', error);
            setError('Failed to delete message');
        }
    }, [messages]);

    // Clear chat session
    const clearChatSession = useCallback(async () => {
        setMessages([]);
        if (sessionRef.current) {
            sessionRef.current.messages = [];
            sessionRef.current.updatedAt = Date.now();
        }
    }, []);

    // Auto-load session on mount
    useEffect(() => {
        if (autoLoad && tabId && url) {
            log('Auto-loading chat session', { tabId, url });
            loadChatSession(tabId, url);
        } else {
            log('Not auto-loading session', { autoLoad, tabId, url });
        }
    }, [autoLoad, tabId, url, loadChatSession]);

    // Auto-save when messages change
    useEffect(() => {
        if (messages.length > 0 && sessionRef.current) {
            const timeoutId = setTimeout(() => {
                saveChatSession();
            }, 1000); // Debounce saves

            return () => clearTimeout(timeoutId);
        }
    }, [messages, saveChatSession]);

    return {
        // State
        messages,
        currentSession,
        isLoading,
        isSaving,
        error,

        // Actions
        addUserMessage,
        addTextMessage,
        addAIMessage,
        addProgressMessage,
        deleteMessage,
        loadChatSession,
        saveChatSession,
        clearChatSession,
        generateAIResponse
    };
};

// Helper function to create audio blob from text (placeholder implementation)
// Use SpeechSynthesis to generate an audio Blob from text
async function textToSpeechBlob(text: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        try {
            // Wait for voices to be loaded
            const speakText = () => {
                // Create SpeechSynthesisUtterance
                const utterance = new SpeechSynthesisUtterance(text);

                // Configure voice settings
                utterance.rate = 0.9; // Slightly slower for clarity
                utterance.pitch = 1.0; // Normal pitch
                utterance.volume = 1.0; // Full volume

                // Select the best available voice
                const voices = speechSynthesis.getVoices();
                const englishVoice = voices.find(voice =>
                    voice.lang.startsWith('en') && voice.default
                ) || voices.find(voice => voice.lang.startsWith('en'));

                if (englishVoice) {
                    utterance.voice = englishVoice;
                    console.log('Using voice:', englishVoice.name, englishVoice.lang);
                }

                // Calculate estimated duration for the audio blob
                const wordCount = text.split(/\s+/).length;
                const estimatedDuration = Math.max(wordCount / 2.5, 1.0); // ~150 words per minute

                // Create a simple audio representation
                // Since we can't directly capture SpeechSynthesis output,
                // we'll create an audio blob that represents the TTS duration
                const audioContext = new AudioContext();
                const sampleRate = audioContext.sampleRate;
                const length = sampleRate * estimatedDuration;

                const buffer = audioContext.createBuffer(1, length, sampleRate);
                const data = buffer.getChannelData(0);

                // Generate a subtle tone pattern that represents the speech
                for (let i = 0; i < length; i++) {
                    const t = i / sampleRate;
                    // Create a very subtle tone that varies with the text
                    const baseFreq = 200 + (text.charCodeAt(Math.floor(i / (length / text.length))) % 100);
                    data[i] = Math.sin(2 * Math.PI * baseFreq * t) * 0.05 * Math.exp(-t * 0.3);
                }

                // Convert to WAV blob
                const wavBuffer = encodeWAV(buffer);
                const blob = new Blob([wavBuffer], { type: 'audio/wav' });

                // Clean up
                audioContext.close();

                console.log('Generated TTS audio blob:', {
                    size: blob.size,
                    duration: estimatedDuration,
                    textLength: text.length
                });

                resolve(blob);
            };

            // Ensure voices are loaded
            if (speechSynthesis.getVoices().length === 0) {
                speechSynthesis.addEventListener('voiceschanged', speakText, { once: true });
                // Fallback timeout
                setTimeout(() => {
                    speechSynthesis.removeEventListener('voiceschanged', speakText);
                    speakText();
                }, 1000);
            } else {
                speakText();
            }

        } catch (error) {
            reject(new Error(`TTS setup failed: ${error}`));
        }
    });
}

// Helper function to encode audio buffer as WAV
function encodeWAV(buffer: AudioBuffer): ArrayBuffer {
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const channels = buffer.numberOfChannels;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize;

    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(0)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
    }

    return arrayBuffer;
}
