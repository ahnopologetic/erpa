import React, { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '~components/ui/scroll-area';
import { VoiceMemoBubble } from '~components/ui/voice-memo-bubble';
import { cn } from '~lib/utils';
import type { ChatInterfaceProps } from '~types/voice-memo';

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
    messages,
    onSendMessage,
    onPlayMessage,
    onDeleteMessage,
    isLoading = false,
    className
}) => {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Handle voice memo play
    const handlePlayMessage = (voiceMemo: any) => {
        // Stop any currently playing message
        if (currentlyPlayingId && currentlyPlayingId !== voiceMemo.id) {
            // This will be handled by individual VoiceMemoBubble components
            setCurrentlyPlayingId(null);
        }

        setCurrentlyPlayingId(voiceMemo.id);
        onPlayMessage?.(messages.find(m => m.voiceMemo.id === voiceMemo.id)!);
    };

    // Handle voice memo pause
    const handlePauseMessage = (voiceMemo: any) => {
        setCurrentlyPlayingId(null);
    };

    // Handle voice memo delete
    const handleDeleteMessage = (voiceMemoId: string) => {
        const message = messages.find(m => m.voiceMemo.id === voiceMemoId);
        if (message) {
            onDeleteMessage?.(message.id);
        }
    };

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Messages container */}
            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full w-full">
                    <div className="p-4 space-y-1">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">Start a conversation</h3>
                                <p className="text-gray-500 text-sm max-w-sm">
                                    Click the voice orb below to start recording your first message.
                                    The AI will respond with its own voice memo.
                                </p>
                            </div>
                        ) : (
                            <>
                                {messages.map((message) => (
                                    <VoiceMemoBubble
                                        key={message.id}
                                        voiceMemo={{
                                            ...message.voiceMemo,
                                            isPlaying: currentlyPlayingId === message.voiceMemo.id
                                        }}
                                        onPlay={handlePlayMessage}
                                        onPause={handlePauseMessage}
                                        onDelete={onDeleteMessage ? handleDeleteMessage : undefined}
                                    />
                                ))}
                                <div ref={messagesEndRef} />
                            </>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Loading indicator */}
            {isLoading && (
                <div className="p-4 border-t bg-gray-900">
                    <div className="flex items-center justify-center space-x-2">
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm text-gray-300">Processing your message...</span>
                    </div>
                </div>
            )}

            {/* Footer with instructions */}
            {messages.length > 0 && (
                <div className="p-3 border-t bg-gray-800">
                    <p className="text-xs text-gray-400 text-center">
                        Click the voice orb to record a new message
                    </p>
                </div>
            )}
        </div>
    );
};
