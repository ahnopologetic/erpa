import React from 'react';
import { cn } from '~lib/utils';

interface AITextBubbleProps {
    content: string;
    isStreaming?: boolean;
    className?: string;
}

export const AITextBubble: React.FC<AITextBubbleProps> = ({
    content,
    isStreaming = false,
    className
}) => {
    // Remove all occurrences of <|task_complete|> (ignoring case just in case)
    const sanitizedContent = content.replace(/<\|task_complete\|>/gi, '').trim();

    return (
        <div className={cn("flex justify-start my-2", className)}>
            <div className="rounded-lg px-4 py-3 max-w-[80%]">
                <div className="text-sm text-gray-100 whitespace-pre-wrap">
                    {sanitizedContent}
                    {isStreaming && (
                        <span className="inline-block w-0.5 h-4 bg-blue-400 ml-1 animate-pulse" />
                    )}
                </div>
            </div>
        </div>
    );
};
