import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const readPageContent: ToolDefinition = {
  name: "read_page_content",
  description: "Read the text content or HTML of the current page",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "contentType",
      type: "string",
      description: "Type of content to read: 'text' or 'html'",
      required: false,
      enum: ["text", "html"],
    },
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to read from (defaults to active tab)",
      required: false,
    },
    {
      name: "maxLength",
      type: "number",
      description: "Maximum length of content to return (defaults to 10000 characters)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { contentType = "text", tabId, maxLength = 10000 } = params;
    const tab = tabId
      ? context.window.getTab(tabId)
      : context.window.activeTab;

    if (!tab) {
      return {
        success: false,
        error: "No active tab available",
      };
    }

    // Check if tab has a valid URL
    const url = tab.webContents.getURL();
    if (!url || url === "about:blank" || url.startsWith("chrome://") || url.startsWith("edge://")) {
      return {
        success: false,
        error: "No valid page loaded in the current tab. Please navigate to a web page first.",
      };
    }

    try {
      // Check if page is ready, with timeout
      try {
        await Promise.race([
          tab.webContents.executeJavaScript(`
            (async () => {
              if (document.readyState !== 'complete') {
                await new Promise(resolve => {
                  if (document.readyState === 'complete') {
                    resolve();
                  } else {
                    window.addEventListener('load', resolve, { once: true });
                    setTimeout(resolve, 3000);
                  }
                });
              }
              return document.readyState;
            })();
          `),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Page load timeout')), 5000))
        ]);
      } catch (error) {
        // If page isn't ready, try to read anyway - might still work
        console.warn("Page may not be fully loaded, attempting to read content anyway");
      }

      if (contentType === "html") {
        const html = await tab.getTabHtml().catch((err) => {
          throw new Error(`Failed to get HTML: ${err.message}`);
        });
        
        if (!html || html.trim().length === 0) {
          return {
            success: false,
            error: "Page content is empty. The page may still be loading or may not have any content.",
          };
        }
        
        const truncated = html.length > maxLength ? html.substring(0, maxLength) + "..." : html;
        return {
          success: true,
          result: {
            content: truncated,
            length: html.length,
            truncated: html.length > maxLength,
          },
          message: `Retrieved HTML content (${html.length} characters)`,
        };
      } else {
        const text = await tab.getTabText().catch((err) => {
          throw new Error(`Failed to get text: ${err.message}`);
        });
        
        if (!text || text.trim().length === 0) {
          return {
            success: false,
            error: "Page text content is empty. The page may still be loading or may not have any readable text.",
          };
        }
        
        const truncated = text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
        return {
          success: true,
          result: {
            content: truncated,
            length: text.length,
            truncated: text.length > maxLength,
          },
          message: `Retrieved text content (${text.length} characters)`,
        };
      }
    } catch (error) {
      console.error("Error reading page content:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Provide more helpful error messages
      if (errorMessage.includes("Script failed to execute")) {
        return {
          success: false,
          error: "Unable to read page content. The page may not be fully loaded, may be blocked, or may not have any readable content. Try navigating to a different page or waiting a moment.",
        };
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

