import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";
import { showCursorOverlay, animateClick, hideCursorOverlay } from "./cursorOverlay";

export const selectSuggestion: ToolDefinition = {
  name: "select_suggestion",
  description: "Select an option from an autocomplete/suggestion dropdown that appeared after typing in a search field",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "fieldSelector",
      type: "string",
      description: "CSS selector of the input field that triggered the suggestions",
      required: true,
    },
    {
      name: "suggestionText",
      type: "string",
      description: "The text of the suggestion to select (partial match is OK)",
      required: false,
    },
    {
      name: "suggestionIndex",
      type: "number",
      description: "Index of the suggestion to select (0-based, if suggestionText is not provided)",
      required: false,
    },
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to interact with (defaults to active tab)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { fieldSelector, suggestionText, suggestionIndex, tabId } = params;
    
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

    if (!fieldSelector) {
      return {
        success: false,
        error: "fieldSelector is required",
      };
    }

    try {
      // First, find the suggestion position for cursor overlay
      const suggestionInfo = await tab.runJs(`
        (() => {
          const fieldSelector = ${JSON.stringify(fieldSelector)};
          const suggestionText = ${JSON.stringify(suggestionText || '')};
          const suggestionIndex = ${suggestionIndex !== undefined ? suggestionIndex : -1};
          
          const autocompleteSelectors = [
            '[role="listbox"]',
            '[role="option"]',
            '.autocomplete',
            '.suggestions',
            '.dropdown-menu',
            '[class*="autocomplete"]',
            '[class*="suggestion"]',
            '[class*="dropdown"]',
            'ul[role="listbox"]',
            'div[role="listbox"]',
            '[data-testid*="suggestion"]',
            '[data-testid*="autocomplete"]'
          ];
          
          for (const selector of autocompleteSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              if (el.offsetParent !== null) {
                const options = el.querySelectorAll('[role="option"], li, .option, [class*="option"], a');
                if (options.length > 0) {
                  const suggestions = Array.from(options).map((opt, idx) => ({
                    index: idx,
                    text: (opt.textContent || opt.innerText || '').trim(),
                    element: opt
                  }));
                  
                  let selected = null;
                  if (suggestionText) {
                    const lowerText = suggestionText.toLowerCase();
                    selected = suggestions.find(s => 
                      s.text.toLowerCase().includes(lowerText) || 
                      lowerText.includes(s.text.toLowerCase())
                    );
                  } else if (suggestionIndex >= 0 && suggestionIndex < suggestions.length) {
                    selected = suggestions[suggestionIndex];
                  } else {
                    selected = suggestions[0];
                  }
                  
                  if (selected) {
                    const rect = selected.element.getBoundingClientRect();
                    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
                    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
                    return {
                      found: true,
                      x: rect.left + rect.width / 2 + scrollX,
                      y: rect.top + rect.height / 2 + scrollY
                    };
                  }
                }
              }
            }
          }
          return { found: false };
        })();
      `);

      // Show cursor if suggestion found
      if (suggestionInfo.found) {
        await showCursorOverlay(tab.webContents, suggestionInfo.x, suggestionInfo.y, 'click');
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      const result = await tab.runJs(`
        (async () => {
          const fieldSelector = ${JSON.stringify(fieldSelector)};
          const suggestionText = ${JSON.stringify(suggestionText || '')};
          const suggestionIndex = ${suggestionIndex !== undefined ? suggestionIndex : -1};
          
          // Find the input field
          const inputField = document.querySelector(fieldSelector);
          if (!inputField) {
            return { success: false, error: 'Input field not found: ' + fieldSelector };
          }
          
          // Wait a bit for suggestions to appear
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Look for autocomplete/suggestion dropdowns
          const autocompleteSelectors = [
            '[role="listbox"]',
            '[role="option"]',
            '.autocomplete',
            '.suggestions',
            '.dropdown-menu',
            '[class*="autocomplete"]',
            '[class*="suggestion"]',
            '[class*="dropdown"]',
            'ul[role="listbox"]',
            'div[role="listbox"]',
            '[data-testid*="suggestion"]',
            '[data-testid*="autocomplete"]'
          ];
          
          let suggestions = [];
          let dropdown = null;
          
          // Try to find visible dropdown
          for (const selector of autocompleteSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              if (el.offsetParent !== null) { // Element is visible
                const options = el.querySelectorAll('[role="option"], li, .option, [class*="option"], a');
                if (options.length > 0) {
                  dropdown = el;
                  suggestions = Array.from(options).map((opt, idx) => ({
                    index: idx,
                    text: (opt.textContent || opt.innerText || '').trim(),
                    element: opt
                  }));
                  break;
                }
              }
            }
            if (suggestions.length > 0) break;
          }
          
          if (suggestions.length === 0) {
            return { 
              success: false, 
              error: 'No suggestions found. The autocomplete dropdown may not be visible or may have already closed.' 
            };
          }
          
          // Find the suggestion to select
          let selectedSuggestion = null;
          
          if (suggestionText) {
            // Find by text (partial match)
            const lowerText = suggestionText.toLowerCase();
            selectedSuggestion = suggestions.find(s => 
              s.text.toLowerCase().includes(lowerText) || 
              lowerText.includes(s.text.toLowerCase())
            );
            
            // If no exact match, find the closest
            if (!selectedSuggestion) {
              selectedSuggestion = suggestions.find(s => 
                s.text.toLowerCase().startsWith(lowerText) ||
                lowerText.startsWith(s.text.toLowerCase())
              );
            }
          } else if (suggestionIndex >= 0 && suggestionIndex < suggestions.length) {
            selectedSuggestion = suggestions[suggestionIndex];
          } else {
            // Default to first suggestion
            selectedSuggestion = suggestions[0];
          }
          
          if (!selectedSuggestion) {
            return { 
              success: false, 
              error: 'Could not find matching suggestion. Available: ' + suggestions.map(s => s.text).join(', ') 
            };
          }
          
          // Click the suggestion
          const element = selectedSuggestion.element;
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const rect = element.getBoundingClientRect();
          const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
          const scrollY = window.pageYOffset || document.documentElement.scrollTop;
          const clickX = rect.left + rect.width / 2 + scrollX;
          const clickY = rect.top + rect.height / 2 + scrollY;
          
          // Try multiple click methods
          if (element.click) {
            element.click();
          }
          
          element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          
          // Also trigger keyboard events
          inputField.focus();
          inputField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          
          return { 
            success: true, 
            message: 'Selected suggestion: ' + selectedSuggestion.text,
            x: clickX,
            y: clickY,
            result: {
              selectedText: selectedSuggestion.text,
              selectedIndex: selectedSuggestion.index,
              totalSuggestions: suggestions.length
            }
          };
        })();
      `);

      // Animate click and hide cursor
      if (result.success && result.x && result.y) {
        await animateClick(tab.webContents, result.x, result.y);
        await new Promise(resolve => setTimeout(resolve, 400));
        await hideCursorOverlay(tab.webContents);
      } else if (suggestionInfo.found) {
        await hideCursorOverlay(tab.webContents);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

