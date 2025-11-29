import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const submitForm: ToolDefinition = {
  name: "submit_form",
  description: "Submit a form on the current page",
  category: "browser",
  requiresConfirmation: true,
  parameters: [
    {
      name: "formSelector",
      type: "string",
      description: "CSS selector for the form element (defaults to first form on page)",
      required: false,
    },
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to interact with (defaults to active tab)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { formSelector, tabId } = params;
    const tab = tabId
      ? context.window.getTab(tabId)
      : context.window.activeTab;

    if (!tab) {
      return {
        success: false,
        error: "No active tab available",
      };
    }

    try {
      const result = await tab.runJs(`
        (async () => {
          const formSelector = ${JSON.stringify(formSelector || "form")};
          const form = document.querySelector(formSelector);
          
          if (!form) {
            return {
              success: false,
              error: \`Form not found with selector: \${formSelector}\`,
            };
          }

          // Scroll form into view
          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Wait a bit for scroll
          await new Promise((resolve) => setTimeout(resolve, 300));
          
          try {
            // Trigger submit event
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            
            // If not prevented, submit the form
            if (form.requestSubmit) {
              form.requestSubmit();
            } else {
              form.submit();
            }
            
            return {
              success: true,
              message: 'Form submitted successfully',
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
            };
          }
        })();
      `);

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

