import React from 'react';
import { Bot, Clock, User } from 'lucide-react';
import { cn } from '~lib/utils';

interface StreamingTextBubbleProps {
    text: string;
    timestamp: number;
    type?: 'user' | 'ai';
    isStreaming?: boolean;
    className?: string;
}

export const StreamingTextBubble: React.FC<StreamingTextBubbleProps> = ({
    text,
    timestamp,
    type = 'ai',
    isStreaming = false,
    className
}) => {
    const isUser = type === 'user';

    return (
        <div className={cn(
            "flex w-full mb-4",
            isUser ? "justify-end" : "justify-start",
            className
        )}>
            <div className={cn(
                "max-w-xs lg:max-w-md rounded-2xl p-4 shadow-lg",
                isUser
                    ? "bg-gray-800 text-white rounded-br-md border border-gray-800"
                    : "bg-gray-100 text-gray-900 rounded-bl-md border"
            )}>
                {/* Header with icon and timestamp */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                        {isUser ? (
                            <User className="w-4 h-4" />
                        ) : (
                            <Bot className="w-4 h-4" />
                        )}
                        {isStreaming && !isUser && (
                            <span className="text-xs text-blue-500 flex items-center space-x-1">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                <span>Streaming...</span>
                            </span>
                        )}
                    </div>
                    <div className="flex items-center space-x-2">
                        <Clock className="w-3 h-3 opacity-75" />
                        <span className="text-xs opacity-75">
                            {new Date(timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                </div>

                {/* Text content */}
                <div className={cn(
                    "text-sm leading-relaxed break-words whitespace-pre-wrap",
                    isUser ? "text-gray-100" : "text-gray-700"
                )}>
                    {text}
                    {isStreaming && !isUser && (
                        <span className="inline-block w-1 h-4 bg-blue-500 animate-pulse ml-1"></span>
                    )}
                </div>
            </div>
        </div>
    );
};

