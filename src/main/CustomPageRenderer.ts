import { getWorkspaceManager, Workspace } from "./WorkspaceManager";
import { getWidgetRenderer } from "./widgets/WidgetRenderer";

function buildWorkspaceHtml(workspace: Workspace): string {
  const widgetRenderer = getWidgetRenderer();
  const DEFAULT_WIDGET_WIDTH = 800;
  const DEFAULT_WIDGET_HEIGHT = 500;
  const escapeHtml = (v: string): string =>
    v
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const escapeHtmlAttr = (v: string): string =>
    escapeHtml(v).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  // Embed workspace data as JSON for JavaScript access
  const workspaceData = JSON.stringify({
    id: workspace.id,
    widgets: workspace.widgets.map(w => ({
      id: w.id,
      position: w.position,
      size: w.size,
      sourceUrl: w.sourceUrl,
      historyEntries: w.historyEntries,
      historyIndex: w.historyIndex,
      zoomFactor: w.zoomFactor,
    }))
  });
  
  const widgetsHtml = workspace.widgets
    .map(
      (w) => {
        // Use saved height, no minimum constraints
        const containerHeight = (w.size && typeof w.size.height === 'number' && w.size.height > 0) 
          ? w.size.height 
          : DEFAULT_WIDGET_HEIGHT;
        const headerHeight = 40; // Approximate header height (8px top + 8px bottom padding + ~24px content)
        const totalHeight = containerHeight + headerHeight;
        const widgetWidth = (w.size && typeof w.size.width === 'number' && w.size.width > 0)
          ? Math.max(w.size.width, 300)
          : DEFAULT_WIDGET_WIDTH;
        
        console.log('[Widget Render] ID: ' + w.id + ', Saved size: ' + (w.size?.width || '?') + 'x' + (w.size?.height || '?') + ', Using: ' + widgetWidth + 'x' + containerHeight + ', Total shell: ' + totalHeight);

        const titleTextRaw = w.sourceUrl || "Widget";
        const titleText = escapeHtml(titleTextRaw);
        const titleTextAttr = escapeHtmlAttr(titleTextRaw);

        return `<div class="widget-shell" data-widget-id="${w.id}" draggable="false" style="left:${w.position.x || 0}px;top:${w.position.y || 0}px;width:${widgetWidth}px;height:${totalHeight}px;">
  <div class="widget-header">
    <div class="widget-nav">
      <button type="button" class="widget-btn widget-back" data-widget-id="${w.id}" aria-label="Back">←</button>
      <button type="button" class="widget-btn widget-forward" data-widget-id="${w.id}" aria-label="Forward">→</button>
    </div>
    <div class="widget-title widget-url" data-widget-id="${w.id}" title="${titleTextAttr}">${titleText}</div>
    <div class="widget-actions">
      <button type="button" class="widget-btn widget-close" data-widget-id="${w.id}" aria-label="Stäng">✕</button>
    </div>
  </div>
  <div class="widget-container" data-widget-id="${w.id}" style="height:${containerHeight}px;width:100%;">
    ${widgetRenderer.renderIframe(w)}
    <div class="drag-overlay"></div>
    <div class="widget-resize-handle" data-widget-id="${w.id}"></div>
  </div>
</div>`;
      }
    )
    .join("\n");

  return `<!doctype html>
<html class="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'">
<title>${workspace.name}</title>
<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  :root {
    --background: 20 20 20;
    --foreground: 250 250 250;
    --card: 20 20 20;
    --border: 40 40 40;
    --cell-w: 25px;
    --cell-h: 25px;
    --cell-gap: 10px;
    --grid-line: rgba(255,255,255,0.04);
  }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    margin: 0;
    padding: 24px;
    background: rgb(var(--background));
    color: rgb(var(--foreground));
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-y: auto;
  }
  
  h1 {
    margin-bottom: 24px;
    font-size: 1.875rem;
    font-weight: 700;
    color: rgb(var(--foreground));
  }
  
  .workspace-grid {
    position: relative;
    min-height: 200vh;
    background-image:
      repeating-linear-gradient(
        to right,
        transparent,
        transparent calc(var(--cell-w) - 1px),
        var(--grid-line) calc(var(--cell-w) - 1px),
        var(--grid-line) var(--cell-w)
      ),
      repeating-linear-gradient(
        to bottom,
        transparent,
        transparent calc(var(--cell-h) - 1px),
        var(--grid-line) calc(var(--cell-h) - 1px),
        var(--grid-line) var(--cell-h)
      );
    background-size: calc(var(--cell-w) + var(--cell-gap)) calc(var(--cell-h) + var(--cell-gap));
    background-position: 0 0;
    padding: 20px;
    border-radius: 8px;
    /* Ensure widgets can be positioned outside the grid bounds */
    overflow: visible;
  }
  
  .workspace-grid.dragging {
    --grid-line: rgba(255,255,255,0.20);
  }
  
  .widget-shell {
    border: 1px solid rgb(var(--border));
    border-radius: 10px;
    background: rgb(var(--card));
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 300px;
    position: absolute;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  
  .widget-shell.dragging {
    box-shadow: 0 8px 16px -4px rgb(0 0 0 / 0.3), 0 4px 8px -2px rgb(0 0 0 / 0.2);
    z-index: 10000;
    transition: none !important;
  }
  
  .widget-shell.resizing {
    box-shadow: 0 8px 16px -4px rgb(0 0 0 / 0.3), 0 4px 8px -2px rgb(0 0 0 / 0.2);
    z-index: 10000;
    transition: none !important;
  }

  .widget-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.08);
    border-bottom: 1px solid rgb(var(--border));
    cursor: grab;
    user-select: none;
    position: relative;
    z-index: 99999;
    pointer-events: auto;
  }
  
  .widget-header:hover {
    background: rgba(255,255,255,0.12);
  }

  .widget-header:active {
    cursor: grabbing;
  }
  
  .drag-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 99998;
    display: none;
  }
  
  .widget-shell.dragging .drag-overlay, 
  .widget-shell.resizing .drag-overlay {
    display: block;
  }

  .widget-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: max-content;
  }

  .widget-title {
    font-size: 13px;
    font-weight: 600;
    color: rgb(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 8px;
    min-width: 0;
  }

  .widget-url {
    /* Show full URL but truncate early so we never crowd the close button (reserve ~10em). */
    padding-right: 10em;
  }

  .widget-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .widget-btn {
    width: 22px;
    height: 22px;
    border: 1px solid rgb(var(--border));
    border-radius: 6px;
    background: rgba(255,255,255,0.06);
    color: rgb(var(--foreground));
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }

  .widget-btn:hover {
    background: rgba(255,255,255,0.12);
  }

  .widget-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .widget-container {
    position: relative;
    width: 100%;
    overflow: hidden;
    background: rgb(var(--card));
    z-index: 1;
  }

  .widget-container iframe {
    position: absolute;
    top: 0;
    left: 0;
    border: 0;
    pointer-events: auto;
    display: block;
    /* Width/height will be set explicitly via JavaScript to match container exactly */
  }

  .widget-container webview {
    position: absolute;
    top: 0;
    left: 0;
    border: 0;
    pointer-events: auto;
    /* IMPORTANT: Do NOT force display:block on <webview>.
       Electron's <webview> uses flex/inline-flex internally; overriding can break rendering/sizing (150px viewport). */
    display: flex;
    /* Width/height will be set explicitly via JavaScript to match container exactly */
    /* Do NOT use percentages - Electron webviews need explicit pixel values */
  }

  .widget-container:hover {
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  }

  .widget-resize-handle {
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 12px;
    height: 12px;
    border: 1px solid rgb(var(--border));
    border-radius: 4px;
    background: rgba(255,255,255,0.08);
    cursor: se-resize;
  }

  .workspace-grid {
    margin-bottom: 48px;
  }

  /* Drag (visual only) */
  .draggable {
    cursor: grab;
  }
</style>
</head>
<body>
  <h1>${workspace.name}</h1>
  <div class="workspace-grid">
    ${widgetsHtml}
  </div>

  <script>
    console.log('[Workspace] ===== SCRIPT STARTING =====');
    
    // IMMEDIATE EXECUTION - No waiting
    (function() {
      console.log('[Workspace] IIFE executing...');

      // Get workspace data from embedded JSON (shared across init + helper functions)
      const workspaceData = ${workspaceData};
      const DEFAULT_WIDGET_WIDTH = ${DEFAULT_WIDGET_WIDTH};
      const DEFAULT_WIDGET_HEIGHT = ${DEFAULT_WIDGET_HEIGHT};

      // Webview sizing: Electron webviews REQUIRE explicit pixel dimensions, not percentages
      function syncWebviewToContainer(container) {
        try {
          if (!container) return;
          const wv = container.querySelector('webview');
          if (!wv) return;

          // Measure container and apply explicit pixel sizing (Electron webviews need px sizes)
          const rect = container.getBoundingClientRect();
          const inlineHeight = container.style.height;

          const w = Math.max(1, Math.floor(rect.width));
          let h = 0;
          if (inlineHeight && inlineHeight !== 'auto' && inlineHeight !== '') {
            h = parseFloat(inlineHeight);
          } else {
            h = Math.max(1, Math.floor(rect.height));
          }

          if (!w || !h || h <= 0) return;

          wv.style.position = 'absolute';
          wv.style.top = '0';
          wv.style.left = '0';
          wv.style.width = w + 'px';
          wv.style.height = h + 'px';

          // Set guest sizing attributes used by <webview autosize="on">
          wv.setAttribute('width', w.toString());
          wv.setAttribute('height', h.toString());
          wv.setAttribute('minwidth', w.toString());
          wv.setAttribute('minheight', h.toString());
          wv.setAttribute('maxwidth', w.toString());
          wv.setAttribute('maxheight', h.toString());

          // Best-effort: some Electron builds expose setAutoResize
          if (typeof wv.setAutoResize === 'function') {
            try {
              wv.setAutoResize({ width: true, height: true, horizontal: true, vertical: true });
            } catch {}
          }

          // Belt-and-suspenders: request a guest resize from the main process
          const widgetId = container.getAttribute('data-widget-id');
          if (widgetId) {
            window.__workspaceUpdates = window.__workspaceUpdates || [];
            window.__workspaceUpdates.push({
              type: 'webview-resize',
              widgetId,
              width: w,
              height: h,
              timestamp: Date.now()
            });
          }

          // If the element still didn't take, force it once more shortly after.
          setTimeout(() => {
            try {
              const afterRect = wv.getBoundingClientRect();
              if (Math.abs(afterRect.height - h) > 5) {
                wv.style.height = h + 'px';
                wv.setAttribute('height', h.toString());
                if (typeof wv.setAutoResize === 'function') {
                  try {
                    wv.setAutoResize({ width: true, height: true, horizontal: true, vertical: true });
                  } catch {}
                }
              }
            } catch {}
          }, 100);
        } catch (e) {
          console.warn('[Webview] syncWebviewToContainer failed:', e);
        }
      }


      // Robust selector matching for events (handles text nodes / shadow DOM composed paths)
      function findInEventPath(event, selector) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        for (const node of path) {
          if (node instanceof Element && node.matches(selector)) return node;
        }
        const t = event.target;
        return t instanceof Element ? t.closest(selector) : null;
      }

      // Helpers used by resize logic (webview replaced iframe, so handle both)
      function disableIframePointerEvents() {
        document.querySelectorAll('iframe, webview').forEach(function(view) {
          view.style.pointerEvents = 'none';
        });
      }
      function enableIframePointerEvents() {
        document.querySelectorAll('iframe, webview').forEach(function(view) {
          view.style.pointerEvents = 'auto';
        });
      }


      function syncAllWebviews() {
        try {
          const containers = document.querySelectorAll('.widget-container');
          containers.forEach(function(container) {
            syncWebviewToContainer(container);
          });
        } catch (e) {
          // ignore
        }
      }

      function scheduleWebviewSync() {
        // Multiple passes: layout + webview upgrade timing can vary
        // Electron webviews need time to "upgrade" from placeholder to actual webview
        requestAnimationFrame(() => {
          syncAllWebviews();
          requestAnimationFrame(syncAllWebviews);
        });
        setTimeout(syncAllWebviews, 10);
        setTimeout(syncAllWebviews, 50);
        setTimeout(syncAllWebviews, 100);
        setTimeout(syncAllWebviews, 200);
        setTimeout(syncAllWebviews, 500);
        setTimeout(syncAllWebviews, 1000);
      }

      // React to actual size changes (no guessing): whenever a widget container changes size,
      // force-sync the webview guest viewport to match.
      let webviewResizeObserver = null;
      function attachWebviewResizeObserver() {
        try {
          if (typeof ResizeObserver !== 'function') return;
          if (webviewResizeObserver) webviewResizeObserver.disconnect();
          webviewResizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
              const container = entry.target;
              const rect = entry.contentRect;
              const widgetId = container.getAttribute('data-widget-id');
              console.log('[ResizeObserver] Container ' + widgetId + ' resized to ' + rect.width + 'x' + rect.height);
              // Use requestAnimationFrame to ensure DOM has settled
              requestAnimationFrame(() => {
                syncWebviewToContainer(container);
              });
            }
          });
          document.querySelectorAll('.widget-container').forEach((container) => {
            webviewResizeObserver.observe(container);
            // Also sync immediately on attach
            syncWebviewToContainer(container);
          });
          const containerCount = document.querySelectorAll('.widget-container').length;
          console.log('[ResizeObserver] Attached to ' + containerCount + ' containers');
        } catch (e) {
          console.error('[ResizeObserver] Failed:', e);
        }
      }
      
      function init() {
        console.log('[Workspace] ===== INIT FUNCTION CALLED =====');
        
        const cellW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-w')) || 25;
        const cellH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-h')) || 25;
        const cellGap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-gap')) || 10;
        const gridUnit = cellW + cellGap;
        
        console.log('[Workspace] Grid config:', { cellW, cellH, cellGap, gridUnit });

        const snap = (val, unit) => Math.max(0, Math.round(val / unit) * unit);
        
        // Function to save widget position via custom event (Tab will listen and call IPC)
        async function saveWidgetPosition(widgetId, x, y, width, height) {
          try {
            const wNum = Number(width);
            const hNum = Number(height);
            const safeWidth = Math.max(300, (Number.isFinite(wNum) && wNum > 0) ? wNum : DEFAULT_WIDGET_WIDTH);
            const safeHeight = (Number.isFinite(hNum) && hNum > 0) ? hNum : DEFAULT_WIDGET_HEIGHT;
            const event = new CustomEvent('workspace-widget-update', {
              detail: {
                workspaceId: workspaceData.id,
                widgetId: widgetId,
                x: x,
                y: y,
                width: safeWidth,
                height: safeHeight
              }
            });
            window.dispatchEvent(event);
            console.log('[Workspace] Saved position:', { widgetId, x, y, width: safeWidth, height: safeHeight });
          } catch (error) {
            console.error('[Workspace] Failed to save position:', error);
          }
        }

        const grid = document.querySelector(".workspace-grid");
        if (!grid) {
          console.error('[Workspace] Grid element not found!');
          return;
        }
        console.log('[Workspace] Grid found:', grid);

      // === DRAG FUNCTIONALITY ===

      // === GLOBAL STATE (keeping for resize) ===
      let draggedElement = null;
      let resizedWidget = null;
      let dragOffsetX = 0;
      let dragOffsetY = 0;
      let resizeStartW = 0;
      let resizeStartH = 0;
      let resizeStartX = 0;
      let resizeStartY = 0;

      // === BASIC MOUSE EVENT SETUP ===
      document.addEventListener('mousedown', function(e) {
        const targetEl = e.target instanceof Element ? e.target : null;
        console.log('[MOUSEDOWN] Event fired, target:', e.target, 'tag:', targetEl ? targetEl.tagName : typeof e.target);

        // CHECK 1: Widget Header (Drag)
        const header = findInEventPath(e, '.widget-header');
        if (header) {
          // Ignore buttons
          if (findInEventPath(e, '.widget-btn')) return;

          const shell = header.closest('.widget-shell');
          if (!shell) return;

          e.preventDefault();
          e.stopPropagation();

          draggedElement = shell;

          // Calculate offset so the exact point clicked stays under the mouse
          const shellRect = shell.getBoundingClientRect();
          dragOffsetX = e.clientX - shellRect.left;
          dragOffsetY = e.clientY - shellRect.top;

          // Visual feedback
          shell.classList.add('dragging');
          document.body.style.cursor = 'grabbing';

          // Disable embedded view pointer events during drag
          const embeddedViews = shell.querySelectorAll('iframe, webview');
          embeddedViews.forEach(function(view) {
            view.style.pointerEvents = 'none';
          });

          return;
        }
        
        // CHECK 2: Resize Handle
        const handle = findInEventPath(e, '.widget-resize-handle');
        if (handle) {
          const shell = handle.closest('.widget-shell');
          if (!shell) return;
          
          console.log('[RESIZE] Started on widget', shell.getAttribute('data-widget-id'));
          
          e.preventDefault();
          e.stopPropagation();
          
          resizedWidget = shell;
          
          const rect = shell.getBoundingClientRect();
          resizeStartW = rect.width;
          resizeStartH = rect.height;
          resizeStartX = e.clientX;
          resizeStartY = e.clientY;
          
          // Visual feedback
          shell.classList.add('resizing');
          document.body.style.cursor = 'se-resize';
          
          return;
        }
      }, true); // CAPTURE PHASE
      
      // Global mousemove
      document.addEventListener('mousemove', function(e) {
        if (!draggedElement && !activeResizeState) return;

        // CRITICAL: If no mouse buttons are pressed during drag/resize, IMMEDIATELY terminate
        if (e.buttons === 0) {
          console.log('[SAFETY] No mouse buttons pressed - force terminating all actions');

          if (draggedElement) {
            draggedElement.classList.remove('dragging');
            draggedElement.style.zIndex = '';
            draggedElement = null;
          }

          if (activeResizeState) {
            activeResizeState.shell.classList.remove("resizing");
            grid.classList.remove("dragging");
            activeResizeState = null;
            isResizing = false;
            resizedWidget = null;
          }

          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          document.querySelectorAll('iframe, webview').forEach(function(view) {
            view.style.pointerEvents = 'auto';
          });
          return;
        }

        // Handle drag movement
        if (draggedElement) {
          // Calculate new position relative to document body
          let newX = e.clientX - dragOffsetX;
          let newY = e.clientY - dragOffsetY;

          // Keep widgets within reasonable bounds
          newX = Math.max(0, newX);
          newY = Math.max(0, newY);

          // Snap to grid in real-time
          newX = snap(newX, gridUnit);
          newY = snap(newY, gridUnit);

          draggedElement.style.left = newX + 'px';
          draggedElement.style.top = newY + 'px';
          draggedElement.style.position = 'absolute';
          draggedElement.style.zIndex = '10000';
        }

        e.preventDefault();
        return false;

        // Calculate new position relative to document body
        let newX = e.clientX - dragOffsetX;
        let newY = e.clientY - dragOffsetY;

        // Keep widgets within reasonable bounds
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);

        // Snap to grid in real-time
        newX = snap(newX, gridUnit);
        newY = snap(newY, gridUnit);

        draggedElement.style.left = newX + 'px';
        draggedElement.style.top = newY + 'px';
        draggedElement.style.position = 'absolute';
        draggedElement.style.zIndex = '10000';

        e.preventDefault();
        return false;
      }, { passive: false });

      // Global mouseup - handles drag termination
      const handleMouseUp = function(e) {
        if (!draggedElement) return;

        console.log('[DRAG] MOUSEUP - terminating drag action');

        // Ensure we have final positions
        const finalX = parseFloat(draggedElement.style.left) || 0;
        const finalY = parseFloat(draggedElement.style.top) || 0;

        // Only save if we have a valid widget ID
        const widgetId = draggedElement.getAttribute('data-widget-id');
        if (widgetId) {
          const width = Math.max(300, parseFloat(getComputedStyle(draggedElement).width) || DEFAULT_WIDGET_WIDTH);
          const container = draggedElement.querySelector('.widget-container');
          const height = container
            ? (container.getBoundingClientRect().height || parseFloat(getComputedStyle(container).height) || DEFAULT_WIDGET_HEIGHT)
            : DEFAULT_WIDGET_HEIGHT;

          saveWidgetPosition(widgetId, finalX, finalY, width, height);
        }

        // Reset all drag-related state IMMEDIATELY
        draggedElement.classList.remove('dragging');
        draggedElement.style.zIndex = '';
        draggedElement = null;

        // Reset global UI state
        document.body.style.cursor = '';

        // Re-enable all embedded view pointer events
        document.querySelectorAll('iframe, webview').forEach(function(view) {
          view.style.pointerEvents = 'auto';
        });

        console.log('[DRAG] Drag action fully terminated');
        return false;
      };

      // Listen for mouseup on multiple targets to ensure we catch it
      document.addEventListener('mouseup', handleMouseUp, { passive: false });
      document.addEventListener('pointerup', handleMouseUp, { passive: false });
      window.addEventListener('mouseup', handleMouseUp, { passive: false });
      window.addEventListener('pointerup', handleMouseUp, { passive: false });

      console.log('[Workspace] ===== SIMPLE DRAG SETUP COMPLETE =====');
      console.log('[DEBUG] Event listeners attached - mousedown, mousemove, mouseup');


      // Resize functionality - rewritten based on best practices
      let activeResizeState = null;
      let isResizing = false;
      
      document.querySelectorAll(".widget-resize-handle").forEach((handle, handleIndex) => {
        const shell = handle.closest(".widget-shell");
        const container = shell ? shell.querySelector(".widget-container") : null;
        const header = shell ? shell.querySelector(".widget-header") : null;
        if (!shell || !container || !header) {
          console.warn('[Workspace] Resize handle', handleIndex, 'missing required elements');
          return;
        }

        const widgetId = shell.getAttribute('data-widget-id');
        console.log('[Workspace] Setting up resize for handle', handleIndex, 'Widget:', widgetId);

        const startResize = (e) => {
          console.log('[Widget Resize] START - Widget ' + widgetId);
          e.preventDefault();
          e.stopPropagation();
          
          const rect = shell.getBoundingClientRect();
          const startW = rect.width;
          const startH = rect.height;
          const headerHeight = header.getBoundingClientRect().height;
          
          console.log('[Widget Resize] Initial state:', {
            initialSize: { width: startW.toFixed(0), height: startH.toFixed(0) },
            headerHeight: headerHeight.toFixed(0),
            gridUnit: gridUnit,
            containerHeight: (startH - headerHeight).toFixed(0)
          });
          
          activeResizeState = {
            shell: shell,
            container: container,
            header: header,
            startX: e.clientX,
            startY: e.clientY,
            startW: startW,
            startH: startH,
            headerHeight: headerHeight,
            lastLogTime: Date.now()
          };
          
          isResizing = true;
          shell.classList.add("resizing");
          grid.classList.add("dragging");
          document.body.style.userSelect = "none";
          document.body.style.cursor = "se-resize";
          disableIframePointerEvents();
        };
        
        handle.addEventListener("mousedown", startResize);
        handle.addEventListener("pointerdown", startResize);
      });
      
      const handleResizeMouseMove = (e) => {
        if (!activeResizeState || !isResizing) return;

        // CRITICAL: If no mouse buttons are pressed during resize, IMMEDIATELY terminate
        if (e.buttons === 0) {
          console.log('[RESIZE SAFETY] No mouse buttons pressed - force terminating resize');

          activeResizeState.shell.classList.remove("resizing");
          grid.classList.remove("dragging");
          document.body.style.userSelect = "";
          document.body.style.cursor = "";
          enableIframePointerEvents();

          activeResizeState = null;
          isResizing = false;
          resizedWidget = null;
          return;
        }

        e.preventDefault();
        
        const { shell, container, startX, startY, startW, startH, headerHeight } = activeResizeState;
        const widgetId = shell.getAttribute('data-widget-id');
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const minW = 300;
        const minTotalH = headerHeight + 50; // Minimum total height including some content area
        const rawW = Math.max(minW, startW + dx);
        const rawH = Math.max(minTotalH, startH + dy);

        // SNAP TO GRID IN REAL-TIME (not just on release)
        const snappedW = Math.max(minW, snap(rawW, gridUnit));
        const snappedH = Math.max(minTotalH, snap(rawH, gridUnit));

        shell.style.width = snappedW + "px";
        shell.style.height = snappedH + "px";
        const newContainerHeight = snappedH - headerHeight;
        container.style.height = newContainerHeight + "px";
        syncWebviewToContainer(container);
        
        // Log resize movement (throttled)
        if (!activeResizeState.lastLogTime || Date.now() - activeResizeState.lastLogTime > 200) {
          const gridW = Math.round(snappedW / gridUnit);
          const gridH = Math.round(snappedH / gridUnit);
          console.log('[Widget Resize] Widget ' + widgetId + ' size: ' + gridW + ' x ' + gridH + ' grid units = (' + snappedW + 'px x ' + snappedH + 'px)');
          activeResizeState.lastLogTime = Date.now();
        }
      };

      const handleResizeMouseUp = (e) => {
        if (!activeResizeState || !isResizing) return;

        console.log('[RESIZE] MOUSEUP - terminating resize action');
        e.preventDefault();
        e.stopPropagation();

        const { shell, container, headerHeight, startW, startH } = activeResizeState;
        const widgetId = shell.getAttribute('data-widget-id');

        // Size is already snapped from mousemove
        const finalW = Math.max(300, parseFloat(getComputedStyle(shell).width) || DEFAULT_WIDGET_WIDTH);
        const measuredH = container
          ? (container.getBoundingClientRect().height || parseFloat(getComputedStyle(container).height) || 0)
          : 0;
        const finalH = measuredH || DEFAULT_WIDGET_HEIGHT;
        const totalH = finalH + headerHeight;

        const gridW = Math.round(finalW / gridUnit);
        const gridH = Math.round(totalH / gridUnit);

        console.log('[Widget Resize] END - Widget ' + widgetId + ' final size: ' + gridW + ' x ' + gridH + ' grid units = (' + finalW + 'px x ' + totalH + 'px)');

        // Save position and size
        const currentX = parseFloat(getComputedStyle(shell).left) || 0;
        const currentY = parseFloat(getComputedStyle(shell).top) || 0;

        if (widgetId) {
          // Persist container height (webview area) so rendered widgets stay 1:1 with webview sizing
          saveWidgetPosition(widgetId, currentX, currentY, finalW, finalH);
        }

        // Ensure embedded guest viewport matches final container size
        syncWebviewToContainer(container);

        // IMMEDIATE AND COMPLETE cleanup
        shell.classList.remove("resizing");
        grid.classList.remove("dragging");
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        enableIframePointerEvents();

        // Force reset all resize state
        activeResizeState = null;
        isResizing = false;
        resizedWidget = null;

        console.log('[RESIZE] Resize action fully terminated');
      };

      // Use multiple targets for resize events to ensure we catch mouseup
      document.addEventListener("mousemove", handleResizeMouseMove, { passive: false });
      document.addEventListener("mouseup", handleResizeMouseUp, { passive: false });
      document.addEventListener("pointermove", handleResizeMouseMove, { passive: false });
      document.addEventListener("pointerup", handleResizeMouseUp, { passive: false });
      window.addEventListener("mouseup", handleResizeMouseUp, { passive: false });
      window.addEventListener("pointerup", handleResizeMouseUp, { passive: false });
      
      console.log('[Workspace] Global resize handlers attached');
      console.log('[Workspace] ===== INIT COMPLETE =====');
      }
      
        // Track navigation inside webviews to persist URL + per-widget history stack (back/forward UI)
        function attachWebviewTracking() {
          const WIDGET_HISTORY_MAX = 50;
          const widgetStateById = new Map();
          const pendingInitPersist = [];

          function normalizeHistoryState(widgetId, rawUrl, rawEntries, rawIndex) {
            const safeUrl = (typeof rawUrl === 'string' && rawUrl) ? rawUrl : '';
            const entries = Array.isArray(rawEntries) ? rawEntries.filter((u) => typeof u === 'string' && u) : [];
            if (entries.length === 0 && safeUrl) entries.push(safeUrl);

            let idx = (typeof rawIndex === 'number' && Number.isFinite(rawIndex)) ? Math.floor(rawIndex) : (entries.length > 0 ? entries.length - 1 : 0);
            if (entries.length === 0) idx = 0;
            idx = Math.max(0, Math.min(idx, Math.max(0, entries.length - 1)));

            return { historyEntries: entries, historyIndex: idx };
          }

          // Seed state from persisted workspace JSON (if present)
          try {
            (workspaceData.widgets || []).forEach((w) => {
              const s = normalizeHistoryState(
                w.id,
                w.sourceUrl,
                w.historyEntries,
                w.historyIndex
              );
              widgetStateById.set(w.id, s);

              const persistedValid = Array.isArray(w.historyEntries) && w.historyEntries.length > 0 && typeof w.historyIndex === 'number';
              if (!persistedValid && s.historyEntries.length > 0) {
                pendingInitPersist.push({ widgetId: w.id, url: s.historyEntries[s.historyIndex] });
              }
            });
          } catch {}

          function getWidgetState(widgetId, fallbackUrl) {
            const existing = widgetStateById.get(widgetId);
            if (existing) return existing;
            const seeded = normalizeHistoryState(widgetId, fallbackUrl, [], 0);
            widgetStateById.set(widgetId, seeded);
            if (seeded.historyEntries.length > 0) {
              pendingInitPersist.push({ widgetId, url: seeded.historyEntries[seeded.historyIndex] });
            }
            return seeded;
          }

          function getShellByWidgetId(widgetId) {
            return document.querySelector('.widget-shell[data-widget-id="' + widgetId + '"]');
          }

          function getWebviewForWidget(widgetId) {
            const shell = getShellByWidgetId(widgetId);
            return shell ? shell.querySelector('webview') : null;
          }

          function updateHeaderUi(widgetId) {
            const shell = getShellByWidgetId(widgetId);
            if (!shell) return;
            const state = getWidgetState(widgetId, '');
            const currentUrl = (state.historyEntries && state.historyEntries[state.historyIndex]) ? state.historyEntries[state.historyIndex] : '';

            const urlEl = shell.querySelector('.widget-url');
            if (urlEl) {
              urlEl.textContent = currentUrl || 'Widget';
              try { urlEl.setAttribute('title', currentUrl || ''); } catch {}
            }

            const backBtn = shell.querySelector('.widget-back');
            const fwdBtn = shell.querySelector('.widget-forward');
            if (backBtn) backBtn.disabled = !(state.historyIndex > 0);
            if (fwdBtn) fwdBtn.disabled = !(state.historyEntries && state.historyIndex < state.historyEntries.length - 1);
          }

          function persistWidgetNav(widgetId, url) {
            if (!url) return;
            const state = getWidgetState(widgetId, url);
            window.__workspaceUpdates = window.__workspaceUpdates || [];
            window.__workspaceUpdates.push({
              type: 'widget-nav',
              workspaceId: workspaceData.id,
              widgetId,
              url,
              historyEntries: state.historyEntries ? state.historyEntries.slice() : [],
              historyIndex: state.historyIndex,
              timestamp: Date.now()
            });
          }

          function applyNavigationToHistory(widgetId, url) {
            if (!url) return;
            const state = getWidgetState(widgetId, url);
            const entries = state.historyEntries || [];
            const i = state.historyIndex || 0;

            if (entries[i] === url) {
              // no-op
              return;
            }
            if (i > 0 && entries[i - 1] === url) {
              state.historyIndex = i - 1;
              return;
            }
            if (i + 1 < entries.length && entries[i + 1] === url) {
              state.historyIndex = i + 1;
              return;
            }

            // New navigation: drop any forward history and append.
            const next = entries.slice(0, i + 1);
            if (next.length === 0 || next[next.length - 1] !== url) {
              next.push(url);
            }
            if (next.length > WIDGET_HISTORY_MAX) {
              const overflow = next.length - WIDGET_HISTORY_MAX;
              next.splice(0, overflow);
            }
            state.historyEntries = next;
            state.historyIndex = next.length - 1;
          }

          function navigateWidgetToUrl(widgetId, url) {
            if (!url) return;
            const wv = getWebviewForWidget(widgetId);
            if (!wv) return;
            try {
              if (typeof wv.loadURL === 'function') {
                wv.loadURL(url);
              } else {
                wv.setAttribute('src', url);
              }
            } catch {
              try {
                wv.setAttribute('src', url);
              } catch {}
            }
          }

          // Back/Forward buttons (event delegation)
          document.addEventListener('click', (e) => {
            const backBtn = findInEventPath(e, '.widget-back');
            const fwdBtn = findInEventPath(e, '.widget-forward');
            const btn = backBtn || fwdBtn;
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            const widgetId = btn.getAttribute('data-widget-id') || btn.closest('.widget-shell')?.getAttribute('data-widget-id');
            if (!widgetId) return;

            const state = getWidgetState(widgetId, '');
            const canGoBack = state.historyIndex > 0;
            const canGoForward = state.historyEntries && state.historyIndex < state.historyEntries.length - 1;

            if (backBtn && canGoBack) {
              state.historyIndex = state.historyIndex - 1;
              const url = state.historyEntries[state.historyIndex] || '';
              updateHeaderUi(widgetId);
              navigateWidgetToUrl(widgetId, url);
            } else if (fwdBtn && canGoForward) {
              state.historyIndex = state.historyIndex + 1;
              const url = state.historyEntries[state.historyIndex] || '';
              updateHeaderUi(widgetId);
              navigateWidgetToUrl(widgetId, url);
            } else {
              updateHeaderUi(widgetId);
            }
          }, true);

          const webviews = document.querySelectorAll('webview');
          webviews.forEach((wv) => {
            const shell = wv.closest('.widget-shell');
            const widgetId = shell?.getAttribute('data-widget-id');
            if (!widgetId) return;

            // Ensure state exists and header is correct on first paint
            const initialUrl = wv.getAttribute('src') || '';
            getWidgetState(widgetId, initialUrl);
            updateHeaderUi(widgetId);

            const onNav = (url) => {
              if (!url) return;
              applyNavigationToHistory(widgetId, url);
              updateHeaderUi(widgetId);
              persistWidgetNav(widgetId, url);
            };

            wv.addEventListener('did-navigate', (e) => onNav(e.url));
            wv.addEventListener('did-navigate-in-page', (e) => onNav(e.url));

            // Zoom persistence: receive zoomFactor from widget preload via sendToHost -> webview ipc-message
            // and persist it (debounced) into workspace JSON.
            let zoomPersistTimer = null;
            let latestZoomFactor = null;
            const schedulePersistZoom = (zoomFactor) => {
              latestZoomFactor = zoomFactor;
              if (zoomPersistTimer) return;
              zoomPersistTimer = setTimeout(() => {
                try {
                  const z = latestZoomFactor;
                  latestZoomFactor = null;
                  zoomPersistTimer = null;
                  if (typeof z !== 'number' || !Number.isFinite(z)) return;
                  window.__workspaceUpdates = window.__workspaceUpdates || [];
                  window.__workspaceUpdates.push({
                    type: 'widget-update',
                    workspaceId: workspaceData.id,
                    widgetId,
                    zoomFactor: z,
                    timestamp: Date.now()
                  });
                } catch {
                  zoomPersistTimer = null;
                  latestZoomFactor = null;
                }
              }, 250);
            };

            wv.addEventListener('ipc-message', (e) => {
              try {
                if (!e || e.channel !== 'blueberry-widget-zoom') return;
                const payload = (e.args && e.args.length > 0) ? e.args[0] : null;
                const zoomFactor = payload && typeof payload.zoomFactor === 'number' ? payload.zoomFactor : null;

                if (typeof zoomFactor === 'number' && Number.isFinite(zoomFactor)) {
                  schedulePersistZoom(zoomFactor);
                }
              } catch {
                // ignore
              }
            });

            // When the guest is ready, force immediate size sync (webview might have rendered at wrong size)
            wv.addEventListener('dom-ready', () => {
              try {
                const container = wv.closest('.widget-container');
                const widgetId = container ? container.getAttribute('data-widget-id') : 'unknown';
                console.log('[Webview] dom-ready fired for widget ' + widgetId);
                
                if (container) {
                  // Force sync immediately
                  syncWebviewToContainer(container);
                  // Also schedule delayed syncs in case container wasn't measured yet
                  setTimeout(() => syncWebviewToContainer(container), 10);
                  setTimeout(() => syncWebviewToContainer(container), 100);
                  setTimeout(() => syncWebviewToContainer(container), 500);
                }
              } catch (e) {
                console.warn('[Webview] Failed to setup on dom-ready:', e);
              }
            });
          });

          // Persist initial history state for legacy widgets that didn't have it yet
          if (pendingInitPersist.length > 0) {
            window.__workspaceUpdates = window.__workspaceUpdates || [];
            pendingInitPersist.forEach((p) => {
              const state = getWidgetState(p.widgetId, p.url);
              window.__workspaceUpdates.push({
                type: 'widget-nav',
                workspaceId: workspaceData.id,
                widgetId: p.widgetId,
                url: p.url,
                historyEntries: state.historyEntries ? state.historyEntries.slice() : [],
                historyIndex: state.historyIndex,
                timestamp: Date.now()
              });
            });
          }
        }

        // Close buttons -> queue delete (with event delegation for dynamic widgets)
        function attachCloseHandlers() {
          console.log('[Workspace] 🔧 Attaching close button handlers...');
          
          // Use event delegation on the document to catch all close button clicks
          let lastCloseWidgetId = null;
          let lastCloseAt = 0;

          const handleClose = function(e) {
            const targetEl = e.target instanceof Element ? e.target : null;
            console.log('[Workspace] 👆', e.type, 'on:', targetEl ? targetEl.tagName : typeof e.target, targetEl ? targetEl.className : '');

            const closeBtn = findInEventPath(e, '.widget-close');
            if (!closeBtn) {
              // Check if we clicked near a close button
              if (findInEventPath(e, '.widget-actions')) {
                console.log('[Workspace] Clicked in widget-actions but not on close button');
              }
              return;
            }
            
            console.log('[Workspace] ✅ Close button detected!');
            e.preventDefault();
            e.stopPropagation();
            
            const widgetId = closeBtn.getAttribute('data-widget-id');
            if (!widgetId) {
              console.warn('[Workspace] ❌ Close button missing widget-id');
              return;
            }

            // De-dupe: pointerdown + click can both fire
            const now = Date.now();
            if (lastCloseWidgetId === widgetId && now - lastCloseAt < 350) {
              return;
            }
            lastCloseWidgetId = widgetId;
            lastCloseAt = now;
            
            console.log('[Workspace] 🗑️ Close button clicked for widget:', widgetId);
            
            window.__workspaceUpdates = window.__workspaceUpdates || [];
            window.__workspaceUpdates.push({
              type: 'widget-delete',
              workspaceId: workspaceData.id,
              widgetId,
              timestamp: Date.now()
            });
            console.log('[Workspace] 📤 Queued widget-delete, updates count:', window.__workspaceUpdates.length);
            
            // Remove from DOM immediately for UX
            const shell = closeBtn.closest('.widget-shell');
            if (shell && shell.parentElement) {
              console.log('[Workspace] 🗑️ Removing widget from DOM:', widgetId);
              shell.parentElement.removeChild(shell);
            } else {
              console.warn('[Workspace] ❌ Could not find widget shell to remove');
            }
          };

          // Use capture phase to ensure we catch it before webview/embedded content
          document.addEventListener('pointerdown', handleClose, true);
          document.addEventListener('click', handleClose, true);
          
          console.log('[Workspace] ✅ Close button handlers attached');
        }

        // Ctrl+wheel zoom should zoom the widget under the cursor (not the whole workspace page).
        // Note: wheel events inside <webview> typically do NOT bubble to the embedder, so we handle
        // host chrome (header/etc) here and the guest content in the main process.
        function attachWidgetZoomHandlers() {
          try {
            document.addEventListener('wheel', (e) => {
              try {
                const ctrlOrCmd = !!e.ctrlKey || !!e.metaKey;
                if (!ctrlOrCmd) return;

                // Avoid double-handling if the wheel event target is the <webview> element itself.
                if (findInEventPath(e, 'webview')) return;

                const shell = findInEventPath(e, '.widget-shell');
                if (!shell) return;

                const widgetId = shell.getAttribute('data-widget-id');
                if (!widgetId) return;

                e.preventDefault();
                e.stopPropagation();

                window.__workspaceUpdates = window.__workspaceUpdates || [];
                window.__workspaceUpdates.push({
                  type: 'widget-zoom',
                  widgetId,
                  deltaY: e.deltaY,
                  timestamp: Date.now()
                });
              } catch {}
            }, { capture: true, passive: false });
          } catch (e) {
            console.warn('[Workspace] Failed to attach widget zoom wheel handler', e);
          }
        }

        // Call init immediately
        init();
        attachWebviewTracking();
        attachCloseHandlers();
        attachWidgetZoomHandlers();
        attachWebviewResizeObserver();
        
        // CRITICAL: Sync webviews immediately and aggressively
        // First, wait for DOM to be ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            scheduleWebviewSync();
            // Also sync immediately
            syncAllWebviews();
          });
        } else {
          // DOM already ready
          syncAllWebviews();
          scheduleWebviewSync();
        }

    })();
    
    console.log('[Workspace] ===== SCRIPT END =====');
  </script>
</body>
</html>`;
}

export class CustomPageRenderer {
  async renderWorkspace(workspaceId: string): Promise<string | null> {
    const workspace = await getWorkspaceManager().getWorkspace(workspaceId);
    if (!workspace) return null;
    return buildWorkspaceHtml(workspace);
  }

  async renderDefault(): Promise<string | null> {
    const manager = getWorkspaceManager();
    // First check if any workspaces exist
    const allWorkspaces = await manager.listWorkspaces();
    if (allWorkspaces.length === 0) {
      // No workspaces exist, return null to show Google fallback
      return null;
    }
    // Workspaces exist, get the default workspace (or first if none marked default)
    // This ensures we always show a workspace when one exists, not Google
    const workspace = await manager.getDefaultWorkspace();
    if (!workspace) {
      // This shouldn't happen if workspaces exist, but handle it gracefully
      return null;
    }
    return buildWorkspaceHtml(workspace);
  }
}

let renderer: CustomPageRenderer | null = null;
export function getCustomPageRenderer(): CustomPageRenderer {
  if (!renderer) renderer = new CustomPageRenderer();
  return renderer;
}


