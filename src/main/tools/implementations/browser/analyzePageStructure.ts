import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const analyzePageStructure: ToolDefinition = {
  name: "analyze_page_structure",
  description: "Analyze the page structure to find all interactive elements (inputs, buttons, selects, links) with their semantic context (labels, placeholders, nearby text). Use this to understand what elements are available before filling forms or clicking buttons.",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to analyze (defaults to active tab)",
      required: false,
    },
    {
      name: "elementTypes",
      type: "array",
      description: "Types of elements to find: 'input', 'button', 'select', 'link', 'all' (defaults to 'all')",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { tabId, elementTypes = ["all"] } = params;
    
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
      // Wait for page to be ready
      try {
        await tab.webContents.executeJavaScript(`
          (async () => {
            if (document.readyState === 'loading') {
              await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
                setTimeout(resolve, 2000);
              });
            }
            if (document.readyState !== 'complete') {
              await new Promise(resolve => {
                window.addEventListener('load', resolve, { once: true });
                setTimeout(resolve, 5000);
              });
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
          })();
        `);
      } catch (error) {
        // Continue anyway
      }

      // Analyze page structure
      const analysis = await tab.webContents.executeJavaScript(`
        (() => {
          const includeAll = ${JSON.stringify(elementTypes.includes('all'))};
          const includeInput = includeAll || ${JSON.stringify(elementTypes.includes('input'))};
          const includeButton = includeAll || ${JSON.stringify(elementTypes.includes('button'))};
          const includeSelect = includeAll || ${JSON.stringify(elementTypes.includes('select'))};
          const includeLink = includeAll || ${JSON.stringify(elementTypes.includes('link'))};
          
          const elements = [];
          
          // Find all inputs
          if (includeInput) {
            document.querySelectorAll('input, textarea').forEach(el => {
              const input = el;
              const label = input.labels?.[0] || 
                           input.closest('label') || 
                           document.querySelector(\`label[for="\${input.id}"]\`) ||
                           input.closest('.form-group, .field, .input-group')?.querySelector('label');
              
              const nearbyText = [];
              let parent = input.parentElement;
              for (let i = 0; i < 3 && parent; i++) {
                const text = parent.textContent?.trim();
                if (text && text.length < 100 && !text.includes(input.value || '')) {
                  nearbyText.push(text);
                }
                parent = parent.parentElement;
              }
              
              elements.push({
                type: 'input',
                tag: input.tagName.toLowerCase(),
                inputType: input.type || 'text',
                id: input.id || null,
                name: input.name || null,
                className: input.className || null,
                placeholder: input.placeholder || null,
                value: input.value || null,
                label: label?.textContent?.trim() || null,
                labelText: label?.textContent?.trim() || null,
                ariaLabel: input.getAttribute('aria-label') || null,
                nearbyText: nearbyText.slice(0, 2).join(' | '),
                selector: input.id ? '#' + input.id : 
                         input.name ? \`[name="\${input.name}"]\` :
                         input.className && input.className.trim() ? '.' + input.className.split(' ').filter(c => c.trim()).join('.') : null,
                semantic: [
                  input.id ? \`ID: \${input.id}\` : null,
                  input.placeholder,
                  label?.textContent?.trim(),
                  input.getAttribute('aria-label'),
                  input.name ? \`name: \${input.name}\` : null,
                  nearbyText[0]
                ].filter(Boolean).join(' | ')
              });
            });
          }
          
          // Find all buttons
          if (includeButton) {
            document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a[role="button"]').forEach(el => {
              const button = el;
              const text = button.textContent?.trim() || button.value || button.getAttribute('aria-label');
              
              // Detect "show more" / "expand" / "filter" buttons
              const textLower = (text || '').toLowerCase();
              const isShowMore = textLower.includes('show more') || 
                               textLower.includes('see more') || 
                               textLower.includes('more options') ||
                               textLower.includes('more filters') ||
                               textLower.includes('more settings') ||
                               textLower.includes('expand') ||
                               textLower.includes('visa mer') ||
                               textLower.includes('fler') ||
                               textLower.includes('sökparametrar') ||
                               textLower.includes('search parameters') ||
                               textLower.includes('advanced') ||
                               textLower.includes('filter') ||
                               button.getAttribute('aria-expanded') === 'false' ||
                               button.classList.toString().toLowerCase().includes('expand') ||
                               button.classList.toString().toLowerCase().includes('more');
              
              elements.push({
                type: 'button',
                tag: button.tagName.toLowerCase(),
                id: button.id || null,
                name: button.name || null,
                className: button.className || null,
                text: text,
                ariaLabel: button.getAttribute('aria-label') || null,
                isShowMore: isShowMore,
                selector: button.id ? '#' + button.id :
                         button.name ? \`[name="\${button.name}"]\` :
                         button.className && button.className.trim() ? '.' + button.className.split(' ').filter(c => c.trim()).join('.') : 
                         text ? \`button[aria-label*="\${text.substring(0, 20)}"], button:has-text("\${text.substring(0, 20)}")\` : null,
                semantic: [
                  button.id ? \`ID: \${button.id}\` : null,
                  text,
                  button.getAttribute('aria-label'),
                  button.name ? \`name: \${button.name}\` : null,
                  button.title,
                  isShowMore ? 'SHOW_MORE_BUTTON' : null
                ].filter(Boolean).join(' | ')
              });
            });
          }
          
          // Find all selects
          if (includeSelect) {
            document.querySelectorAll('select').forEach(el => {
              const select = el;
              const label = select.labels?.[0] || 
                           select.closest('label') ||
                           document.querySelector(\`label[for="\${select.id}"]\`);
              
              const options = Array.from(select.options).slice(0, 10).map(opt => ({
                value: opt.value,
                text: opt.text
              }));
              
              elements.push({
                type: 'select',
                id: select.id || null,
                name: select.name || null,
                className: select.className || null,
                label: label?.textContent?.trim() || null,
                ariaLabel: select.getAttribute('aria-label') || null,
                options: options,
                selector: select.id ? '#' + select.id :
                         select.name ? \`[name="\${select.name}"]\` : null,
                semantic: [
                  select.id ? \`ID: \${select.id}\` : null,
                  label?.textContent?.trim(),
                  select.getAttribute('aria-label'),
                  select.name ? \`name: \${select.name}\` : null
                ].filter(Boolean).join(' | ')
              });
            });
          }
          
          // Find clickable links (optional, for navigation)
          if (includeLink) {
            document.querySelectorAll('a[href]').forEach((el, idx) => {
              if (idx > 20) return; // Limit to first 20 links
              const link = el;
              const text = link.textContent?.trim();
              
              if (text && text.length > 0 && text.length < 100) {
                elements.push({
                  type: 'link',
                  text: text,
                  href: link.href,
                  selector: link.id ? '#' + link.id :
                           link.className ? '.' + link.className.split(' ')[0] : null,
                  semantic: text
                });
              }
            });
          }
          
          return {
            url: window.location.href,
            title: document.title,
            elements: elements,
            elementCount: elements.length,
            summary: {
              inputs: elements.filter(e => e.type === 'input').length,
              buttons: elements.filter(e => e.type === 'button').length,
              selects: elements.filter(e => e.type === 'select').length,
              links: elements.filter(e => e.type === 'link').length
            }
          };
        })();
      `);

      return {
        success: true,
        result: analysis,
        message: `Found ${analysis.elementCount} interactive elements: ${analysis.summary.inputs} inputs, ${analysis.summary.buttons} buttons, ${analysis.summary.selects} selects, ${analysis.summary.links} links`,
      };
    } catch (error) {
      console.error("Error analyzing page structure:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes("Script failed to execute")) {
        return {
          success: false,
          error: "Unable to analyze page structure. The page may not be fully loaded or may be blocked. Try waiting a moment or navigating to a different page.",
        };
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

