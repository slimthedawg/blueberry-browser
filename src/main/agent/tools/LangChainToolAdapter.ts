import { tool } from "@langchain/core/tools";
import * as z from "zod";
import type { ToolExecutionContext } from "../../tools/ToolDefinition";
import { clickElement } from "../../tools/implementations/browser/clickElement";
import { navigateToUrl } from "../../tools/implementations/browser/navigateToUrl";
import { fillForm } from "../../tools/implementations/browser/fillForm";
import { submitForm } from "../../tools/implementations/browser/submitForm";
import { readPageContent } from "../../tools/implementations/browser/readPageContent";
import { analyzePageStructure } from "../../tools/implementations/browser/analyzePageStructure";
import { createTab } from "../../tools/implementations/browser/createTab";
import { switchTab } from "../../tools/implementations/browser/switchTab";
import { closeTab } from "../../tools/implementations/browser/closeTab";
import { selectSuggestion } from "../../tools/implementations/browser/selectSuggestion";
import { captureScreenshot } from "../../tools/implementations/browser/captureScreenshot";
import { executeRecording } from "../../tools/implementations/browser/executeRecording";
import { listRecordings } from "../../tools/implementations/browser/listRecordings";
import { readFile } from "../../tools/implementations/filesystem/readFile";
import { writeFile } from "../../tools/implementations/filesystem/writeFile";
import { listDirectory } from "../../tools/implementations/filesystem/listDirectory";
import { googleSearch } from "../../tools/implementations/search/googleSearch";
import { executePython } from "../../tools/implementations/code/executePython";
import { toolContextStore } from "./ToolContext";
import { getWorkspaceManager, Workspace, Widget } from "../../WorkspaceManager";
import { getWidgetManager } from "../../widgets/WidgetManager";
import { getWebsiteAnalyzer } from "../../widgets/WebsiteAnalyzer";
import { randomUUID } from "crypto";

/**
 * Notify workspace pages to refresh after widget changes
 * Uses the main window from toolContextStore to properly target WebContentsView tabs
 */
async function notifyWorkspaceRefresh(workspaceId: string) {
  try {
    const mainWindow = toolContextStore.getWindow();
    if (!mainWindow) {
      console.warn('[LangChainToolAdapter] Cannot notify workspace refresh - no window in context');
      return;
    }

    const tabs = mainWindow.allTabs;
    console.log(`[LangChainToolAdapter] Notifying ${tabs.length} tabs to refresh workspace ${workspaceId}`);

    for (const tab of tabs) {
      console.log(`[LangChainToolAdapter] Checking tab ${tab.id}: isWorkspacePage=${tab.isWorkspacePage}`);
      // Use isWorkspacePage flag instead of URL check (URL becomes data:text/html after load)
      if (tab.isWorkspacePage) {
        try {
          const result = await tab.webContents.executeJavaScript(`
            (function() {
              console.log('[Workspace] Setting refresh flag from LangChainToolAdapter');
              window.__workspaceNeedsRefresh = true;
              console.log('[Workspace] __workspaceNeedsRefresh is now:', window.__workspaceNeedsRefresh);
              return { success: true, flag: window.__workspaceNeedsRefresh };
            })();
          `);
          console.log(`[LangChainToolAdapter] ✅ Set refresh flag for tab ${tab.id}, result:`, result);
        } catch (error) {
          console.warn(`[LangChainToolAdapter] ❌ Failed to notify tab ${tab.id}:`, error);
        }
      } else {
        console.log(`[LangChainToolAdapter] Skipping tab ${tab.id} (not a workspace page)`);
      }
    }
  } catch (error) {
    console.warn('[LangChainToolAdapter] Failed to notify workspace refresh:', error);
  }
}

// Context type for LangChain tools (kept for compatibility)
export interface LangChainToolContext {
  window: ToolExecutionContext["window"];
  activeTabId?: string;
}

// Helper to create nullable optional field for tabId
// Uses explicit union with null to ensure JSON Schema conversion works correctly
// This explicitly tells JSON Schema that the field can be string OR null
// We validate the format in the tool function itself
function nullableTabId() {
  return z.union([z.string(), z.null()]).optional();
}

// Helper to create nullable optional field - uses nullish which accepts null, undefined, or the value
// Then transforms null to undefined for our tool implementations
function nullableOptional<T extends z.ZodTypeAny>(schema: T) {
  return schema.nullish().transform((val) => val === null ? undefined : val);
}

// Helper to normalize parameters - convert null to undefined for optional fields
function normalizeParams(params: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    // Convert null to undefined for optional fields
    normalized[key] = value === null ? undefined : value;
  }
  return normalized;
}

// Helper to validate tabId format
function validateTabId(tabId: string | undefined, toolName: string): string | null {
  if (!tabId) return null; // undefined/null is OK (uses active tab)
  if (typeof tabId !== "string") {
    return `Error: Invalid tabId type in ${toolName}. Expected string, got ${typeof tabId}.`;
  }
  if (!tabId.startsWith("tab-")) {
    // Try to find the tab by title or URL if it's not a valid tab ID
    const window = toolContextStore.getWindow();
    if (window) {
      // Check if it's a page title or URL - try to find matching tab
      const allTabs = window.allTabs;
      const matchingTab = allTabs.find(t => 
        t.title === tabId || t.url === tabId || t.url.includes(tabId)
      );
      if (matchingTab) {
        console.warn(`[TabID] Agent used "${tabId}" but found matching tab ${matchingTab.id}, using that instead`);
        return null; // Will use the matching tab via getCurrentActiveTabId fallback
      }
    }
    return `Error: Invalid tabId format in ${toolName}. Expected format: "tab-1", "tab-2", etc. Received: "${tabId}". DO NOT use page titles, URLs, or page content. Use null/empty to use the active tab. Available tabs: ${window ? window.allTabs.map(t => t.id).join(", ") : "none"}`;
  }
  return null; // Valid
}

// Helper to get current active tab ID dynamically (context may have changed)
// This always returns the CURRENT active tab, ensuring agent works independently of user tab changes
function getCurrentActiveTabId(): string | undefined {
  const window = toolContextStore.getWindow();
  if (!window) return undefined;
  const activeTab = window.activeTab;
  if (!activeTab) return undefined;
  
  // Always return the actual active tab ID - this ensures agent works independently of user tab changes
  return activeTab.id;
}

// Helper to find tab by ID, title, or URL (for better error messages)
function findTabByIdentifier(identifier: string | undefined): string | undefined {
  if (!identifier) return undefined;
  const window = toolContextStore.getWindow();
  if (!window) return undefined;
  
  // If it's already a valid tab ID, return it
  if (identifier.startsWith("tab-")) {
    const tab = window.tabsMap.get(identifier);
    if (tab) return identifier;
  }
  
  // Try to find by title or URL
  const allTabs = window.allTabs;
  const matchingTab = allTabs.find(t => 
    t.title === identifier || t.url === identifier || t.url.includes(identifier)
  );
  
  return matchingTab?.id;
}

// Helper to safely execute tool with error handling
// This provides a fallback if schema validation fails (though it shouldn't with .nullish())
async function safeToolExecute(
  toolFn: (params: any) => Promise<string>,
  params: any,
  normalizeFn: (params: any) => any
): Promise<string> {
  try {
    return await toolFn(params);
  } catch (error: any) {
    // If it's a parsing error, try normalizing and retrying
    // Note: This may not catch ToolInputParsingException since it happens before our function,
    // but it provides a safety net for other errors
    if (error?.name === 'ToolInputParsingException' || error?.message?.includes('did not match expected schema')) {
      const normalized = normalizeFn(params);
      return await toolFn(normalized);
    }
    throw error;
  }
}

// Helper to convert tool result to string (LangChain requirement)
function toolResultToString(result: any): string {
  if (result.success === false) {
    return `Error: ${result.error || "Unknown error"}`;
  }
  if (result.message) {
    return result.message;
  }
  if (result.result) {
    if (typeof result.result === "string") {
      return result.result;
    }
    return JSON.stringify(result.result, null, 2);
  }
  return "Success";
}

// Workspace helpers
async function resolveWorkspace(workspaceId?: string): Promise<Workspace | null> {
  const manager = getWorkspaceManager();
  if (workspaceId) {
    const ws = await manager.getWorkspace(workspaceId);
    if (ws) return ws;
  }
  return await manager.ensureDefaultWorkspace();
}

function widgetSummary(widget: Widget) {
  return {
    id: widget.id,
    type: widget.type,
    sourceUrl: widget.sourceUrl,
    size: widget.size,
    position: widget.position,
    historyEntries: widget.historyEntries,
    historyIndex: widget.historyIndex,
    zoomFactor: widget.zoomFactor,
  };
}

// Browser tools
export const clickElementTool = tool(
  async (params) => {
    try {
      // Normalize params: convert null to undefined
      let { selector, selectorType, tabId } = normalizeParams(params);
      
      // Validate tabId
      const tabIdError = validateTabId(tabId, "click_element");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      // Always fetch current active tab dynamically (context may have changed)
      const currentActiveTabId = window?.activeTab?.id;
      const activeTabId = toolContextStore.getActiveTabId() || currentActiveTabId;
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await clickElement.execute(
        { selector, selectorType, tabId },
        { window, activeTabId: tabId || activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "click_element",
    description: clickElement.description,
    schema: z.object({
      selector: z.string().describe("CSS selector, XPath, or text content to identify the element"),
      selectorType: nullableOptional(z.enum(["css", "xpath", "text"])).describe("Type of selector: 'css', 'xpath', or 'text'"),
      tabId: nullableTabId().describe("Technical tab ID (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs. Leave empty/null to use the active tab."),
    }),
  }
);

export const navigateToUrlTool = tool(
  async (params) => {
    try {
      let { url, tabId, newTab } = normalizeParams(params);
      
      // Validate tabId
      const tabIdError = validateTabId(tabId, "navigate_to_url");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      // Always fetch current active tab dynamically (context may have changed)
      const currentActiveTabId = window?.activeTab?.id;
      const activeTabId = toolContextStore.getActiveTabId() || currentActiveTabId;
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await navigateToUrl.execute(
        { url, tabId, newTab },
        { window, activeTabId: tabId || activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "navigate_to_url",
    description: navigateToUrl.description,
    schema: z.object({
      url: z.string().describe("URL to navigate to"),
      tabId: nullableTabId().describe("Technical tab ID to navigate in (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs. Leave empty/null to use/create active tab."),
      newTab: nullableOptional(z.boolean()).describe("Whether to open in a new tab"),
    }),
  }
);

export const fillFormTool = tool(
  async (params) => {
    try {
      // Debug: Log what we received
      console.log(`🔍 [FILL_FORM DEBUG] Raw params:`, JSON.stringify(params));
      console.log(`🔍 [FILL_FORM DEBUG] Params keys:`, Object.keys(params));
      
      let { fields, tabId } = normalizeParams(params);
      
      console.log(`🔍 [FILL_FORM DEBUG] After normalize - fields:`, fields ? 'present' : 'MISSING');
      console.log(`🔍 [FILL_FORM DEBUG] After normalize - tabId:`, tabId);
      
      // Check if fields is missing (required parameter)
      if (!fields) {
        return `Error: fill_form requires a 'fields' parameter. This must be an object mapping CSS selectors to values. Example: {"#email": "user@example.com", "#password": "pass123"}. You must first use analyze_page_structure to find the correct selectors for the input fields.`;
      }
      
      // Validate tabId
      const tabIdError = validateTabId(tabId, "fill_form");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      // Always fetch current active tab dynamically (context may have changed)
      const currentActiveTabId = window?.activeTab?.id;
      const activeTabId = toolContextStore.getActiveTabId() || currentActiveTabId;
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await fillForm.execute(
        { fields, tabId },
        { window, activeTabId: tabId || activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "fill_form",
    description: `${fillForm.description}. IMPORTANT: You MUST provide the 'fields' parameter as an object mapping CSS selectors to values. First use analyze_page_structure to discover the correct selectors for input fields, then pass them here. Example: {"fields": {"#search-input": "Stockholm apartments", "#min-rooms": "3"}, "tabId": null}`,
    schema: z.object({
      fields: z.record(z.string(), z.any()).describe("REQUIRED: Object mapping field selectors (CSS selectors from analyze_page_structure) to values to fill. Example: {'#email': 'user@example.com', '#password': 'pass123'}. YOU MUST PROVIDE THIS PARAMETER!"),
      tabId: nullableTabId().describe("Optional: Technical tab ID (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs. Leave empty/null to use the active tab."),
    }),
  }
);

export const submitFormTool = tool(
  async (params) => {
    try {
      let { formSelector, tabId } = normalizeParams(params);
      
      // Validate tabId
      const tabIdError = validateTabId(tabId, "submit_form");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await submitForm.execute(
        { formSelector, tabId },
        { window, activeTabId: tabId || activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "submit_form",
    description: submitForm.description,
    schema: z.object({
      formSelector: nullableOptional(z.string()).describe("CSS selector for the form element (defaults to first form on page)"),
      tabId: nullableTabId().describe("Technical tab ID (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs. Leave empty/null to use the active tab."),
    }),
  }
);

export const readPageContentTool = tool(
  async (params) => {
    try {
      let { contentType, tabId, maxLength } = normalizeParams(params);
      
      // Validate tabId
      const tabIdError = validateTabId(tabId, "read_page_content");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await readPageContent.execute(
        { contentType, tabId, maxLength },
        { window, activeTabId: tabId || activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "read_page_content",
    description: readPageContent.description,
    schema: z.object({
      contentType: nullableOptional(z.enum(["text", "html"])).describe("Type of content to read: 'text' or 'html'"),
      tabId: nullableTabId().describe("Technical tab ID (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs. Leave empty/null to use the active tab."),
      maxLength: nullableOptional(z.number()).describe("Maximum length of content to return (defaults to 10000 characters)"),
    }),
  }
);

export const analyzePageStructureTool = tool(
  async (params) => {
    try {
      let { tabId, elementTypes } = normalizeParams(params);
      
      // Validate tabId
      const tabIdError = validateTabId(tabId, "analyze_page_structure");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await analyzePageStructure.execute(
        { tabId, elementTypes },
        { window, activeTabId: tabId || activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "analyze_page_structure",
    description: analyzePageStructure.description,
    schema: z.object({
      tabId: nullableTabId().describe("Technical tab ID (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs. Leave empty/null to use the active tab."),
      elementTypes: nullableOptional(z.array(z.string())).describe("Types of elements to find: 'input', 'button', 'select', 'link', 'all'"),
    }),
  }
);

export const createTabTool = tool(
  async (params) => {
    try {
      const { url } = normalizeParams(params);
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await createTab.execute(
        { url },
        { window, activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "create_tab",
    description: createTab.description,
    schema: z.object({
      url: nullableOptional(z.string()).describe("URL to open in the new tab (defaults to about:blank)"),
    }),
  }
);

export const switchTabTool = tool(
  async (params) => {
    try {
      let { tabId } = normalizeParams(params);
      
      // Validate tabId (required for switch_tab)
      if (!tabId) {
        return "Error: tabId is required for switch_tab. Use format: 'tab-1', 'tab-2', etc.";
      }
      const tabIdError = validateTabId(tabId, "switch_tab");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await switchTab.execute(
        { tabId },
        { window, activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "switch_tab",
    description: switchTab.description,
    schema: z.object({
      tabId: z.string().describe("Technical tab ID to switch to (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs."),
    }),
  }
);

export const closeTabTool = tool(
  async (params) => {
    try {
      let { tabId } = normalizeParams(params);
      
      // Validate tabId (required for close_tab)
      if (!tabId) {
        return "Error: tabId is required for close_tab. Use format: 'tab-1', 'tab-2', etc.";
      }
      const tabIdError = validateTabId(tabId, "close_tab");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await closeTab.execute(
        { tabId },
        { window, activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "close_tab",
    description: closeTab.description,
    schema: z.object({
      tabId: z.string().describe("Technical tab ID to close (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs."),
    }),
  }
);

export const selectSuggestionTool = tool(
  async (params) => {
    try {
      let { fieldSelector, suggestionText, suggestionIndex, tabId } = normalizeParams(params);
      
      // Validate tabId
      const tabIdError = validateTabId(tabId, "select_suggestion");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await selectSuggestion.execute(
        { fieldSelector, suggestionText, suggestionIndex, tabId },
        { window, activeTabId: tabId || activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "select_suggestion",
    description: selectSuggestion.description,
    schema: z.object({
      fieldSelector: z.string().describe("CSS selector of the input field that triggered the suggestions"),
      suggestionText: nullableOptional(z.string()).describe("The text of the suggestion to select (partial match is OK)"),
      suggestionIndex: nullableOptional(z.number()).describe("Index of the suggestion to select (0-based, if suggestionText is not provided)"),
      tabId: nullableTabId().describe("Technical tab ID (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs. Leave empty/null to use the active tab."),
    }),
  }
);

export const captureScreenshotTool = tool(
  async (params) => {
    try {
      let { name, tabId, fullPage } = normalizeParams(params);
      
      // Validate tabId
      const tabIdError = validateTabId(tabId, "capture_screenshot");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await captureScreenshot.execute(
        { name, tabId, fullPage },
        { window, activeTabId: tabId || activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "capture_screenshot",
    description: captureScreenshot.description,
    schema: z.object({
      name: nullableOptional(z.string()).describe("Name for the screenshot (used for later retrieval). If not provided, uses timestamp."),
      tabId: nullableTabId().describe("Technical tab ID (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs. Leave empty/null to use the active tab."),
      fullPage: nullableOptional(z.boolean()).describe("Capture full page (including scrollable content). Default: false (viewport only)"),
    }),
  }
);

export const executeRecordingTool = tool(
  async (params) => {
    try {
      let { recordingId, startFromAction, maxActions, tabId } = normalizeParams(params);
      
      // Validate tabId
      const tabIdError = validateTabId(tabId, "execute_recording");
      if (tabIdError) return tabIdError;
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await executeRecording.execute(
        { recordingId, startFromAction, maxActions, tabId },
        { window, activeTabId: tabId || activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "execute_recording",
    description: executeRecording.description,
    schema: z.object({
      recordingId: z.string().describe("ID of the recording to execute"),
      startFromAction: nullableOptional(z.number()).describe("Index of action to start from (0-based, defaults to 0)"),
      maxActions: nullableOptional(z.number()).describe("Maximum number of actions to execute in this batch (defaults to 5)"),
      tabId: nullableTabId().describe("Technical tab ID (format: 'tab-1', 'tab-2', etc.). DO NOT use page titles or URLs. Leave empty/null to use the active tab."),
    }),
  }
);

export const listRecordingsTool = tool(
  async () => {
    try {
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await listRecordings.execute(
        {},
        { window, activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "list_recordings",
    description: listRecordings.description,
    schema: z.object({}),
  }
);

// Filesystem tools
export const readFileTool = tool(
  async (params) => {
    try {
      const { filePath, encoding } = normalizeParams(params);
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await readFile.execute(
        { filePath, encoding },
        { window, activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "read_file",
    description: readFile.description,
    schema: z.object({
      filePath: z.string().describe("Path to the file to read (relative to project root or absolute path)"),
      encoding: nullableOptional(z.enum(["utf8", "ascii", "base64"])).describe("File encoding (defaults to 'utf8')"),
    }),
  }
);

export const writeFileTool = tool(
  async (params) => {
    try {
      const { filePath, content, encoding } = normalizeParams(params);
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await writeFile.execute(
        { filePath, content, encoding },
        { window, activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "write_file",
    description: writeFile.description,
    schema: z.object({
      filePath: z.string().describe("Path to the file to write (relative to project root or absolute path)"),
      content: z.string().describe("Content to write to the file"),
      encoding: nullableOptional(z.enum(["utf8", "ascii", "base64"])).describe("File encoding (defaults to 'utf8')"),
    }),
  }
);

export const listDirectoryTool = tool(
  async (params) => {
    try {
      const { directoryPath, includeDetails } = normalizeParams(params);
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await listDirectory.execute(
        { directoryPath, includeDetails },
        { window, activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "list_directory",
    description: listDirectory.description,
    schema: z.object({
      directoryPath: nullableOptional(z.string()).describe("Path to the directory to list (relative to project root or absolute path, defaults to current directory)"),
      includeDetails: nullableOptional(z.boolean()).describe("Whether to include file size and type details"),
    }),
  }
);

// Search tools
export const googleSearchTool = tool(
  async (params) => {
    try {
      const { query, maxResults } = normalizeParams(params);
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await googleSearch.execute(
        { query, maxResults },
        { window, activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "google_search",
    description: googleSearch.description,
    schema: z.object({
      query: z.string().describe("Search query"),
      maxResults: nullableOptional(z.number()).describe("Maximum number of results to return (defaults to 10)"),
    }),
  }
);

// Code tools
export const executePythonTool = tool(
  async (params) => {
    try {
      const { code, timeout } = normalizeParams(params);
      
      const window = toolContextStore.getWindow();
      const activeTabId = getCurrentActiveTabId();
      if (!window) {
        return "Error: Window context not available";
      }
      const result = await executePython.execute(
        { code, timeout },
        { window, activeTabId }
      );
      return toolResultToString(result);
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "execute_python",
    description: executePython.description,
    schema: z.object({
      code: z.string().describe("Python code to execute"),
      timeout: nullableOptional(z.number()).describe("Execution timeout in seconds (defaults to 30)"),
    }),
  }
);

// Workspace tools
export const getCurrentWorkspaceTool = tool(
  async (params) => {
    try {
      const { workspaceId } = normalizeParams(params);
      const workspace = await resolveWorkspace(workspaceId);
      if (!workspace) return "Error: Ingen arbetsyta hittades.";
      return JSON.stringify(
        {
          id: workspace.id,
          name: workspace.name,
          isDefault: workspace.isDefault,
          layout: workspace.layout,
          widgets: workspace.widgets.map(widgetSummary),
        },
        null,
        2
      );
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "get_current_workspace",
    description: "Hämta nuvarande arbetsyta (standard om inget ID anges) inklusive widgets.",
    schema: z.object({
      workspaceId: nullableOptional(z.string()).describe("Arbetsytans ID. Lämna tomt för standard."),
    }),
  }
);

export const createWidgetTool = tool(
  async (params) => {
    try {
      const { type = "website", sourceUrl, width = 500, height = 500, workspaceId } = normalizeParams(params);
      const workspace = await resolveWorkspace(workspaceId);
      if (!workspace) return "Error: Ingen arbetsyta hittades.";

      let analysis: any = null;
      if (type === "website" && sourceUrl) {
        try {
          analysis = await getWebsiteAnalyzer().analyzeWebsite(sourceUrl);
        } catch (err) {
          console.warn("Kunde inte analysera webbplats:", err);
        }
      }

      const widget: Widget = {
        id: randomUUID(),
        type,
        sourceUrl,
        position: { x: 0, y: 0 },
        size: { width, height },
        historyEntries: [sourceUrl],
        historyIndex: 0,
        zoomFactor: 1,
        domSnapshot: analysis?.dom,
        cssSnapshot: analysis?.css,
        apiMappings: analysis?.apiMappings,
      };

      const updated = getWidgetManager().addWidget(workspace, widget);
      await getWorkspaceManager().updateWorkspace(updated);

      // Notify workspace page to refresh
      await notifyWorkspaceRefresh(updated.id);

      return `Widget skapad från ${sourceUrl} i arbetsyta "${updated.name}". Widget ID: ${widget.id}`;
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "create_widget",
    description: "Create a widget from a URL. JUST PROVIDE THE URL - defaults handle the rest: type=website, size=500x500.",
    schema: z.object({
      type: z.enum(["website", "custom"]).optional().describe("Widget type. Default: 'website'. Almost always use website."),
      sourceUrl: z.string().describe("URL to load in the widget. Add https:// if missing."),
      width: nullableOptional(z.number()).describe("Width in px. Default: 500. Don't ask user, just use default."),
      height: nullableOptional(z.number()).describe("Height in px. Default: 500. Don't ask user, just use default."),
      workspaceId: nullableOptional(z.string()).describe("Workspace ID. Leave empty to use default workspace."),
    }),
  }
);

export const deleteWidgetTool = tool(
  async (params) => {
    try {
      const { widgetId, workspaceId } = normalizeParams(params);
      const manager = getWorkspaceManager();

      let workspace = workspaceId ? await manager.getWorkspace(workspaceId) : null;
      if (!workspace) {
        // fallback: find widget in any workspace
        const all = await manager.listWorkspaces();
        workspace = all.find((w) => w.widgets.some((wgt) => wgt.id === widgetId)) || null;
      }
      if (!workspace) return `Error: Ingen arbetsyta med widget ${widgetId} hittades.`;

      const widget = workspace.widgets.find((w) => w.id === widgetId);
      if (!widget) return `Error: Widget ${widgetId} hittades inte i arbetsyta ${workspace.name}.`;

      const updated = getWidgetManager().deleteWidget(workspace, widgetId);
      await manager.updateWorkspace(updated);

      // Notify workspace page to refresh
      await notifyWorkspaceRefresh(updated.id);

      return `Widget ${widgetId} borttagen från arbetsyta "${workspace.name}".`;
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "delete_widget",
    description: "Ta bort en widget från arbetsyta.",
    schema: z.object({
      widgetId: z.string().describe("ID på widgeten som ska tas bort."),
      workspaceId: nullableOptional(z.string()).describe("Arbetsyta. Tomt => försök standard, annars leta i alla."),
    }),
  }
);

export const updateWidgetTool = tool(
  async (params) => {
    try {
      const { widgetId, width, height, x, y, workspaceId } = normalizeParams(params);
      const manager = getWorkspaceManager();
      let workspace = workspaceId ? await manager.getWorkspace(workspaceId) : null;
      if (!workspace) {
        const all = await manager.listWorkspaces();
        workspace = all.find((w) => w.widgets.some((wgt) => wgt.id === widgetId)) || null;
      }
      if (!workspace) return `Error: Ingen arbetsyta med widget ${widgetId} hittades.`;

      const widget = workspace.widgets.find((w) => w.id === widgetId);
      if (!widget) return `Error: Widget ${widgetId} hittades inte i arbetsyta ${workspace.name}.`;

      const updatedWidget: Widget = {
        ...widget,
        size: {
          width: width ?? widget.size.width,
          height: height ?? widget.size.height,
        },
        position: {
          x: x ?? widget.position.x,
          y: y ?? widget.position.y,
        },
      };

      const updatedWorkspace = getWidgetManager().updateWidget(workspace, updatedWidget);
      await manager.updateWorkspace(updatedWorkspace);

      // Notify workspace page to refresh
      await notifyWorkspaceRefresh(updatedWorkspace.id);

      return `Widget ${widgetId} uppdaterad i arbetsyta "${workspace.name}".`;
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "update_widget",
    description: "Uppdatera widget storlek/position i en arbetsyta.",
    schema: z.object({
      widgetId: z.string().describe("ID på widgeten."),
      width: nullableOptional(z.number()).describe("Ny bredd (valfri)."),
      height: nullableOptional(z.number()).describe("Ny höjd (valfri)."),
      x: nullableOptional(z.number()).describe("Ny x-position (valfri)."),
      y: nullableOptional(z.number()).describe("Ny y-position (valfri)."),
      workspaceId: nullableOptional(z.string()).describe("Arbetsyta. Tomt => försök standard, annars leta i alla."),
    }),
  }
);

export const setLayoutModeTool = tool(
  async (params) => {
    try {
      const { mode, workspaceId } = normalizeParams(params);
      const manager = getWorkspaceManager();
      const workspace = await resolveWorkspace(workspaceId);
      if (!workspace) return "Error: Ingen arbetsyta hittades.";
      const updated = { ...workspace, layout: { mode } as Workspace["layout"] };
      await manager.updateWorkspace(updated);
      return `Layout för "${workspace.name}" satt till ${mode}.`;
    } catch (error) {
      return `Tool error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "set_layout_mode",
    description: "Ändra layout-läge (grid/free) för arbetsyta.",
    schema: z.object({
      mode: z.enum(["grid", "free"]).describe("Layout-läge."),
      workspaceId: nullableOptional(z.string()).describe("Arbetsyta. Tomt => standard."),
    }),
  }
);

