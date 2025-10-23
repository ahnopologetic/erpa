import { FunctionRegistry, SessionManager, StreamProcessor, buildFunctionSystemPrompt, executeFunctionCall, formatFunctionResult, parseFunctionCall } from "@ahnopologetic/use-prompt-api";
import { useEffect, useState } from "react";
import { getContentFunction, navigateFunction, readOutFunction, semanticSearchFunction } from "~lib/functions/definitions";
import { log } from "~lib/log";
import type { ChatMessage } from "~types/voice-memo";

class ErpaChatAgent {
    private session: SessionManager | null = null;
    private sessionManager: SessionManager | null = null;
    private registry: FunctionRegistry;
    private systemPrompt: string;
    private maxIterations: number;
    private onMessageUpdate?: (message: ChatMessage) => void;
    private onProgressUpdate?: (iteration: number, action: string, status: string) => void;
    private sentMessageIds: Set<string> = new Set();
    private pendingJsonContent: string = '';

    constructor(config: {
        functions: any[];
        systemPrompt?: string;
        maxIterations?: number;
        onMessageUpdate?: (message: ChatMessage) => void;
        onProgressUpdate?: (iteration: number, action: string, status: string) => void;
    }) {
        this.registry = new FunctionRegistry();
        this.registry.registerMultiple(config.functions);
        this.systemPrompt = config.systemPrompt || 'You are a helpful AI assistant with access to tools.';
        this.maxIterations = config.maxIterations || 10;
        this.onMessageUpdate = config.onMessageUpdate;
        this.onProgressUpdate = config.onProgressUpdate;
    }


    private isTaskComplete(response: string): boolean {
        const completionIndicators = [
            '<|task_complete|>',
            '<|task_complete|>\n'
        ];

        const lowerResponse = response.toLowerCase();
        return completionIndicators.some((indicator) => lowerResponse.includes(indicator));
    }

    private parseAndSendMessages(content: string, iteration: number): void {
        // Check if content contains function calls - if so, don't send as text message
        const hasFunctionCall = content.includes('```json') || 
                               content.includes('functionCall') || 
                               content.includes('<|task_complete|>') ||
                               content.includes('</task_complete|>') ||
                               content.includes('```');
        
        if (hasFunctionCall) {
            // Don't send text messages when function calls are present
            return;
        }

        // Only send text content (no JSON blocks)
        if (content.trim()) {
            const messageId = `text-${iteration}`;
            
            // Always update the message with the current accumulated content
            this.onMessageUpdate?.({
                id: messageId,
                voiceMemo: {
                    id: messageId,
                    type: 'ai',
                    audioBlob: new Blob(),
                    transcription: content.trim(),
                    timestamp: Date.now()
                },
                createdAt: Date.now()
            });
        }
    }

    public async addToContext(context: string | PromptInput[]) {
        if (!this.session) {
            throw new Error('Session not initialized');
        }
        log('Adding to context', { context })
        this.session.append(context as PromptInput[]);
    }

    async initialize() {
        this.sessionManager = new SessionManager(undefined, { enablePersistence: false });
        this.session = await this.sessionManager.create({
            systemPrompt: `${this.systemPrompt}\n\n${buildFunctionSystemPrompt(this.registry)}`,
            enablePersistence: false,
        });
        this.session.append([{ role: 'system', content: `${this.systemPrompt}\n\n${buildFunctionSystemPrompt(this.registry)}` }]);
    }

    async run(task: string): Promise<void> {
        if (!this.session) {
            throw new Error('Session not initialized');
        }
        let currentPrompt = task;
        let iteration = 0;

        console.log(`STREAMING AGENT EXECUTION`);
        console.log(`Task: ${task}\n`);

        while (iteration < this.maxIterations) {
            iteration++;
            console.log(`Iteration ${iteration}`);

            // Reset sent message IDs for new iteration
            this.sentMessageIds.clear();
            this.pendingJsonContent = '';

            // Send progress update
            this.onProgressUpdate?.(iteration, "Processing", "Generating response...");

            // Stream the response
            const stream = this.session.promptStreaming(currentPrompt);

            let fullResponse = '';
            let currentStreamContent = '';

            // Stream and collect response
            const reader = stream.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    fullResponse += value;
                    currentStreamContent += value;

                    // Don't send messages during streaming - we'll handle the final response later
                }
            } finally {
                reader.releaseLock();
            }

            // Parse for function calls
            // First try to extract JSON from code blocks
            let responseToParse = fullResponse;
            const jsonBlockMatch = fullResponse.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonBlockMatch) {
                responseToParse = jsonBlockMatch[1].trim();
            } else {
                // If no code blocks, try to extract JSON from the response
                // Look for JSON object that starts with { and ends with }
                const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    responseToParse = jsonMatch[0];
                }
            }
            
            console.log('Full response:', fullResponse);
            console.log('Parsing function call from:', responseToParse);
            const parsed = parseFunctionCall(responseToParse);
            console.log('Parsed result:', parsed);

            if (parsed.functionCall) {
                // Send progress update
                this.onProgressUpdate?.(iteration, "Executing function", `Calling ${parsed.functionCall.name}...`);

                // Display reasoning if present
                if (parsed.reasoning) {
                    console.log(`Reasoning:`);
                    console.log(parsed.reasoning);
                }

                // Display tool call as JSON
                console.log(`Tool call:`);
                console.log(JSON.stringify(parsed.functionCall, null, 2));

                // Execute function
                console.log(`\nExecuting tool...`);
                const result = await executeFunctionCall(parsed.functionCall, this.registry);

                // Display result as JSON
                console.log(`Result:`);
                console.log(JSON.stringify(result.result || result.error, null, 2));

                // Send function call result to UI
                console.log('Sending function call to UI:', {
                    id: `function-${iteration}`,
                    functionCall: parsed.functionCall,
                    result: result.result || result.error,
                    success: result.success
                });
                
                const functionCallMessage = {
                    id: `function-${iteration}`,
                    functionCallResponse: {
                        functionCall: parsed.functionCall,
                        result: result.result || result.error,
                        success: result.success
                    },
                    createdAt: Date.now()
                };
                
                console.log('Sending function call message:', functionCallMessage);
                this.onMessageUpdate?.(functionCallMessage);

                // Prepare next prompt
                const formattedResult = formatFunctionResult(
                    parsed.functionCall.name,
                    result.result || result.error,
                    result.success
                );

                currentPrompt = `${formattedResult}\n\nContinue with the task. If the task is complete, provide your final answer without calling any functions.`;

            } else {
                // No function call - check if task is complete
                const isComplete = this.isTaskComplete(fullResponse);

                if (isComplete) {
                    console.log('TASK COMPLETE');
                    console.log(`Final Answer:`);
                    console.log(fullResponse);

                    // Send final response as a new message with unique ID
                    const finalMessageId = `final-${iteration}-${Date.now()}`;
                    console.log('Sending final message with ID:', finalMessageId);
                    this.onMessageUpdate?.({
                        id: finalMessageId,
                        voiceMemo: {
                            id: finalMessageId,
                            type: 'ai',
                            audioBlob: new Blob(),
                            transcription: fullResponse.trim(),
                            timestamp: Date.now()
                        },
                        createdAt: Date.now()
                    });
                    break;
                }

                // Send intermediate response as a new message
                const intermediateMessageId = `intermediate-${iteration}-${Date.now()}`;
                console.log('Sending intermediate message with ID:', intermediateMessageId);
                this.onMessageUpdate?.({
                    id: intermediateMessageId,
                    voiceMemo: {
                        id: intermediateMessageId,
                        type: 'ai',
                        audioBlob: new Blob(),
                        transcription: fullResponse.trim(),
                        timestamp: Date.now()
                    },
                    createdAt: Date.now()
                });

                currentPrompt = 'Continue with the task.';
            }
        }

        if (iteration >= this.maxIterations) {
            console.log('MAX ITERATIONS REACHED');
        }
    }

    async destroy() {
        if (!this.session) {
            throw new Error('Session not initialized');
        }
        this.session.destroy();
    }
}

const useErpaChatAgent = (onMessageUpdate?: (message: ChatMessage) => void, onProgressUpdate?: (iteration: number, action: string, status: string) => void) => {
    const [agent, setAgent] = useState<ErpaChatAgent | null>(null);

    useEffect(() => {
        setAgent(new ErpaChatAgent({
            functions: [navigateFunction, readOutFunction, getContentFunction, semanticSearchFunction],
            systemPrompt: "You're a helpful AI browser agent who helps visually impaired users navigate and understand websites.",
            maxIterations: 2,
            onMessageUpdate,
            onProgressUpdate,
        }));
    }, [onMessageUpdate, onProgressUpdate]);

    return agent;
}

export { useErpaChatAgent, ErpaChatAgent };