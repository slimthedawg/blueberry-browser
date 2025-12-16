// Middleware type - not currently used, but kept for future use
// import type { Middleware } from "@langchain/core";

/**
 * Middleware for enhanced planning capabilities:
 * - Reflection: Analyze step results and adjust strategy
 * - Self-critique: Validate plans before execution
 * - Chain-of-thought: Explicit reasoning instructions
 * - Subgoal decomposition: Break goals into subgoals
 */
export function createPlanningMiddleware(): Middleware {
  return {
    beforeModel: async (input) => {
      // Add self-critique instructions to system prompt
      const systemMessages = input.messages.filter((m: any) => m.role === "system");
      if (systemMessages.length > 0) {
        const systemMessage = systemMessages[0];
        if (typeof systemMessage.content === "string") {
          const planningInstructions = `

## Planning Guidelines:

1. **Chain-of-Thought Reasoning**: Think step-by-step. For each tool call, explain:
   - Why this tool is needed
   - What information it will provide
   - How it contributes to the overall goal

2. **Subgoal Decomposition**: Break complex tasks into smaller subgoals:
   - Identify the main goal
   - List subgoals needed to achieve it
   - Execute subgoals in logical order

3. **Self-Critique**: Before executing a plan:
   - Verify all required parameters are available
   - Check if the approach is efficient
   - Consider alternative approaches if needed

4. **Reflection**: After each tool execution:
   - Analyze the result
   - Determine if the approach is working
   - Adjust strategy if needed
`;
          systemMessage.content += planningInstructions;
        }
      }
      
      return input;
    },
    afterModel: async (input, output) => {
      // Reflect on model's decisions
      // This can be used to track reflections in state
      return output;
    },
  };
}

