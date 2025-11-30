import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const createTab: ToolDefinition = {
  name: "create_tab",
  description: "Create a new browser tab",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "url",
      type: "string",
      description: "URL to load in the new tab (defaults to new tab page)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { url } = params;

    try {
      const tab = context.window.createTab(url || "https://www.google.com");
      // Switch to the new tab immediately
      context.window.switchActiveTab(tab.id);
      // Wait a moment for the tab to start loading
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        success: true,
        result: {
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
        },
        message: `Created new tab: ${tab.title} and switched to it`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

