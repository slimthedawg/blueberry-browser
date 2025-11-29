import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const closeTab: ToolDefinition = {
  name: "close_tab",
  description: "Close a browser tab",
  category: "browser",
  requiresConfirmation: true,
  parameters: [
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to close (defaults to active tab)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { tabId } = params;

    // Default to active tab if not specified
    const targetTabId = tabId || context.window.activeTab?.id;

    if (!targetTabId) {
      return {
        success: false,
        error: "No tab to close",
      };
    }

    // Prevent closing the last tab
    if (context.window.tabCount <= 1) {
      return {
        success: false,
        error: "Cannot close the last remaining tab",
      };
    }

    try {
      const success = context.window.closeTab(targetTabId);
      if (!success) {
        return {
          success: false,
          error: `Tab ${targetTabId} not found`,
        };
      }

      return {
        success: true,
        message: `Closed tab: ${targetTabId}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

