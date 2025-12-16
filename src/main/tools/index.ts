import { ToolRegistry } from "./ToolRegistry";
import type { ToolDefinition } from "./ToolDefinition";

// Import all tool implementations
import { clickElement } from "./implementations/browser/clickElement";
import { navigateToUrl } from "./implementations/browser/navigateToUrl";
import { fillForm } from "./implementations/browser/fillForm";
import { submitForm } from "./implementations/browser/submitForm";
import { readPageContent } from "./implementations/browser/readPageContent";
import { analyzePageStructure } from "./implementations/browser/analyzePageStructure";
import { createTab } from "./implementations/browser/createTab";
import { switchTab } from "./implementations/browser/switchTab";
import { closeTab } from "./implementations/browser/closeTab";
import { selectSuggestion } from "./implementations/browser/selectSuggestion";
import { captureScreenshot } from "./implementations/browser/captureScreenshot";
import { readFile } from "./implementations/filesystem/readFile";
import { writeFile } from "./implementations/filesystem/writeFile";
import { listDirectory } from "./implementations/filesystem/listDirectory";
import { googleSearch } from "./implementations/search/googleSearch";
import { executePython } from "./implementations/code/executePython";
import { executeRecording } from "./implementations/browser/executeRecording";
import { listRecordings } from "./implementations/browser/listRecordings";

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Register all tools
  const tools: ToolDefinition[] = [
    // Browser tools
    clickElement,
    navigateToUrl,
    fillForm,
    submitForm,
    readPageContent,
    analyzePageStructure,
    createTab,
    switchTab,
    closeTab,
    selectSuggestion,
    captureScreenshot,
    executeRecording,
    listRecordings,
    // Filesystem tools
    readFile,
    writeFile,
    listDirectory,
    // Search tools
    googleSearch,
    // Code tools
    executePython,
  ];

  registry.registerMany(tools);

  return registry;
}

export * from "./ToolDefinition";
export * from "./ToolRegistry";

