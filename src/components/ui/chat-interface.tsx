import React, { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '~components/ui/scroll-area';
import { VoiceMemoBubble } from '~components/ui/voice-memo-bubble';
import { AITextBubble } from '~components/ui/ai-text-bubble';
import FunctionCallBubble from '~components/ui/function-call-bubble';
import { cn } from '~lib/utils';
import type { ChatInterfaceProps } from '~types/voice-memo';
import { ChevronDown } from 'lucide-react';

interface ChatInterfacePropsExtended extends ChatInterfaceProps {
    currentStreamingMessageId?: string | null;
}

export const ChatInterface: React.FC<ChatInterfacePropsExtended> = ({
    messages,
    onSendMessage,
    onPlayMessage,
    onDeleteMessage,
    isLoading = false,
    className,
    currentStreamingMessageId
}) => {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Handle scroll detection
    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px threshold
        setShowScrollButton(!isAtBottom);
    };

    // Scroll to bottom function
    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

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
            <div className="flex-1 overflow-hidden relative">
                <ScrollArea className="h-full w-full" onScrollCapture={handleScroll}>
                    <div className="p-4 space-y-4">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-medium text-white mb-2">Start a conversation</h3>
                                <p className="text-gray-500 text-sm max-w-sm">
                                    Click the voice orb below to start recording your first message.
                                    The AI will respond with its own voice memo.
                                </p>
                            </div>
                        ) : (
                            <>
                                {messages.map((message, index) => {
                                    // Render progress messages differently
                                    if (message.progressUpdate) {
                                        return (
                                            <div key={`${message.id}-${index}`} className="flex justify-start my-2">
                                                <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-sm text-blue-200">
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                                        <span className="text-xs text-blue-300">
                                                            Step {message.progressUpdate.iteration}: {message.progressUpdate.action}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-blue-400 mt-1">
                                                        {message.progressUpdate.status}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    // Render regular messages
                                    if (message.voiceMemo) {
                                        const isStreaming = currentStreamingMessageId === message.id;
                                        
                                        // Check if this is an AI message (type: 'ai')
                                        if (message.voiceMemo.type === 'ai') {
                                            return (
                                                <AITextBubble
                                                    key={`${message.id}-${index}`}
                                                    content={message.voiceMemo.transcription}
                                                    isStreaming={isStreaming}
                                                />
                                            );
                                        }
                                        
                                        // For user messages, use VoiceMemoBubble
                                        return (
                                            <div key={`${message.id}-${index}`} className="relative">
                                                <VoiceMemoBubble
                                                    voiceMemo={{
                                                        ...message.voiceMemo,
                                                        isPlaying: currentlyPlayingId === message.voiceMemo.id
                                                    }}
                                                    functionCall={message.functionCallResponse}
                                                    onPlay={handlePlayMessage}
                                                    onPause={handlePauseMessage}
                                                    onDelete={onDeleteMessage ? handleDeleteMessage : undefined}
                                                />
                                            </div>
                                        );
                                    }

                                    // Render function call messages
                                    if (message.functionCallResponse) {
                                        console.log('Rendering function call:', message.functionCallResponse);
                                        return (
                                            <div key={`${message.id}-${index}`} className="flex justify-start my-2">
                                                <FunctionCallBubble
                                                    functionCall={{
                                                        functionName: message.functionCallResponse.functionCall.name,
                                                        parameters: message.functionCallResponse.functionCall.arguments,
                                                        confidence: 1.0,
                                                        result: message.functionCallResponse.result
                                                    }}
                                                    timestamp={message.createdAt}
                                                    className="mb-4"
                                                />
                                            </div>
                                        );
                                    }

                                    return null;
                                })}
                                <div ref={messagesEndRef} />
                            </>
                        )}
                    </div>
                </ScrollArea>
                
                {/* Scroll to bottom button */}
                {showScrollButton && (
                    <button
                        onClick={scrollToBottom}
                        className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 hover:bg-gray-700 text-white rounded-full p-2 shadow-lg transition-all duration-200 z-10"
                        aria-label="Scroll to bottom"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                )}
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
