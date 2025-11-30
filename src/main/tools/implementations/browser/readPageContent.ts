import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const readPageContent: ToolDefinition = {
  name: "read_page_content",
  description: "Read the text content or HTML of the current page. Use this FIRST before interacting with forms, buttons, or filters to understand what elements are available and their selectors.",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "contentType",
      type: "string",
      description: "Type of content to read: 'text' or 'html'",
      required: false,
      enum: ["text", "html"],
    },
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to read from (defaults to active tab)",
      required: false,
    },
    {
      name: "maxLength",
      type: "number",
      description: "Maximum length of content to return (defaults to 10000 characters)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { contentType = "text", tabId, maxLength = 10000 } = params;
    
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

    // Check if tab has a valid URL
    const url = tab.webContents.getURL();
    if (!url || url === "about:blank" || url.startsWith("chrome://") || url.startsWith("edge://")) {
      return {
        success: false,
        error: "No valid page loaded in the current tab. Please navigate to a web page first.",
      };
    }

    try {
      // Wait for page to be fully loaded with multiple checks
      try {
        await tab.webContents.executeJavaScript(`
          (async () => {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
              await new Promise(resolve => {
                if (document.readyState !== 'loading') {
                  resolve();
                } else {
                  document.addEventListener('DOMContentLoaded', resolve, { once: true });
                  setTimeout(resolve, 2000);
                }
              });
            }
            
            // Wait for page to be fully loaded
            if (document.readyState !== 'complete') {
              await new Promise(resolve => {
                if (document.readyState === 'complete') {
                  resolve();
                } else {
                  window.addEventListener('load', resolve, { once: true });
                  setTimeout(resolve, 5000);
                }
              });
            }
            
            // Additional wait for dynamic content (React, Vue, etc.)
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check if there's actual content
            const hasContent = document.body && (
              document.body.textContent.trim().length > 0 || 
              document.body.innerHTML.trim().length > 100
            );
            
            if (!hasContent) {
              // Wait a bit more for content to load
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            return {
              readyState: document.readyState,
              hasContent: document.body && document.body.textContent.trim().length > 0,
              bodyLength: document.body ? document.body.textContent.length : 0
            };
          })();
        `);
        
        // Additional wait in Node.js to ensure page is stable
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        // If page isn't ready, wait a bit more and try anyway
        console.warn("Page load check had issues, waiting a bit more:", error);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      if (contentType === "html") {
        const html = await tab.getTabHtml().catch((err) => {
          throw new Error(`Failed to get HTML: ${err.message}`);
        });
        
        if (!html || html.trim().length === 0) {
          return {
            success: false,
            error: "Page content is empty. The page may still be loading or may not have any content.",
          };
        }
        
        const truncated = html.length > maxLength ? html.substring(0, maxLength) + "..." : html;
        return {
          success: true,
          result: {
            content: truncated,
            length: html.length,
            truncated: html.length > maxLength,
          },
          message: `Retrieved HTML content (${html.length} characters)`,
        };
      } else {
        // For text content, try multiple methods with fallbacks
        let text: string | null = null;
        
        // Try method 1: getTabText
        try {
          text = await tab.getTabText();
        } catch (err) {
          console.warn("getTabText failed, trying alternative method:", err);
          
          // Try method 2: executeJavaScript to get text content
          try {
            text = await tab.webContents.executeJavaScript(`
              (() => {
                // Try to get text from body
                if (document.body) {
                  return document.body.innerText || document.body.textContent || '';
                }
                // Fallback to document text
                return document.documentElement.innerText || document.documentElement.textContent || '';
              })();
            `);
          } catch (err2) {
            console.warn("JavaScript text extraction also failed:", err2);
            // Try method 3: get HTML and extract text
            try {
              const html = await tab.getTabHtml();
              // Simple text extraction from HTML (remove tags)
              text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            } catch (err3) {
              console.warn("HTML extraction also failed:", err3);
              throw new Error(`Failed to get text: All methods failed. Last error: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
        
        if (!text || text.trim().length === 0) {
          return {
            success: false,
            error: "Page text content is empty. The page may still be loading or may not have any readable text.",
          };
        }
        
        // Also extract form field information for better context
        try {
          const formInfo = await tab.webContents.executeJavaScript(`
            (() => {
              const forms = Array.from(document.querySelectorAll('form'));
              const inputs = Array.from(document.querySelectorAll('input, select, textarea, button'));
              const formFields = inputs.map(el => ({
                tag: el.tagName,
                type: el.type || el.tagName.toLowerCase(),
                id: el.id || null,
                name: el.name || null,
                className: el.className || null,
                placeholder: el.placeholder || null,
                label: el.labels?.[0]?.textContent || el.closest('label')?.textContent || null,
                text: el.textContent?.trim() || null,
                selector: el.id ? '#' + el.id : el.className ? '.' + el.className.split(' ')[0] : null
              })).filter(el => el.tag !== 'SCRIPT' && el.tag !== 'STYLE');
              
              return {
                formCount: forms.length,
                fieldCount: formFields.length,
                fields: formFields.slice(0, 50) // Limit to first 50 fields
              };
            })();
          `).catch(() => null);
          
          if (formInfo && formInfo.fields && formInfo.fields.length > 0) {
            const fieldsInfo = `\n\n=== FORM FIELDS DETECTED ===\n${formInfo.fields.map((f: any) => 
              `- ${f.tag} ${f.type}: ${f.label || f.placeholder || f.text || 'unnamed'}\n  Selectors: ${f.id ? '#' + f.id : ''} ${f.name ? '[name="' + f.name + '"]' : ''} ${f.selector || ''}`
            ).join('\n')}\n==========================\n`;
            text = text + fieldsInfo;
          }
        } catch (error) {
          // Ignore errors extracting form info
        }
        
        const truncated = text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
        return {
          success: true,
          result: {
            content: truncated,
            length: text.length,
            truncated: text.length > maxLength,
          },
          message: `Retrieved text content (${text.length} characters)`,
        };
      }
    } catch (error) {
      console.error("Error reading page content:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Provide more helpful error messages
      if (errorMessage.includes("Script failed to execute")) {
        return {
          success: false,
          error: "Unable to read page content. The page may not be fully loaded, may be blocked, or may not have any readable content. Try navigating to a different page or waiting a moment.",
        };
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

