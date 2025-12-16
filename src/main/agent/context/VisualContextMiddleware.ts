// Middleware type - not currently used, but kept for future use
// import type { Middleware } from "@langchain/core";
import type { Window } from "../../Window";

export interface VisualContext {
  screenshot?: any;
  domSnapshot?: any;
}

/**
 * Middleware to inject visual context (screenshots, DOM snapshots) into system prompt
 */
export function createVisualContextMiddleware(
  window: Window,
  getVisualContext: () => Promise<VisualContext>
): Middleware {
  return {
    beforeModel: async (input) => {
      // Get current visual context
      const context = await getVisualContext();
      
      let visualContextString = "";
      
      if (context.screenshot) {
        visualContextString += "\n\n## Current Page Screenshot:\n";
        visualContextString += `A screenshot of the current page is available. Use this to understand the visual layout and identify elements.\n`;
      }
      
      if (context.domSnapshot) {
        visualContextString += "\n\n## Current Page DOM Structure:\n";
        if (typeof context.domSnapshot === "string") {
          visualContextString += context.domSnapshot;
        } else if (context.domSnapshot.summary) {
          visualContextString += `Interactive elements: ${context.domSnapshot.summary.inputs || 0} inputs, ${context.domSnapshot.summary.buttons || 0} buttons, ${context.domSnapshot.summary.selects || 0} selects\n`;
          if (context.domSnapshot.elements) {
            visualContextString += `Example selectors: ${context.domSnapshot.elements.slice(0, 5).map((e: any) => e.selector || e.id || e.name).filter(Boolean).join(", ")}\n`;
          }
        }
      }
      
      // Inject into system prompt
      if (visualContextString) {
        const systemMessages = input.messages.filter((m: any) => m.role === "system");
        if (systemMessages.length > 0) {
          const systemMessage = systemMessages[0];
          if (typeof systemMessage.content === "string") {
            systemMessage.content += visualContextString;
          }
        } else {
          input.messages.unshift({
            role: "system",
            content: visualContextString.trim(),
          });
        }
      }
      
      return input;
    },
  };
}

