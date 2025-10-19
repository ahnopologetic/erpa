import React from 'react';
// Full assistant-ui implementation (commented out until dependency issue is resolved)
import { ThreadPrimitive, MessagePrimitive } from "@assistant-ui/react";
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { createAssistantRuntime } from '@assistant-ui/react';
import { VoiceMemoBubble } from '~components/ui/voice-memo-bubble';
import FunctionCallBubble from '~components/ui/function-call-bubble';
import { cn } from '~lib/utils';

// Full assistant-ui implementation - uncomment when @assistant-ui/tap/react issue is resolved

// Custom User Message Component using assistant-ui primitives
const CustomUserMessage = () => {
    return (
        <MessagePrimitive.Root className="flex justify-end my-2">
            <div className="max-w-[80%]">
                <MessagePrimitive.Parts
                    components={{
                        Text: ({ part }) => (
                            <div className="bg-blue-600 text-white rounded-lg px-4 py-2 shadow-lg">
                                <div className="text-sm font-medium mb-1">You</div>
                                <div>{part.text}</div>
                            </div>
                        ),
                        Unstable_Audio: ({ part }) => (
                            <VoiceMemoBubble
                                voiceMemo={{
                                    id: part.id || 'unknown',
                                    audioUrl: part.url,
                                    duration: part.duration || 0,
                                    isPlaying: false,
                                    timestamp: new Date().toISOString()
                                }}
                                onPlay={() => { }}
                                onPause={() => { }}
                            />
                        )
                    }}
                />
            </div>
        </MessagePrimitive.Root>
    );
};

// Custom Assistant Message Component using assistant-ui primitives
const CustomAssistantMessage = () => {
    return (
        <MessagePrimitive.Root className="flex justify-start my-2">
            <div className="max-w-[80%]">
                <MessagePrimitive.Parts
                    components={{
                        Text: ({ part }) => (
                            <div className="bg-gray-700 text-white rounded-lg px-4 py-2 shadow-lg">
                                <div className="text-sm font-medium mb-1 text-blue-300">Assistant</div>
                                <div>{part.text}</div>
                            </div>
                        ),
                        Unstable_Audio: ({ part }) => (
                            <VoiceMemoBubble
                                voiceMemo={{
                                    id: part.id || 'unknown',
                                    audioUrl: part.url,
                                    duration: part.duration || 0,
                                    isPlaying: false,
                                    timestamp: new Date().toISOString()
                                }}
                                onPlay={() => { }}
                                onPause={() => { }}
                            />
                        ),
                        tools: {
                            by_name: {
                                // Handle function calls
                                'function_call': ({ part }) => (
                                    <FunctionCallBubble
                                        functionCall={{
                                            functionName: part.name,
                                            parameters: part.arguments,
                                            confidence: 1.0,
                                            result: part.result
                                        }}
                                        timestamp={new Date().toISOString()}
                                        className="mb-4"
                                    />
                                )
                            },
                            Fallback: ({ part }) => (
                                <div className="bg-yellow-600/20 border border-yellow-500/50 rounded-lg px-3 py-2 text-sm text-yellow-200">
                                    <div className="font-medium">Tool Call: {part.name}</div>
                                    <div className="text-xs text-yellow-300 mt-1">
                                        {JSON.stringify(part.arguments, null, 2)}
                                    </div>
                                </div>
                            )
                        }
                    }}
                />
            </div>
        </MessagePrimitive.Root>
    );
};

// Empty State Component
const EmptyState = () => (
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
);

// Full Assistant-UI Messages Component
export const AssistantUIMessagesFull = () => {
    return (
        <ThreadPrimitive.Root className="flex flex-col h-full">
            <ThreadPrimitive.Viewport className="flex-1 overflow-hidden">
                <ThreadPrimitive.Empty>
                    <EmptyState />
                </ThreadPrimitive.Empty>

                <ThreadPrimitive.Messages
                    components={{
                        UserMessage: CustomUserMessage,
                        AssistantMessage: CustomAssistantMessage,
                    }}
                />
            </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
    );
};

// Runtime Provider for Assistant-UI
export const AssistantUIRuntimeProvider = ({ children }: { children: React.ReactNode }) => {
    const runtime = createAssistantRuntime({
        adapter: {
            async run({ messages, onFinish, onError }) {
                // Mock adapter for testing
                setTimeout(() => {
                    const response = {
                        id: Date.now().toString(),
                        role: 'assistant' as const,
                        content: [
                            {
                                type: 'text' as const,
                                text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
                            }
                        ],
                        createdAt: new Date().toISOString()
                    };
                    onFinish(response);
                }, 1000);
            }
        }
    });

    return (
        <AssistantRuntimeProvider runtime={runtime}>
            {children}
        </AssistantRuntimeProvider>
    );
};

// Placeholder component for now
// export const AssistantUIMessagesFull = () => {
//     return (
//         <div className="flex flex-col h-full">
//             <div className="flex-1 overflow-hidden">
//                 <div className="flex flex-col items-center justify-center h-full text-center py-12">
//                     <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
//                         <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
//                         </svg>
//                     </div>
//                     <h3 className="text-lg font-medium text-white mb-2">Assistant-UI Integration</h3>
//                     <p className="text-gray-500 text-sm max-w-sm">
//                         Full assistant-ui integration ready when dependency issues are resolved.
//                         Check assistant-ui-full.tsx for the complete implementation.
//                     </p>
//                 </div>
//             </div>
//         </div>
//     );
// };

// export const AssistantUIRuntimeProvider = ({ children }: { children: React.ReactNode }) => {
//     return <>{children}</>;
// };
