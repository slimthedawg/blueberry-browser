import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";
import { showCursorOverlay, animateType, hideCursorOverlay } from "./cursorOverlay";

export const fillForm: ToolDefinition = {
  name: "fill_form",
  description: "Fill form fields on the current page",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "fields",
      type: "object",
      description: "Object mapping field selectors to values (e.g., {'#email': 'user@example.com', '#password': 'pass123'})",
      required: true,
    },
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to interact with (defaults to active tab)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { fields, tabId } = params;
    
    // Convert tabId to string if it's a number (common mistake from LLM)
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

    if (!fields || typeof fields !== "object") {
      return {
        success: false,
        error: "Fields must be an object mapping selectors to values",
      };
    }

    try {
      // Get position of first field for cursor overlay
      const firstFieldSelector = Object.keys(fields)[0];
      const firstFieldValue = Object.values(fields)[0];
      
      const fieldPosition = await tab.runJs(`
        (() => {
          const selector = ${JSON.stringify(firstFieldSelector)};
          let element = document.querySelector(selector);
          if (!element && selector.includes(',')) {
            const parts = selector.split(',').map(s => s.trim());
            for (const part of parts) {
              element = document.querySelector(part);
              if (element) break;
            }
          }
          if (!element && !selector.startsWith('#')) {
            const idMatch = selector.match(/id[=:]\s*["']?([^"'\s]+)/i);
            if (idMatch) {
              element = document.querySelector('#' + idMatch[1]);
            }
          }
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
          const scrollY = window.pageYOffset || document.documentElement.scrollTop;
          return {
            x: rect.left + rect.width / 2 + scrollX,
            y: rect.top + rect.height / 2 + scrollY
          };
        })();
      `);

      // Show cursor and animate typing if field found
      if (fieldPosition) {
        await showCursorOverlay(tab.webContents, fieldPosition.x, fieldPosition.y, 'type');
        await new Promise(resolve => setTimeout(resolve, 300));
        await animateType(tab.webContents, fieldPosition.x, fieldPosition.y, String(firstFieldValue));
      }

      const result = await tab.runJs(`
        (async () => {
          const fields = ${JSON.stringify(fields)};
          const results = {};
          let successCount = 0;
          let errorCount = 0;
          const errors = [];

          for (const [selector, value] of Object.entries(fields)) {
            try {
              let element = document.querySelector(selector);
              
              // If not found, try alternative methods
              if (!element) {
                // If selector has commas, try each part separately
                if (selector.includes(',')) {
                  const parts = selector.split(',').map(s => s.trim());
                  for (const part of parts) {
                    element = document.querySelector(part);
                    if (element) break;
                  }
                }
                
                // If still not found and it's not an ID selector, try to find by ID if selector contains an ID hint
                if (!element && !selector.startsWith('#')) {
                  // Try to extract potential ID from selector
                  const idMatch = selector.match(/id[=:]\s*["']?([^"'\s]+)/i);
                  if (idMatch) {
                    element = document.querySelector('#' + idMatch[1]);
                  }
                }
              }
              
              if (!element) {
                errors.push(\`Field not found: \${selector}\`);
                errorCount++;
                continue;
              }

              // Handle different input types
              if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
                const input = element;
                const inputType = input.type?.toLowerCase();
                const isSearchField = inputType === 'search' || 
                                     inputType === 'text' || 
                                     input.getAttribute('role') === 'combobox' ||
                                     input.classList.toString().toLowerCase().includes('search') ||
                                     input.classList.toString().toLowerCase().includes('autocomplete');
                
                // Hover and focus the element first to reveal any hidden content
                input.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
                input.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
                input.focus();
                await new Promise(resolve => setTimeout(resolve, 200)); // Wait for hover effects
                
                if (input.tagName === 'SELECT') {
                  // For select elements, find and select the option
                  const select = input;
                  const valueStr = String(value);
                  let optionFound = false;
                  
                  // Try to find option by value first, then by text
                  for (let i = 0; i < select.options.length; i++) {
                    const option = select.options[i];
                    if (option.value === valueStr || option.text === valueStr || option.text.includes(valueStr)) {
                      select.selectedIndex = i;
                      optionFound = true;
                      break;
                    }
                  }
                  
                  if (!optionFound) {
                    errors.push(\`Option "\${valueStr}" not found in select \${selector}\`);
                    errorCount++;
                    continue;
                  }
                        } else {
                          // Clear existing value for input/textarea
                          input.value = '';
                          
                          // Set new value based on type
                          if (inputType === 'checkbox' || inputType === 'radio') {
                            input.checked = Boolean(value);
                          } else {
                            // For text inputs, especially search/autocomplete fields
                            const valueStr = String(value);
                            
                            if (isSearchField) {
                              // For search fields, type character by character to trigger autocomplete
                              input.value = '';
                              input.focus();
                              
                              // Type character by character to trigger autocomplete/suggestions
                              for (let i = 0; i < valueStr.length; i++) {
                                input.value = valueStr.substring(0, i + 1);
                                input.dispatchEvent(new KeyboardEvent('keydown', { key: valueStr[i], bubbles: true }));
                                input.dispatchEvent(new KeyboardEvent('keypress', { key: valueStr[i], bubbles: true }));
                                input.dispatchEvent(new Event('input', { bubbles: true }));
                                input.dispatchEvent(new KeyboardEvent('keyup', { key: valueStr[i], bubbles: true }));
                              }
                              
                              // Final input event
                              input.dispatchEvent(new Event('input', { bubbles: true }));
                              
                              // Wait for autocomplete to appear
                              await new Promise(resolve => setTimeout(resolve, 800));
                              
                              // Check for autocomplete/suggestion dropdowns
                              const autocompleteSelectors = [
                                '[role="listbox"]',
                                '.autocomplete',
                                '.suggestions',
                                '.dropdown-menu',
                                '[class*="autocomplete"]',
                                '[class*="suggestion"]',
                                '[class*="dropdown"]',
                                'ul[role="listbox"]',
                                'div[role="listbox"]'
                              ];
                              
                              let suggestionsFound = false;
                              let suggestions = [];
                              
                              for (const selector of autocompleteSelectors) {
                                const dropdown = document.querySelector(selector);
                                if (dropdown && dropdown.offsetParent !== null) {
                                  // Dropdown is visible
                                  const options = dropdown.querySelectorAll('[role="option"], li, .option, [class*="option"], a');
                                  if (options.length > 0) {
                                    suggestionsFound = true;
                                    suggestions = Array.from(options).slice(0, 10).map((opt, idx) => ({
                                      index: idx,
                                      text: (opt.textContent || opt.innerText || '').trim(),
                                    }));
                                    break;
                                  }
                                }
                              }
                              
                              if (suggestionsFound && suggestions.length > 0) {
                                // Return suggestions info - the AI should use select_suggestion tool next
                                results[selector] = { 
                                  success: true, 
                                  value: value,
                                  suggestions: suggestions.map(s => s.text),
                                  hasSuggestions: true,
                                  message: 'Field filled. Suggestions available: ' + suggestions.map(s => s.text).join(', ')
                                };
                              } else {
                                // No suggestions, just set the value normally
                                input.value = valueStr;
                                input.dispatchEvent(new Event('change', { bubbles: true }));
                                input.dispatchEvent(new Event('blur', { bubbles: true }));
                                results[selector] = { success: true, value: value };
                              }
                            } else {
                              // Regular text input, just set the value
                              input.value = valueStr;
                              input.dispatchEvent(new Event('input', { bubbles: true }));
                              input.dispatchEvent(new Event('change', { bubbles: true }));
                              input.dispatchEvent(new Event('blur', { bubbles: true }));
                              results[selector] = { success: true, value: value };
                            }
                          }
                        }
                        
                        // Trigger change and blur events for better compatibility
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.dispatchEvent(new Event('blur', { bubbles: true }));
                        
                        // Only set results if not already set (e.g., by search field logic)
                        if (!results[selector]) {
                          results[selector] = { success: true, value: value };
                        }
                        successCount++;
              } else {
                errors.push(\`Element \${selector} is not an input, textarea, or select\`);
                errorCount++;
              }
            } catch (error) {
              errors.push(\`Error filling \${selector}: \${error.message}\`);
              errorCount++;
            }
          }

          return {
            success: errorCount === 0,
            result: {
              filled: successCount,
              errors: errorCount,
              details: results,
            },
            message: \`Filled \${successCount} field(s)\${errorCount > 0 ? \`, \${errorCount} error(s)\` : ''}\`,
            error: errors.length > 0 ? errors.join('; ') : undefined,
          };
        })();
      `);

      // Hide cursor after filling
      if (fieldPosition) {
        await new Promise(resolve => setTimeout(resolve, 500));
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

