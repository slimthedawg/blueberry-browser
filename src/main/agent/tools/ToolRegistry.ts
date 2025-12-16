import type { StructuredToolInterface } from "@langchain/core/tools";
import {
  clickElementTool,
  navigateToUrlTool,
  fillFormTool,
  submitFormTool,
  readPageContentTool,
  analyzePageStructureTool,
  createTabTool,
  switchTabTool,
  closeTabTool,
  selectSuggestionTool,
  captureScreenshotTool,
  executeRecordingTool,
  listRecordingsTool,
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  googleSearchTool,
  executePythonTool,
  getCurrentWorkspaceTool,
  createWidgetTool,
  deleteWidgetTool,
  updateWidgetTool,
  setLayoutModeTool,
} from "./LangChainToolAdapter";
import type { Window } from "../../Window";
import { toolContextStore } from "./ToolContext";

/**
 * Get all LangChain tools for the agent
 * Sets the context in the global store so tools can access it
 */
export function getAllLangChainTools(window: Window, activeTabId?: string): StructuredToolInterface[] {
  // Set context in global store
  toolContextStore.setContext(window, activeTabId);

  // Return tools (they will access context via toolContextStore)
  return [
    clickElementTool,
    navigateToUrlTool,
    fillFormTool,
    submitFormTool,
    readPageContentTool,
    analyzePageStructureTool,
    createTabTool,
    switchTabTool,
    closeTabTool,
    selectSuggestionTool,
    captureScreenshotTool,
    executeRecordingTool,
    listRecordingsTool,
    readFileTool,
    writeFileTool,
    listDirectoryTool,
    googleSearchTool,
    executePythonTool,
    // Workspace tools
    getCurrentWorkspaceTool,
    createWidgetTool,
    deleteWidgetTool,
    updateWidgetTool,
    setLayoutModeTool,
  ];
}

