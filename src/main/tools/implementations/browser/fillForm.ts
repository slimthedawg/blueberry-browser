import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const fillForm: ToolDefinition = {
  name: "fill_form",
  description: "Fill form fields on the current page",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "fields",
      type: "object",
      description: "Object mapping field selectors to values (e.g., {'#email': 'user@example.com', '#password': 'pass123'})",
      required: true,
    },
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to interact with (defaults to active tab)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { fields, tabId } = params;
    const tab = tabId
      ? context.window.getTab(tabId)
      : context.window.activeTab;

    if (!tab) {
      return {
        success: false,
        error: "No active tab available",
      };
    }

    if (!fields || typeof fields !== "object") {
      return {
        success: false,
        error: "Fields must be an object mapping selectors to values",
      };
    }

    try {
      const result = await tab.runJs(`
        (() => {
          const fields = ${JSON.stringify(fields)};
          const results = {};
          let successCount = 0;
          let errorCount = 0;
          const errors = [];

          for (const [selector, value] of Object.entries(fields)) {
            try {
              const element = document.querySelector(selector);
              if (!element) {
                errors.push(\`Field not found: \${selector}\`);
                errorCount++;
                continue;
              }

              // Handle different input types
              if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                const input = element;
                const inputType = input.type?.toLowerCase();
                
                // Focus the element
                input.focus();
                
                // Clear existing value
                input.value = '';
                
                // Set new value based on type
                if (inputType === 'checkbox' || inputType === 'radio') {
                  input.checked = Boolean(value);
                } else {
                  input.value = String(value);
                }
                
                // Trigger input events
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                results[selector] = { success: true, value: value };
                successCount++;
              } else {
                errors.push(\`Element \${selector} is not an input or textarea\`);
                errorCount++;
              }
            } catch (error) {
              errors.push(\`Error filling \${selector}: \${error.message}\`);
              errorCount++;
            }
          }

          return {
            success: errorCount === 0,
            result: {
              filled: successCount,
              errors: errorCount,
              details: results,
            },
            message: \`Filled \${successCount} field(s)\${errorCount > 0 ? \`, \${errorCount} error(s)\` : ''}\`,
            error: errors.length > 0 ? errors.join('; ') : undefined,
          };
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

