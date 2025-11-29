import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const navigateToUrl: ToolDefinition = {
  name: "navigate_to_url",
  description: "Navigate to a URL in the current tab or a new tab",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "url",
      type: "string",
      description: "URL to navigate to",
      required: true,
    },
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to navigate (defaults to active tab, creates new if not found)",
      required: false,
    },
    {
      name: "newTab",
      type: "boolean",
      description: "Whether to open in a new tab",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { url, tabId, newTab = false } = params;

    if (!url || typeof url !== "string") {
      return {
        success: false,
        error: "URL is required and must be a string",
      };
    }

    try {
      let tab = tabId ? context.window.getTab(tabId) : null;

      if (newTab || !tab) {
        // Create new tab
        tab = context.window.createTab(url);
        return {
          success: true,
          result: {
            tabId: tab.id,
            url: tab.url,
          },
          message: `Opened ${url} in new tab`,
        };
      }

      // Navigate existing tab
      await tab.loadURL(url);
      return {
        success: true,
        result: {
          tabId: tab.id,
          url: tab.url,
        },
        message: `Navigated to ${url}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

