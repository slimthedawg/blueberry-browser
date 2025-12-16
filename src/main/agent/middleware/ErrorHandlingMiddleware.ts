// Middleware type - not currently used, but kept for future use
// import type { Middleware } from "@langchain/core";

/**
 * Middleware for handling tool errors gracefully
 */
export function createErrorHandlingMiddleware(): Middleware {
  return {
    wrapToolCall: async (toolCall, toolExecutor) => {
      try {
        const result = await toolExecutor(toolCall);
        return result;
      } catch (error) {
        // Return error as string (LangChain requirement)
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Tool execution failed: ${errorMessage}`;
      }
    },
  };
}

