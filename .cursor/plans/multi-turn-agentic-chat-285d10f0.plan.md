<!-- 285d10f0-08b7-4be2-809f-4b3373c4e824 0670da53-ad22-4495-91f1-8703cbd4b4b6 -->
# Multi-turn Agentic Chat Implementation

## Overview

Transform the chat interface to support multi-turn agentic behavior where the AI can autonomously execute multiple steps (navigate, read content, analyze) to complete user tasks, with streaming progress updates.

## Key Implementation Steps

### 1. Add `getContent` Function

**File: `src/lib/functions/handlers.ts`**

- Create new `handleGetContent(selector: string)` function
- Send message to content script to retrieve content using `findReadableNodesUntilNextSection()`
- Content script should:
  - Find the target element by selector
  - Use `findReadableNodesUntilNextSection()` to get readable nodes
  - Collect `outerHTML` from each node
  - Return concatenated HTML content as text
- Return the extracted content to be fed back into the agent's context

**File: `src/content.tsx`**

- Add new message handler for `GET_CONTENT` message type
- Use existing `findReadableNodesUntilNextSection()` logic
- Extract and return concatenated text content from nodes

### 2. Update Function Registry

**File: `src/lib/functions/registry.ts`**

- Add `getContent` function definition with:
  - `selector` parameter (CSS selector of target section)
  - Description: "Retrieve text content from a specific section or element"
  - Examples: "get content from Campus section", "read the introduction"
- Add handler mapping to `functionHandlers`

### 3. Implement Multi-turn Loop in `useFunctionCalls`

**File: `src/hooks/useFunctionCalls.ts`**

- Modify `processUserInput()` to support multi-turn execution:
  - Add iteration counter (max 10 iterations)
  - Wrap function execution in a while loop
  - After each function execution, append result to prompt session context
  - Ask AI: "Based on the result, what's the next action? Or are we done?"
  - Parse AI response for next function call or completion signal
  - Stream progress updates to chat interface after each iteration
  - Break loop when:
    - AI indicates task is complete
    - Max iterations reached (10)
    - No valid next function found

### 4. Add Task Completion Detection

**File: `src/lib/functions/parser.ts`**

- Update `parseCommand()` to recognize task completion
- Add special response format for completion:
  ```json
  {
    "functionName": "task_complete",
    "parameters": { "summary": "..." },
    "confidence": 1.0
  }
  ```

- When `functionName === "task_complete"`, exit the multi-turn loop

### 5. Stream Progress Updates to Chat

**File: `src/hooks/useVoiceMemoChat.ts`**

- Add `addProgressMessage()` function for streaming intermediate steps
- Progress messages should show:
  - Current iteration number
  - Function being executed
  - Brief status update

**File: `src/types/voice-memo.d.ts`**

- Add `ProgressMessage` type to `ChatMessage`:
  ```typescript
  progressUpdate?: {
    iteration: number;
    action: string;
    status: string;
  }
  ```


**File: `src/components/ui/chat-interface.tsx`**

- Add rendering for progress messages
- Show as subtle status indicators between user/AI messages
- Use different styling (e.g., smaller, muted color)

### 6. Update Prompt Engineering

**File: `src/hooks/useFunctionCalls.ts`**

- Update system prompt to guide multi-turn behavior:
  - "You are an autonomous agent that can execute multiple steps"
  - "After each action, decide: continue with next step or mark complete"
  - "Use getContent to retrieve information when needed"
  - "Use navigate to move to different sections"
  - "When task is complete, respond with task_complete"

## Implementation Notes

- **Context management**: After each function execution, append the result to the prompt session so the AI maintains context
- **Error handling**: If a function fails mid-task, show error and allow recovery
- **User visibility**: All intermediate steps should be visible in