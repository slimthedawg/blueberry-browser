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
    
    // Convert tabId to string if it's a number (common mistake from LLM)
    let tabIdString: string | undefined = undefined;
    if (tabId !== undefined && tabId !== null) {
      tabIdString = String(tabId);
    }
    
    // Use tabId from params, context, or active tab
    let targetTabId = tabIdString || context.activeTabId;
    let tab = targetTabId
      ? context.window.getTab(targetTabId)
      : context.window.activeTab;

    // If tab not found, try active tab
    if (!tab && context.window.activeTab) {
      tab = context.window.activeTab;
      targetTabId = context.window.activeTab.id;
    }

    // If still no tab, try to get any available tab
    if (!tab && context.window.allTabs && context.window.allTabs.length > 0) {
      tab = context.window.allTabs[0];
      targetTabId = tab.id;
    }

    if (!tab) {
      return {
        success: false,
        error: "No active tab available. Please create a tab first or navigate to a page.",
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

