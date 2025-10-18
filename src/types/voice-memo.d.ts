// Voice Memo and Chat Interface Types

export interface VoiceMemo {
    id: string;
    type: 'user' | 'ai';
    audioBlob: Blob;
    audioUrl?: string; // Generated URL for playback
    transcription: string;
    timestamp: number;
    duration?: number; // Audio duration in seconds
    isPlaying?: boolean;
    isTranscribing?: boolean;
    error?: string;
}

interface ParsedFunctionWithResult {
    functionCall: {
        name: string;
        arguments: Record<string, any>;
    };
    result: any;
    success: boolean;
}

export interface ChatMessage {
    id: string;
    voiceMemo?: VoiceMemo;
    functionCallResponse?: ParsedFunctionWithResult;
    progressUpdate?: {
        iteration: number;
        action: string;
        status: string;
    };
    createdAt: number;
    updatedAt?: number;
}

export interface ChatSession {
    id: string;
    tabId: number;
    url: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

export interface VoiceMemoBubbleProps {
    voiceMemo?: VoiceMemo;
    functionCall?: ParsedFunctionWithResult;
    onPlay?: (voiceMemo: VoiceMemo) => void;
    onPause?: (voiceMemo: VoiceMemo) => void;
    onDelete?: (voiceMemoId: string) => void;
    className?: string;
}

export interface ChatInterfaceProps {
    messages: ChatMessage[];
    onSendMessage?: (audioBlob: Blob, transcription: string) => void;
    onPlayMessage?: (message: ChatMessage) => void;
    onDeleteMessage?: (messageId: string) => void;
    isLoading?: boolean;
    className?: string;
}

export interface VoiceMemoStorage {
    saveChatSession: (session: ChatSession) => Promise<void>;
    loadChatSession: (tabId: number, url: string) => Promise<ChatSession | null>;
    saveVoiceMemo: (voiceMemo: VoiceMemo) => Promise<void>;
    loadVoiceMemo: (id: string) => Promise<VoiceMemo | null>;
    deleteVoiceMemo: (id: string) => Promise<void>;
    getAllChatSessions: () => Promise<ChatSession[]>;
}

export interface AudioPlaybackState {
    currentMessageId: string | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
}

// Extend existing types for AI response generation
export interface AIResponseOptions {
    textResponse: string;
    generateAudio?: boolean;
    voiceSettings?: {
        voice?: string;
        speed?: number;
        pitch?: number;
    };
    functionCallResponse?: ParsedFunctionWithResult;
}

export interface AIResponseResult {
    text: string;
    audioBlob?: Blob;
    audioUrl?: string;
    duration?: number;
    error?: string;
}
