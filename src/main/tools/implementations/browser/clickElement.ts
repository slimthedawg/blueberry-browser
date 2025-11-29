import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const clickElement: ToolDefinition = {
  name: "click_element",
  description: "Click an element on the current page using CSS selector, XPath, or text content",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "selector",
      type: "string",
      description: "CSS selector, XPath, or text content to identify the element",
      required: true,
    },
    {
      name: "selectorType",
      type: "string",
      description: "Type of selector: 'css', 'xpath', or 'text'",
      required: false,
      enum: ["css", "xpath", "text"],
    },
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to interact with (defaults to active tab)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { selector, selectorType = "css", tabId } = params;
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
      // Wait for page to be ready with timeout
      await Promise.race([
        tab.webContents.executeJavaScript(`
          (async () => {
            if (document.readyState !== 'complete') {
              await new Promise(resolve => {
                if (document.readyState === 'complete') {
                  resolve();
                } else {
                  window.addEventListener('load', resolve, { once: true });
                  setTimeout(resolve, 5000);
                }
              });
            }
          })();
        `),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Page load timeout')), 5000))
      ]).catch(() => {
        // Continue even if page isn't fully loaded
      });

      // Find and click the element
      const result = await tab.runJs(`
        (async () => {
          let element = null;
          const selectorType = ${JSON.stringify(selectorType)};
          const selector = ${JSON.stringify(selector)};

          if (selectorType === 'css' || !selectorType) {
            element = document.querySelector(selector);
          } else if (selectorType === 'xpath') {
            const xpathResult = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            element = xpathResult.singleNodeValue;
          } else if (selectorType === 'text') {
            // Find element by text content
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              null
            );
            let node;
            while (node = walker.nextNode()) {
              if (node.textContent && node.textContent.trim().includes(selector)) {
                element = node.parentElement;
                break;
              }
            }
          }

          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          // Scroll element into view
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Wait a bit for scroll
          await new Promise((resolve) => setTimeout(resolve, 300));
          
          try {
            element.click();
            return { success: true, message: 'Element clicked successfully' };
          } catch (error) {
            return { success: false, error: error.message };
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

