import { FunctionRegistry, SessionManager, StreamProcessor, buildFunctionSystemPrompt, executeFunctionCall, formatFunctionResult, parseFunctionCall } from "@ahnopologetic/use-prompt-api";
import { useEffect, useState } from "react";
import { getContentFunction, navigateFunction, readOutFunction } from "~lib/functions/definitions";

class ErpaChatAgent {
    private session: SessionManager | null = null;
    private registry: FunctionRegistry;
    private systemPrompt: string;
    private maxIterations: number;

    constructor(config: {
        functions: any[];
        systemPrompt?: string;
        maxIterations?: number;
    }) {
        this.registry = new FunctionRegistry();
        this.registry.registerMultiple(config.functions);
        this.systemPrompt = config.systemPrompt || 'You are a helpful AI assistant with access to tools.';
        this.maxIterations = config.maxIterations || 10;
    }


    private isTaskComplete(response: string): boolean {
        const completionIndicators = [
            'task is complete',
            'task complete',
            'finished',
            'final answer',
            'in conclusion',
            'to summarize',
        ];

        const lowerResponse = response.toLowerCase();
        return completionIndicators.some((indicator) => lowerResponse.includes(indicator));
    }

    public async addToContext(context: string) {
        if (!this.session) {
            throw new Error('Session not initialized');
        }
        // TODO: add to context
    }

    async run(task: string): Promise<void> {
        this.session = new SessionManager();

        const fullSystemPrompt = `${this.systemPrompt}\n\n${buildFunctionSystemPrompt(this.registry)}`;

        await this.session.create({
            systemPrompt: fullSystemPrompt,
            enablePersistence: false,
        });

        let currentPrompt = task;
        let iteration = 0;

        console.log(`STREAMING AGENT EXECUTION`);
        console.log(`Task: ${task}\n`);

        while (iteration < this.maxIterations) {
            iteration++;

            console.log(`Iteration ${iteration}`);

            // Stream the response
            const stream = this.session.promptStreaming(currentPrompt);
            const processor = new StreamProcessor(stream);

            console.log(`Agent Response (streaming)\n`);

            let fullResponse = '';

            // Stream and collect response
            for await (const chunk of processor.iterate()) {
                fullResponse = chunk;
                // Clear line and rewrite to show streaming effect
                process.stdout.write('\r\x1b[K'); // Clear current line
                // TODO: print streaming
                console.log(chunk.substring(0, 150) + (chunk.length > 150 ? '...' : ''));
            }

            console.log('\n'); // New line after streaming completes

            // Parse for function calls
            const parsed = parseFunctionCall(fullResponse);

            if (parsed.functionCall) {
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
                    break;
                }

                currentPrompt = 'Continue with the task.';
            }
        }

        if (iteration >= this.maxIterations) {
            console.log('MAX ITERATIONS REACHED');
        }

        this.session.destroy();
    }
}

const useErpaChatAgent = () => {
    const [agent, setAgent] = useState<ErpaChatAgent | null>(null);

    useEffect(() => {
        setAgent(new ErpaChatAgent({
            functions: [navigateFunction, readOutFunction, getContentFunction],
            systemPrompt: "You're a helpful AI browser agent who helps visually impaired users navigate and understand websites.",
            maxIterations: 10,
        }));
    }, []);

    return agent;
}

export { useErpaChatAgent };