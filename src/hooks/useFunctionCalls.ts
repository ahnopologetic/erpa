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
}

interface UseFunctionCallsReturn {
    isProcessing: boolean;
    processUserInput: (naturalLanguageInput: string) => Promise<void>;
}

export function useFunctionCalls(options: UseFunctionCallsOptions): UseFunctionCallsReturn {
    const { promptSession, loadContextForCurrentTab, addAIMessage } = options;
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

            // First, quickly check if it's a question to be answered directly
            try {
                const answer = await promptSession.prompt([
                    {
                        role: 'assistant',
                        content: [
                            {
                                type: 'text',
                                value: `Decide whether it is a command or a question. 

                            We have this commands/functions available:
                            ${functionRegistry.map(func => `- ${func.name}: ${func.description}`).join('\n')}
                            When a user asks a question, you should answer it. 
                            When a user asks a command (that matches one of the available functions), you MUST respond with EXACTLY the text: <blank>
                            Do not add any extra text, just the exact string: <blank>

                            Example 1: "How many nobel prize affiliates does harvard have?" is a question ==> "There are 160 nobel prize affiliates at harvard".
                            Example 2: "Navigate to the about page" is a command ==> <blank>
                            Example 3: "What is the weather in boston" is a question ==> "The weather in boston is sunny".
                            Example 4: "Go to the about page" is a command ==> <blank>
                            Example 5: "Read out this section" is a command ==> <blank>
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

                log('Determined answer', { answer, trimmed: answer.trim(), isBlank: answer.trim() === '<blank>' });

                // Normalize the answer by trimming whitespace and checking for <blank>
                const normalizedAnswer = answer.trim();
                if (normalizedAnswer !== '<blank>' && normalizedAnswer.length > 0) {
                    await addAIMessage({ textResponse: answer });
                    setIsProcessing(false);
                    return;
                }
            } catch (qaError) {
                // Continue to function parsing if classification failed
                log('Question/command classification failed; continuing to function parsing', qaError);
            }

            // Parse and execute function
            const parsedCommand = await parseCommand(promptSession, naturalLanguageInput, tocContext);
            if (parsedCommand) {
                log('Parsed command (hook)', { parsedCommand });
                if (parsedCommand.confidence > 0.8) {
                    const result = await executeCommand(parsedCommand);
                    log('Executed command (hook)', { result });
                    await addAIMessage({
                        functionCallResponse: {
                            ...parsedCommand,
                            result: result.result
                        },
                        textResponse: ""
                    });
                } else {
                    err('Low confidence for parsed command', { parsedCommand });
                    await addAIMessage({
                        textResponse: "I'm sorry, I couldn't process your request right now. Please try again."
                    });
                }
            }
        } catch (error) {
            err('Function call processing error', error);
            await addAIMessage({
                textResponse: "I'm sorry, I couldn't process your request right now. Please try again."
            });
        } finally {
            setIsProcessing(false);
        }
    }, [promptSession, loadContextForCurrentTab, addAIMessage]);

    return { isProcessing, processUserInput };
}


