import React from 'react';
import { Bot, User, Loader2 } from 'lucide-react';

interface Message {
    id: string;
    type: 'user' | 'assistant' | 'progress';
    content: string;
    iteration?: number;
}

interface StreamingChatProps {
    messages: Message[];
    isLoading?: boolean;
}

export const StreamingChat: React.FC<StreamingChatProps> = ({ messages, isLoading = false }) => {
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
                {messages.map((message) => {
                    if (message.type === 'progress') {
                        return (
                            <div key={message.id} className="flex justify-center">
                                <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-4 py-2 text-xs text-blue-300">
                                    <Loader2 className="w-3 h-3 inline mr-2 animate-spin" />
                                    Step {message.iteration}: {message.content}
                                </div>
                            </div>
                        );
                    }

                    const isUser = message.type === 'user';

                    return (
                        <div
                            key={message.id}
                            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`flex gap-3 max-w-[80%] ${
                                    isUser ? 'flex-row-reverse' : 'flex-row'
                                }`}
                            >
                                {/* Avatar */}
                                <div
                                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                        isUser ? 'bg-gray-700' : 'bg-blue-600'
                                    }`}
                                >
                                    {isUser ? (
                                        <User className="w-4 h-4 text-white" />
                                    ) : (
                                        <Bot className="w-4 h-4 text-white" />
                                    )}
                                </div>

                                {/* Message bubble */}
                                <div
                                    className={`rounded-lg px-4 py-3 ${
                                        isUser
                                            ? 'bg-gray-700 text-white'
                                            : 'bg-gray-800 text-gray-100'
                                    }`}
                                >
                                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                                        {message.content}
                                        {!isUser && isLoading && message.id === messages[messages.length - 1]?.id && (
                                            <span className="inline-block w-1 h-4 bg-blue-500 animate-pulse ml-1 align-middle"></span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
};

