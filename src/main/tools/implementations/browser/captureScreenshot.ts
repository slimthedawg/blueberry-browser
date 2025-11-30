/**
 * Capture Screenshot Tool
 * Inspired by mcp-browser-agent's screenshot management
 */
import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";
import { getBrowserStateManager } from "../../../BrowserStateManager";

export const captureScreenshot: ToolDefinition = {
  name: "capture_screenshot",
  description: "Capture a screenshot of the current page and save it with a name for later reference",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "name",
      type: "string",
      description: "Name for the screenshot (used for later retrieval). If not provided, uses timestamp.",
      required: false,
    },
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to capture (defaults to active tab)",
      required: false,
    },
    {
      name: "fullPage",
      type: "boolean",
      description: "Capture full page (including scrollable content). Default: false (viewport only)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { name, tabId, fullPage = false } = params;

    // Convert tabId to string if it's a number
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
      // Wait for page to be ready
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
          })();
        `),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Page load timeout')), 5000))
      ]).catch(() => {
        // Continue even if page isn't fully loaded
      });

      // Capture screenshot
      const image = await tab.webContents.capturePage({
        stayHidden: false,
        stayAwake: false,
      });

      // Generate name if not provided
      const screenshotName = name || `screenshot_${Date.now()}`;
      const url = tab.webContents.getURL();

      // Save screenshot using BrowserStateManager
      const stateManager = getBrowserStateManager();
      const filepath = await stateManager.saveScreenshot(
        targetTabId!,
        screenshotName,
        image.toPNG(),
        url
      );

      // Update page state with screenshot reference
      const currentUrl = tab.webContents.getURL();
      const currentTitle = tab.webContents.getTitle();
      stateManager.updatePageState(targetTabId!, currentUrl, currentTitle, screenshotName);

      return {
        success: true,
        result: {
          name: screenshotName,
          path: filepath,
          url: currentUrl,
          timestamp: Date.now(),
        },
        message: `Screenshot captured and saved as "${screenshotName}"`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

