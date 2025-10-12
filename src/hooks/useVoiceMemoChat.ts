import { useState, useEffect, useCallback, useRef } from 'react';
import { VoiceMemo, ChatMessage, ChatSession, AIResponseOptions, AIResponseResult } from '~types/voice-memo';
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
  addAIMessage: (options: AIResponseOptions) => Promise<void>;
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
                  audioUrl: voiceMemo.audioUrl || URL.createObjectURL(voiceMemo.audioBlob)
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

  // Add user message
  const addUserMessage = useCallback(async (audioBlob: Blob, transcription: string) => {
    if (!sessionRef.current) return;
    
    try {
      setError(null);
      
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
  }, []);

  // Generate AI response (text to speech simulation)
  const generateAIResponse = useCallback(async (textResponse: string): Promise<AIResponseResult> => {
    try {
      // For now, we'll create a simple audio blob from text
      // In a real implementation, you'd use a TTS service
      const audioBlob = await textToSpeechBlob(textResponse);
      
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

  // Add AI message
  const addAIMessage = useCallback(async (options: AIResponseOptions) => {
    if (!sessionRef.current) return;
    
    try {
      setError(null);
      
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
  }, [generateAIResponse]);

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
  const clearChatSession = useCallback(() => {
    setMessages([]);
    if (sessionRef.current) {
      sessionRef.current.messages = [];
      sessionRef.current.updatedAt = Date.now();
    }
  }, []);

  // Auto-load session on mount
  useEffect(() => {
    if (autoLoad && tabId && url) {
      loadChatSession(tabId, url);
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
    addAIMessage,
    deleteMessage,
    loadChatSession,
    saveChatSession,
    clearChatSession,
    generateAIResponse
  };
};

// Helper function to create audio blob from text (placeholder implementation)
async function textToSpeechBlob(text: string): Promise<Blob> {
  // This is a placeholder implementation
  // In a real app, you'd use Web Speech API or a TTS service
  
  // Create a simple tone for demonstration
  const audioContext = new AudioContext();
  const sampleRate = audioContext.sampleRate;
  const duration = Math.max(text.length * 0.1, 1.0); // Rough duration estimate
  const length = sampleRate * duration;
  
  const buffer = audioContext.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  
  // Generate a simple tone
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1;
  }
  
  // Convert to blob (simplified)
  const arrayBuffer = buffer.getChannelData(0).buffer.slice(0);
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
