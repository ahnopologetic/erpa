import { useCallback, useState } from "react";
import type { TocItem, PromptAPIActions } from "~hooks/usePromptAPI";
import { parseCommand, executeCommand } from "~lib/functions/parser";
import { functionRegistry } from "~lib/functions/registry";
import { log, err } from "~lib/log";
import type { AIResponseOptions } from "~types/voice-memo";

interface UseFunctionCallsOptions {
    promptSession: LanguageModelSession | null;
    loadContextForCurrentTab: PromptAPIActions["loadContextForCurrentTab"];
    addAIMessage: (options: AIResponseOptions) => Promise<void>;
    addProgressMessage: (iteration: number, action: string, status: string) => Promise<void>;
}

interface UseFunctionCallsReturn {
    isProcessing: boolean;
    processUserInput: (naturalLanguageInput: string) => Promise<void>;
}

export function useFunctionCalls(options: UseFunctionCallsOptions): UseFunctionCallsReturn {
    const { promptSession, loadContextForCurrentTab, addAIMessage, addProgressMessage } = options;
    const [isProcessing, setIsProcessing] = useState(false);

    const processUserInput = useCallback(async (naturalLanguageInput: string) => {
        if (!promptSession) {
            return;
        }

        if (!naturalLanguageInput || !naturalLanguageInput.trim()) {
            return;
        }

        setIsProcessing(true);
        try {
            // Load TOC context before parsing command
            let tocContext: TocItem[] = [];
            try {
                tocContext = await loadContextForCurrentTab();
                log('Loaded TOC context for parseCommand (hook)', { tocContextCount: tocContext.length });
            } catch (contextError) {
                log('Failed to load TOC context, proceeding without it', contextError);
            }

            // First, quickly check if it's a simple question that can be answered directly
            try {
                const answer = await promptSession.prompt([
                    {
                        role: 'assistant',
                        content: [
                            {
                                type: 'text',
                                value: `You are a web browsing assistant. Decide whether the user input requires web browsing actions or can be answered with general knowledge.

                            Available web browsing functions:
                            ${functionRegistry.map(func => `- ${func.name}: ${func.description}`).join('\n')}

                            RULES:
                            - If the user wants to FIND, READ, GET, SUMMARIZE, or ANALYZE content from the current webpage → Use functions (respond with <blank>)
                            - If the user wants to NAVIGATE to sections → Use functions (respond with <blank>)
                            - If the user asks about SPECIFIC CONTENT on the current page → Use functions (respond with <blank>)
                            - If the user asks general knowledge questions NOT about the current page → Answer directly
                            - If the user asks simple questions, greetings, or casual conversation → Answer directly

                            Examples:
                            ❌ "Find information about Harvard's campus and summarize" → <blank> (needs web browsing)
                            ❌ "Read the introduction section" → <blank> (needs web browsing)
                            ❌ "Navigate to the about page" → <blank> (needs web browsing)
                            ❌ "Get content from the FAQ section" → <blank> (needs web browsing)
                            ✅ "What is 2+2?" → "2+2 equals 4" (general knowledge)
                            ✅ "What is the capital of France?" → "The capital of France is Paris" (general knowledge)
                            ✅ "Hello, how are you?" → "Hello! I'm doing well, thank you for asking." (casual conversation)
                            ✅ "Can you help me understand this concept?" → Answer directly (general question)

                            ONLY respond with <blank> if web browsing functions are needed.
                            `
                            },
                        ]
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', value: naturalLanguageInput }
                        ]
                    }
                ]);

                log('Classification result', { 
                    originalInput: naturalLanguageInput,
                    answer, 
                    trimmed: answer.trim(), 
                    isBlank: answer.trim() === '<blank>',
                    willUseFunctions: answer.trim() === '<blank>'
                });

                // Normalize the answer by trimming whitespace and checking for <blank>
                const normalizedAnswer = answer.trim();
                if (normalizedAnswer !== '<blank>' && normalizedAnswer.length > 0) {
                    log('Using direct text response instead of functions');
                    await addAIMessage({ textResponse: answer });
                    setIsProcessing(false);
                    return;
                }
                
                log('Proceeding to function call system');
            } catch (qaError) {
                // Continue to function parsing if classification failed
                log('Question/command classification failed; continuing to function parsing', qaError);
            }

            // Multi-turn agentic execution
            const maxIterations = 10;
            let iteration = 0;
            let currentContext = naturalLanguageInput;
            let taskComplete = false;

            // Create a new session for multi-turn execution
            const multiTurnSession = await promptSession.clone();

            // Set up the system prompt for multi-turn behavior
            await multiTurnSession.append([{
                role: 'system',
                content: `You are an autonomous web browsing agent that MUST use functions to complete tasks.

CRITICAL: You CANNOT provide information about webpage content without using the getContent function first.

Available functions:
${functionRegistry.map(func => `
- ${func.name}: ${func.description}
  Parameters: ${func.parameters.map(p => `${p.name} (${p.type}${p.required ? ', required' : ''})`).join(', ')}
  Examples: ${func.examples.join(', ')}
`).join('\n')}

Your workflow:
1. For ANY task involving webpage content, you MUST use getContent to read the content first
2. Use navigate to move to different sections if needed
3. After reading content, analyze and summarize it
4. When task is complete, respond with task_complete function
5. NEVER provide information about webpage content without first using getContent

Context: ${tocContext.length > 0 ? `Available sections: ${tocContext.map(item => `"${item.title}" (${item.cssSelector})`).join(', ')}` : 'No sections detected'}

Example workflow for "Find information about Harvard's campus and summarize":
1. Use getContent to read campus-related sections
2. If multiple sections exist, navigate between them and get content from each
3. Analyze and summarize the collected content
4. Use task_complete when done

You will receive the result of each function call and should decide the next action based on that result.`
            }]);

            while (iteration < maxIterations && !taskComplete) {
                iteration++;
                
                try {
                    // Add progress message
                    await addProgressMessage(iteration, "Analyzing task", "Determining next action...");

                    // Parse the current command/context
                    log('Parsing command for iteration', { iteration, currentContext });
                    const parsedCommand = await parseCommand(multiTurnSession, currentContext, tocContext);
                    log('Parsed command result', { iteration, parsedCommand });
                    
                    if (!parsedCommand || parsedCommand.confidence < 0.8) {
                        await addProgressMessage(iteration, "Error", "Could not parse command");
                        await addAIMessage({
                            textResponse: "I'm sorry, I couldn't understand what you want me to do. Please try again."
                        });
                        break;
                    }

                    // Check if task is complete
                    if (parsedCommand.functionName === 'task_complete') {
                        await addProgressMessage(iteration, "Task Complete", parsedCommand.parameters.summary || "Task completed successfully");
                        await addAIMessage({
                            textResponse: `Task completed! ${parsedCommand.parameters.summary || "All requested actions have been performed."}`
                        });
                        taskComplete = true;
                        break;
                    }

                    // Execute the function
                    await addProgressMessage(iteration, `Executing ${parsedCommand.functionName}`, "Running function...");
                    
                    const result = await executeCommand(parsedCommand);
                    log('Executed command (multi-turn)', { iteration, parsedCommand, result });

                    // Add the result to the session context
                    await multiTurnSession.append([{
                        role: 'assistant',
                        content: `Function ${parsedCommand.functionName} executed with result: ${JSON.stringify(result.result)}`
                    }]);

                    // Ask AI what to do next
                    const nextActionResponse = await multiTurnSession.prompt([
                        {
                            role: 'user',
                            content: `Based on the result of ${parsedCommand.functionName}, what should be the next action? Or is the task complete?`
                        }
                    ]);

                    // Update context for next iteration
                    currentContext = nextActionResponse;

                    // Add function call result to chat
                    await addAIMessage({
                        functionCallResponse: {
                            ...parsedCommand,
                            result: result.result
                        },
                        textResponse: ""
                    });

                } catch (error) {
                    err('Error in multi-turn iteration', { iteration, error });
                    await addProgressMessage(iteration, "Error", `Failed: ${error.message}`);
                    await addAIMessage({
                        textResponse: `I encountered an error on step ${iteration}: ${error.message}. Please try again.`
                    });
                    break;
                }
            }

            // Clean up the multi-turn session
            multiTurnSession.destroy();

            if (iteration >= maxIterations && !taskComplete) {
                await addProgressMessage(iteration, "Max Iterations Reached", "Stopping execution");
                await addAIMessage({
                    textResponse: "I've reached the maximum number of steps. The task may not be fully complete. Please try a more specific request."
                });
            }

        } catch (error) {
            err('Function call processing error', error);
            await addAIMessage({
                textResponse: "I'm sorry, I couldn't process your request right now. Please try again."
            });
        } finally {
            setIsProcessing(false);
        }
    }, [promptSession, loadContextForCurrentTab, addAIMessage, addProgressMessage]);

    return { isProcessing, processUserInput };
}



