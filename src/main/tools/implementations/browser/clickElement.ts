import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";
import { showCursorOverlay, animateClick, hideCursorOverlay } from "./cursorOverlay";

export const clickElement: ToolDefinition = {
  name: "click_element",
  description: "Click an element on the current page using CSS selector, XPath, or text content",
  category: "browser",
  requiresConfirmation: false,
  parameters: [
    {
      name: "selector",
      type: "string",
      description: "CSS selector, XPath, or text content to identify the element",
      required: true,
    },
    {
      name: "selectorType",
      type: "string",
      description: "Type of selector: 'css', 'xpath', or 'text'",
      required: false,
      enum: ["css", "xpath", "text"],
    },
    {
      name: "tabId",
      type: "string",
      description: "ID of the tab to interact with (defaults to active tab)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { selector, selectorType = "css", tabId } = params;
    
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

    try {
      // Wait for page to be ready with timeout
      await Promise.race([
        tab.webContents.executeJavaScript(`
          (async () => {
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
          })();
        `),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Page load timeout')), 5000))
      ]).catch(() => {
        // Continue even if page isn't fully loaded
      });

      // First, find the element and get its position for cursor overlay
      // Try multiple strategies to find the element
      const elementInfo = await tab.runJs(`
        (() => {
          let element = null;
          const selectorType = ${JSON.stringify(selectorType)};
          const selector = ${JSON.stringify(selector)};
          const strategies = [];

          // Strategy 1: Direct querySelector
          if (selectorType === 'css' || !selectorType) {
            element = document.querySelector(selector);
            if (element) strategies.push('direct');
            
            // Strategy 2: Try each part if selector has commas
            if (!element && selector.includes(',')) {
              const parts = selector.split(',').map(s => s.trim());
              for (const part of parts) {
                element = document.querySelector(part);
                if (element) {
                  strategies.push('comma-separated');
                  break;
                }
              }
            }
            
            // Strategy 3: Extract ID from selector if it's not already an ID selector
            if (!element && !selector.startsWith('#')) {
              const idMatch = selector.match(/id[=:]\s*["']?([^"'\s]+)/i);
              if (idMatch) {
                element = document.querySelector('#' + idMatch[1]);
                if (element) strategies.push('extracted-id');
              }
            }
            
            // Strategy 4: Try finding by partial ID match
            if (!element) {
              const idParts = selector.replace(/[#\[\]()]/g, '').split(/[.\s]/).filter(p => p.length > 2);
              for (const part of idParts) {
                element = document.querySelector('#' + part) || document.querySelector('[id*="' + part + '"]');
                if (element) {
                  strategies.push('partial-id-match');
                  break;
                }
              }
            }
            
            // Strategy 5: Try finding by name attribute
            if (!element && selector.includes('name=')) {
              const nameMatch = selector.match(/name=["']([^"']+)["']/i);
              if (nameMatch) {
                element = document.querySelector('[name="' + nameMatch[1] + '"]');
                if (element) strategies.push('name-attribute');
              }
            }
            
            // Strategy 6: Try finding by class (if selector looks like a class)
            if (!element && selector.startsWith('.')) {
              const classParts = selector.substring(1).split('.');
              if (classParts.length > 0) {
                element = document.querySelector('.' + classParts[0]);
                if (element) strategies.push('class-selector');
              }
            }
          } else if (selectorType === 'xpath') {
            const xpathResult = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            element = xpathResult.singleNodeValue;
            if (element) strategies.push('xpath');
          } else if (selectorType === 'text') {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
            let node;
            while (node = walker.nextNode()) {
              if (node.textContent && node.textContent.trim().includes(selector)) {
                element = node.parentElement;
                if (element) strategies.push('text-content');
                break;
              }
            }
          }

          if (!element) {
            // Last resort: try to find any element with similar text or attributes
            const allButtons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
            const allInputs = Array.from(document.querySelectorAll('input, textarea, select'));
            const allElements = [...allButtons, ...allInputs];
            
            const selectorLower = selector.toLowerCase();
            for (const el of allElements) {
              const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').toLowerCase();
              const id = (el.id || '').toLowerCase();
              const name = (el.name || '').toLowerCase();
              
              if (text.includes(selectorLower) || id.includes(selectorLower) || name.includes(selectorLower)) {
                element = el;
                strategies.push('semantic-fallback');
                break;
              }
            }
          }

          if (!element) {
            return { found: false, error: 'Element not found after trying multiple strategies' };
          }

          const rect = element.getBoundingClientRect();
          const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
          const scrollY = window.pageYOffset || document.documentElement.scrollTop;
          
          return {
            found: true,
            x: rect.left + rect.width / 2 + scrollX,
            y: rect.top + rect.height / 2 + scrollY,
            strategies: strategies
          };
        })();
      `);

      if (!elementInfo.found) {
        return { success: false, error: elementInfo.error || 'Element not found' };
      }

      // Log which strategy worked
      if (elementInfo.strategies && elementInfo.strategies.length > 0) {
        console.log(`Element found using strategies: ${elementInfo.strategies.join(', ')}`);
      }

      // Show cursor and move to element
      await showCursorOverlay(tab.webContents, elementInfo.x, elementInfo.y, 'click');
      await new Promise(resolve => setTimeout(resolve, 300)); // Smooth movement

      // Find and click the element - use the same strategies
      const result = await tab.runJs(`
        (async () => {
          let element = null;
          const selectorType = ${JSON.stringify(selectorType)};
          const selector = ${JSON.stringify(selector)};

          // Use the same multi-strategy approach
          if (selectorType === 'css' || !selectorType) {
            element = document.querySelector(selector);
            
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
            
            if (!element) {
              const idParts = selector.replace(/[#\[\]()]/g, '').split(/[.\s]/).filter(p => p.length > 2);
              for (const part of idParts) {
                element = document.querySelector('#' + part) || document.querySelector('[id*="' + part + '"]');
                if (element) break;
              }
            }
            
            if (!element && selector.includes('name=')) {
              const nameMatch = selector.match(/name=["']([^"']+)["']/i);
              if (nameMatch) {
                element = document.querySelector('[name="' + nameMatch[1] + '"]');
              }
            }
            
            if (!element && selector.startsWith('.')) {
              const classParts = selector.substring(1).split('.');
              if (classParts.length > 0) {
                element = document.querySelector('.' + classParts[0]);
              }
            }
          } else if (selectorType === 'xpath') {
            const xpathResult = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            element = xpathResult.singleNodeValue;
          } else if (selectorType === 'text') {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
            let node;
            while (node = walker.nextNode()) {
              if (node.textContent && node.textContent.trim().includes(selector)) {
                element = node.parentElement;
                break;
              }
            }
          }
          
          // Last resort: semantic fallback
          if (!element) {
            const allButtons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
            const allInputs = Array.from(document.querySelectorAll('input, textarea, select'));
            const allElements = [...allButtons, ...allInputs];
            
            const selectorLower = selector.toLowerCase();
            for (const el of allElements) {
              const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').toLowerCase();
              const id = (el.id || '').toLowerCase();
              const name = (el.name || '').toLowerCase();
              
              if (text.includes(selectorLower) || id.includes(selectorLower) || name.includes(selectorLower)) {
                element = el;
                break;
              }
            }
          }

          if (!element) {
            return { success: false, error: 'Element not found after trying multiple strategies' };
          }

          // Check if element is visible and not blocked by overlays
          const checkVisibility = () => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const isBasicVisible = rect.width > 0 && rect.height > 0 && 
              style.display !== 'none' && 
              style.visibility !== 'hidden' &&
              style.opacity !== '0';
            
            if (!isBasicVisible) return false;
            
            // Check if element is in viewport (with tolerance)
            const inViewport = rect.top >= -100 && rect.left >= -100 &&
              rect.bottom <= (window.innerHeight + 100) &&
              rect.right <= (window.innerWidth + 100);
            
            if (!inViewport) return false;
            
            // Check if element is blocked by overlays/modals
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const topElement = document.elementFromPoint(centerX, centerY);
            
            // If the top element is the element itself or a child, it's not blocked
            if (topElement === element || element.contains(topElement)) {
              return true;
            }
            
            // Check if blocking element is a modal/overlay that should be dismissed
            const blockingElement = topElement;
            if (blockingElement) {
              const blockingStyle = window.getComputedStyle(blockingElement);
              const blockingZIndex = parseInt(blockingStyle.zIndex) || 0;
              const elementZIndex = parseInt(style.zIndex) || 0;
              
              // If blocking element has very high z-index, it might be a modal
              if (blockingZIndex > 1000) {
                // Try to find and close common modal patterns
                const modalCloseButtons = document.querySelectorAll('[data-dismiss="modal"], .modal-close, .close-button, [aria-label*="close" i], [aria-label*="stäng" i]');
                if (modalCloseButtons.length > 0) {
                  // Don't auto-close, but note it
                  console.warn('Element might be blocked by modal');
                }
              }
            }
            
            // If element is partially visible, consider it visible
            return true;
          };
          
          // Try multiple strategies to make element visible
          let isVisible = checkVisibility();
          if (!isVisible) {
            // Strategy 1: Scroll element into view
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            await new Promise((resolve) => setTimeout(resolve, 500));
            isVisible = checkVisibility();
            
            if (!isVisible) {
              // Strategy 2: Scroll parent elements
              let parent = element.parentElement;
              let attempts = 0;
              while (parent && attempts < 5 && !isVisible) {
                parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise((resolve) => setTimeout(resolve, 300));
                parent = parent.parentElement;
                attempts++;
                isVisible = checkVisibility();
              }
              
              if (!isVisible) {
                // Strategy 3: Try clicking parent container if element is inside a collapsed section
                const collapsibleParent = element.closest('[aria-expanded="false"], .collapsed, [class*="collapse"]:not([class*="show"])');
                if (collapsibleParent) {
                  // Try to expand it
                  const expandButton = collapsibleParent.querySelector('button, [role="button"]');
                  if (expandButton) {
                    expandButton.click();
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    isVisible = checkVisibility();
                  }
                }
              }
              
              if (!isVisible) {
                // Strategy 4: Try removing pointer-events from potential overlays
                const centerX = element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2;
                const centerY = element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2;
                const topElement = document.elementFromPoint(centerX, centerY);
                if (topElement && topElement !== element && !element.contains(topElement)) {
                  const tempStyle = topElement.style.pointerEvents;
                  topElement.style.pointerEvents = 'none';
                  await new Promise((resolve) => setTimeout(resolve, 100));
                  isVisible = checkVisibility();
                  topElement.style.pointerEvents = tempStyle;
                }
              }
            }
          } else {
            // Element is visible, but scroll slightly to ensure it's in viewport center
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          
          // Final visibility check - be very lenient
          const finalRect = element.getBoundingClientRect();
          const finalStyle = window.getComputedStyle(element);
          
          // Only fail if element truly doesn't exist or has zero dimensions
          if (finalRect.width === 0 && finalRect.height === 0) {
            return { success: false, error: 'Element has zero dimensions' };
          }
          
          // If element exists and has dimensions, try to click it even if visibility check is strict
          // Many elements are technically "visible" but might fail strict checks due to z-index, overlays, etc.
          const isBasicallyVisible = finalRect.width > 0 && 
                                    finalRect.height > 0 && 
                                    finalStyle.display !== 'none' && 
                                    finalStyle.visibility !== 'hidden';
          
          if (!isBasicallyVisible) {
            return { success: false, error: 'Element is not visible (display:none or visibility:hidden)' };
          }
          
          // Element exists and has dimensions - proceed with click even if not perfectly in viewport
          
          try {
            // Ensure element is visible and interactable
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
              return { success: false, error: 'Element has zero dimensions' };
            }
            
            // Get exact center coordinates for clicking
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Hover/focus the element first to reveal any hidden content
            element.focus();
            element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
            element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
            await new Promise(resolve => setTimeout(resolve, 200)); // Wait for hover effects
            
            // Try multiple click methods for better compatibility
            // Use exact center coordinates for mouse events
            const mouseEvents = ['mousedown', 'mouseup', 'click'];
            for (const eventType of mouseEvents) {
              const event = new MouseEvent(eventType, {
                bubbles: true,
                cancelable: true,
                view: window,
                buttons: 1,
                button: 0,
                clientX: centerX,
                clientY: centerY,
                screenX: centerX,
                screenY: centerY
              });
              element.dispatchEvent(event);
            }
            
            // Also try the native click method (which should use center by default)
            if (typeof element.click === 'function') {
              element.click();
            }
            
            // For links, also trigger navigation
            if (element.tagName === 'A' && element.href) {
              // Let the click event handle navigation naturally
            }
            
            return { 
              success: true, 
              message: 'Element clicked successfully', 
              x: ${elementInfo.x}, 
              y: ${elementInfo.y},
              centerX: centerX,
              centerY: centerY
            };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();
      `);

      // Animate click and hide cursor - use center coordinates if available
      if (result.success) {
        const clickX = result.centerX || result.x || elementInfo.x;
        const clickY = result.centerY || result.y || elementInfo.y;
        await animateClick(tab.webContents, clickX, clickY);
        await new Promise(resolve => setTimeout(resolve, 400));
        await hideCursorOverlay(tab.webContents);
      } else {
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

