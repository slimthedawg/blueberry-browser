import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const switchTab: ToolDefinition = {
  name: "switch_tab",
  description: "Switch to a different browser tab",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to switch to",
      required: true,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { tabId } = params;

    if (!tabId) {
      return {
        success: false,
        error: "tabId is required",
      };
    }

    try {
      const success = context.window.switchActiveTab(tabId);
      if (!success) {
        return {
          success: false,
          error: `Tab ${tabId} not found`,
        };
      }

      const tab = context.window.getTab(tabId);
      return {
        success: true,
        result: {
          tabId: tab?.id,
          url: tab?.url,
          title: tab?.title,
        },
        message: `Switched to tab: ${tab?.title || tabId}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};


