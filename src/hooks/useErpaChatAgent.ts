import { FunctionRegistry, SessionManager, StreamProcessor, buildFunctionSystemPrompt, executeFunctionCall, formatFunctionResult, parseFunctionCall } from "@ahnopologetic/use-prompt-api";
import { useEffect, useState } from "react";
import { getContentFunction, navigateFunction, readOutFunction } from "~lib/functions/definitions";
import { log } from "~lib/log";
import type { ChatMessage } from "~types/voice-memo";

const SYSTEM_PROMPT = `You're a helpful AI browser agent who helps visually impaired users navigate and understand websites.

### OUTPUT RULES

You can respond in **two ways**:

1️⃣ **Direct Answer (no function needed)**  
Respond naturally to the user in plain text, then finish with this token: <|task_complete|>

Example:
User: What is the capital of France?
You:
<text>
The capital of France is Paris.
</text>
<|task_complete|>

2️⃣ **Function Call (when you need data or action)**  
Return ONLY a valid JSON object and nothing else. Follow this format exactly:
\`\`\`json
{
  "functionCall": {
    "name": "function_name",
    "arguments": {
      "param1": "value1",
      "param2": "value2"
    }
  },
  "reasoning": "Briefly explain why you're calling this function"
}
\`\`\`

BEHAVIOR RULES
- Never mix natural text with a JSON function call in the same message.
- Always use <|task_complete|> to mark when your task is complete.
- Always use the function names and parameter names exactly as defined.
- If you get a function result, use it to provide a helpful final answer.
- Keep reasoning concise (1–2 sentences max).
- If the answer is known or can be reasoned directly, prefer direct output.
`

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
        this.systemPrompt = config.systemPrompt || SYSTEM_PROMPT;
        this.maxIterations = config.maxIterations || 10;
        this.onMessageUpdate = config.onMessageUpdate;
        this.onProgressUpdate = config.onProgressUpdate;
    }


    private isTaskComplete(response: string): boolean {
        return response.includes('<|task_complete|>');
    }

    private parseAndSendMessages(content: string, iteration: number): void {
        // Remove JSON blocks from content - we don't want to show them as separate messages
        const cleanedContent = content.replace(/```json[\s\S]*?```/g, '');

        // Only send text content (no JSON blocks)
        if (cleanedContent.trim()) {
            const messageId = `text-${iteration}`;
            this.onMessageUpdate?.({
                id: messageId,
                voiceMemo: {
                    id: messageId,
                    type: 'ai',
                    audioBlob: new Blob(),
                    transcription: cleanedContent.trim(),
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

                    // Parse for json blocks and create separate messages
                    this.parseAndSendMessages(currentStreamContent, iteration);
                }
            } finally {
                reader.releaseLock();
            }

            // Parse for function calls
            const parsed = parseFunctionCall(fullResponse);

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
                this.onMessageUpdate?.({
                    id: `function-${iteration}`,
                    functionCallResponse: {
                        functionCall: parsed.functionCall,
                        result: result.result || result.error,
                        success: result.success
                    },
                    createdAt: Date.now()
                });

                // Prepare next prompt
                const formattedResult = formatFunctionResult(
                    parsed.functionCall.name,
                    result.result || result.error,
                    result.success
                );

                currentPrompt = `${formattedResult}\n\nContinue with the task. If the task is complete, provide your final answer without calling any functions.`;
            }

            const isComplete = this.isTaskComplete(fullResponse);

            if (isComplete) {
                console.log('TASK COMPLETE');
                console.log(`Final Answer:`);
                console.log(fullResponse);

                // Parse final response for any remaining content
                this.parseAndSendMessages(fullResponse, iteration);
                break;
            }

            currentPrompt = 'Continue with the task.';
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
            functions: [navigateFunction, readOutFunction, getContentFunction],
            systemPrompt: "You're a helpful AI browser agent who helps visually impaired users navigate and understand websites.",
            maxIterations: 2,
            onMessageUpdate,
            onProgressUpdate,
        }));
    }, [onMessageUpdate, onProgressUpdate]);

    return agent;
}

export { useErpaChatAgent, ErpaChatAgent };