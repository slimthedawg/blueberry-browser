// Middleware type - not currently used, but kept for future use
// import type { Middleware } from "@langchain/core";
import { getLongTermMemory } from "./LongTermMemory";

/**
 * Middleware to inject long-term memory into system prompt
 */
export function createMemoryMiddleware(): Middleware {
  return {
    beforeModel: async (input) => {
      const memory = getLongTermMemory();
      
      // Extract task description from messages
      const userMessages = input.messages.filter((m: any) => m.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1];
      
      if (lastUserMessage?.content) {
        const taskDescription = typeof lastUserMessage.content === "string" 
          ? lastUserMessage.content 
          : JSON.stringify(lastUserMessage.content);
        
        // Get relevant memories
        const relevantMemories = memory.getRelevantMemories(taskDescription, []);
        
        // Build memory context string
        let memoryContext = "";
        
        if (relevantMemories.patterns.length > 0) {
          memoryContext += "\n\n## Previous Successful Patterns:\n";
          relevantMemories.patterns.forEach((pattern, idx) => {
            memoryContext += `${idx + 1}. Task: ${pattern.task}\n`;
            memoryContext += `   Tools used: ${pattern.tools.join(", ")}\n`;
            memoryContext += `   Steps: ${pattern.steps.join(" -> ")}\n`;
          });
        }
        
        if (relevantMemories.failures.length > 0) {
          memoryContext += "\n\n## Previous Failures and Solutions:\n";
          relevantMemories.failures.forEach((failure, idx) => {
            memoryContext += `${idx + 1}. Task: ${failure.task}\n`;
            memoryContext += `   Error: ${failure.error}\n`;
            if (failure.solution) {
              memoryContext += `   Solution: ${failure.solution}\n`;
            }
          });
        }
        
        // Inject into system prompt if it exists
        if (memoryContext) {
          const systemMessages = input.messages.filter((m: any) => m.role === "system");
          if (systemMessages.length > 0) {
            const systemMessage = systemMessages[0];
            if (typeof systemMessage.content === "string") {
              systemMessage.content += memoryContext;
            }
          } else {
            // Add as new system message
            input.messages.unshift({
              role: "system",
              content: memoryContext.trim(),
            });
          }
        }
      }
      
      return input;
    },
    afterModel: async (input, output) => {
      // Store successful patterns after execution
      // This will be called after tool execution completes
      return output;
    },
  };
}

