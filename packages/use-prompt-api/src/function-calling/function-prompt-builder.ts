/**
 * Prompt building utilities for function calling
 */

import { FunctionRegistry } from './function-registry';

export function buildFunctionSystemPrompt(registry: FunctionRegistry): string {
  const functions = registry.toJSON();

  if (functions.length === 0) {
    return '';
  }

  const functionsJson = JSON.stringify(functions, null, 2);

  return `
Here are the functions you have access to:

${functionsJson}

You must follow this response format **strictly**:

Wrap your function call in the special signal tags and return a valid JSON object:
{
  "functionCall": {
    "name": "function_name",
    "arguments": {
      "param1": "value1",
      "param2": "value2"
    }
  },
  "reasoning": "Why you're calling this function"
}

Rules:
- Never mix text and JSON in the same response.
- Only use functions that are listed above.
- Ensure all required parameters are provided.
- Use exact function and parameter names as specified.
- If a function call fails, you will receive an error message and can try again.
`;
}

export function buildFewShotExamples(): string {
  return `Example 1:
User: What time is it?
Assistant: 
{
  "functionCall": {
    "name": "getCurrentTime",
    "arguments": {}
  },
  "reasoning": "User wants to know the current time"
}


Example 2:
User: Calculate 15 * 7
Assistant: 
{
  "functionCall": {
    "name": "calculateMath",
    "arguments": {
      "expression": "15 * 7"
    }
  },
  "reasoning": "User wants to perform a calculation"
}
`;
}

export function parseFunctionCall(response: string): {
  functionCall?: { name: string; arguments: Record<string, unknown> };
  reasoning?: string;
  regularResponse?: string;
  taskComplete?: boolean;
} {
  const cleaned = response.replace(/<\|task_complete\|>/g, '').trim();

  // Look for function call signal blocks
  const functionCallMatch = cleaned.match(/<\|function_call\|>([\s\S]*?)<\|function_call\|>/);

  if (functionCallMatch) {
    try {
      const jsonContent = (functionCallMatch[1] ?? '').trim();
      const parsed = JSON.parse(jsonContent);
      return {
        functionCall: parsed.functionCall,
        reasoning: parsed.reasoning,
        taskComplete: response.includes('<|task_complete|>'),
      };
    } catch {
      // malformed JSON in function call block
    }
  }

  // Fallback: look for JSON-only format (for backward compatibility)
  const jsonMatch = cleaned.match(/^\{[\s\S]*\}$/); // strict JSON-only match
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        functionCall: parsed.functionCall,
        reasoning: parsed.reasoning,
        taskComplete: true,
      };
    } catch {
      // malformed JSON
    }
  }

  // Otherwise treat as plain text
  return {
    regularResponse: cleaned,
    taskComplete: response.includes('<|task_complete|>'),
  };
}

export function formatFunctionResult(
  functionName: string,
  result: unknown,
  success: boolean
): string {
  if (success) {
    return `Function "${functionName}" executed successfully. Result: ${JSON.stringify(result, null, 2)}`;
  }

  return `Function "${functionName}" failed with error: ${result}`;
}

export function createFunctionCallingPrompt(
  userMessage: string,
  registry: FunctionRegistry,
  includeFewShot = false
): string {
  const systemPrompt = buildFunctionSystemPrompt(registry);
  const fewShot = includeFewShot ? `\n\n${buildFewShotExamples()}` : '';

  return `${systemPrompt}${fewShot}

User: ${userMessage}`;
}

