import { log } from "~lib/log";
import { functionHandlers, functionRegistry } from "./registry";
import type { TocItem } from "~hooks/usePromptAPI";

interface ParsedFunction {
    functionName: string;
    parameters: Record<string, any>;
    confidence: number;
}

export async function parseCommand(session: LanguageModelSession, userInput: string, tocContext?: TocItem[]): Promise<ParsedFunction | null> {
    try {
        const schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "title": "Generated schema for Root",
            "type": "object",
            "properties": {
                "functionName": {},
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                },
                "confidence": {
                    "type": "number"
                }
            },
            "required": [
                "functionName",
                "parameters",
                "confidence"
            ]
        }
        const newSession = await session.clone()

        // Build the system prompt with TOC context if available
        let tocContextText = '';
        if (tocContext && tocContext.length > 0) {
            tocContextText = `

TABLE OF CONTENTS CONTEXT:
${tocContext.map(item => `- "${item.title}" (selector: ${item.cssSelector})`).join('\n')}

When navigating, use the exact CSS selectors provided above.`;
        }

        await newSession.append([{
            role: 'system', content: `You are a function parser that matches user commands to available functions.
      Available functions:
      ${functionRegistry.map(func => `
        ${func.name}: ${func.description}
        Parameters: ${func.parameters.map(p => `${p.name} (${p.type}${p.required ? ', required' : ''})`).join(', ')}
        Examples: ${func.examples.join(', ')}
      `).join('\n')}

      Your job is to:
      1. Identify which function best matches the user's intent
      2. Extract any required parameters
      3. Return ONLY a JSON object in this format:
      {
        "functionName": "nameOfFunction",
        "parameters": {
          "paramName": "value"
        },
        "confidence": 0.8  // How confident you are in this match (0-1)
      }

      If no function matches well, return:
      { "functionName": null, "parameters": {}, "confidence": 0 }

      For navigation, the location should be a valid css selector. e.g., '#campus', '.div:nth-of-type(2) > div', etc.${tocContextText}

      DO NOT ADD ANY COMMENTS` }
        ]);

        // Send the user input to the model

        const prompt = `Parse this command: "${userInput}"`;
        const response = await newSession.prompt(prompt);

        // The response may be wrapped in ```json ... ``` or other markdown.
        log("the response received is: ", { response })
        let cleanedJson = response.trim();

        // Remove markdown code block markers (especially ```json and ```)
        if (cleanedJson.startsWith('```')) {
            // Remove the opening line (``` or ```json)
            cleanedJson = cleanedJson.replace(/^```[a-zA-Z]*\s*/, "");
            // Remove trailing ```
            const lastCodeBlock = cleanedJson.lastIndexOf('```');
            if (lastCodeBlock !== -1) {
                cleanedJson = cleanedJson.slice(0, lastCodeBlock);
            }
            cleanedJson = cleanedJson.trim();
        }
        log("the cleaned response is: ", { cleanedJson })

        newSession.destroy();

        // Parse the JSON response
        try {
            const parsed = JSON.parse(cleanedJson) as ParsedFunction;

            // Validate the parsed response
            if (parsed.functionName && !functionRegistry.find(f => f.name === parsed.functionName)) {
                throw new Error(`Invalid function name: ${parsed.functionName}`);
            }

            return parsed;
        } catch (e) {
            console.error('Error parsing model response:', e);
            return null;
        }

    } catch (error) {
        console.error('Error in command parsing:', error);
        return null;
    }
}


export async function executeCommand(parsed: ParsedFunction): Promise<string> {
    try {
        const funcDef = functionRegistry.find(f => f.name === parsed.functionName);
        if (!funcDef) {
            throw new Error(`Function ${parsed.functionName} not found`);
        }

        // Get the handler from our map instead of window scope
        const handler = functionHandlers[funcDef.name];
        if (!handler) {
            throw new Error(`Handler for ${funcDef.name} not found`);
        }

        // Execute the function with parsed parameters
        const result = await handler(...Object.values(parsed.parameters));

        if (result === true) {
            if (funcDef.name === "handleNavigation") {
                return "Navigated to the location!";
            }
            return "done!";
        }

        return result

    } catch (error) {
        console.error('Error executing command:', error);
        throw error;
    }
}