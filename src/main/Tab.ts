import { NativeImage, WebContentsView } from "electron";
import { getCustomPageRenderer } from "./CustomPageRenderer";
import { getWorkspaceManager } from "./WorkspaceManager";

export class Tab {
  private webContentsView: WebContentsView;
  private _id: string;
  private _title: string;
  private _url: string;
  private _isVisible: boolean = false;
  private _isWorkspacePage: boolean = false; // Track if this tab is showing a workspace page
  private _workspaceRoute: string | null = null; // Original blueberry:// route for regenerating workspace HTML
  private _workspaceRefreshInProgress: boolean = false;
  private _workspaceId: string | null = null;

  // Per-widget webview guest bookkeeping (for Ctrl+wheel zoom and other widget-level browser controls)
  private widgetGuestWebContentsIdByWidgetId: Map<string, number> = new Map();
  private widgetIdByGuestWebContentsId: Map<number, string> = new Map();
  private widgetZoomFactorByWidgetId: Map<string, number> = new Map();
  private widgetZoomPersistTimersByWidgetId: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private widgetZoomListenerAttachedGuestIds: Set<number> = new Set();
  private widgetZoomAppliedWidgetIds: Set<string> = new Set();
  private widgetLastZoomAppliedAtByWidgetId: Map<string, number> = new Map();
  private widgetLastZoomDirectionByWidgetId: Map<string, number> = new Map();

  constructor(id: string, url: string = "https://www.google.com") {
    this._id = id;
    this._url = url;
    this._title = "New Tab";

    // Create the WebContentsView for web content only
    this.webContentsView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        preload: undefined, // We'll inject manually
        webviewTag: true,   // allow <webview> for sites that block iframes (e.g., YouTube)
      },
    });
    
    // Set realistic Chrome user agent to bypass bot detection
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    this.webContentsView.webContents.setUserAgent(userAgent);
    
    // Also set at session level for all requests
    this.webContentsView.webContents.session.setUserAgent(userAgent);
    
    // Enable native dark mode support - WebContents will respect nativeTheme automatically
    // No manual CSS injection needed

    // Set up event listeners
    this.setupEventListeners();

    // Load the initial URL
    this.loadURL(url);
  }

  /**
   * Persist widget updates (position/size/url) to workspace storage
   */
  private async persistWidgetUpdate(update: { workspaceId: string; widgetId: string; x?: number; y?: number; width?: number; height?: number; url?: string; historyEntries?: string[]; historyIndex?: number; zoomFactor?: number; }): Promise<void> {
    const workspaceManager = getWorkspaceManager();
    const workspace = await workspaceManager.getWorkspace(update.workspaceId);
    if (!workspace) {
      console.warn('[Tab] Workspace not found for update', update.workspaceId);
      return;
    }

    const widget = workspace.widgets.find((w) => w.id === update.widgetId);
    if (!widget) {
      console.warn('[Tab] Widget not found for update', update.widgetId);
      return;
    }

    if (typeof update.x === 'number' && typeof update.y === 'number') {
      widget.position = { x: update.x, y: update.y };
    }
    if (typeof update.width === 'number' && typeof update.height === 'number') {
      widget.size = { width: update.width, height: update.height };
    }
    if (update.url) {
      widget.sourceUrl = update.url;
    }
    if (Array.isArray(update.historyEntries)) {
      widget.historyEntries = update.historyEntries;
    }
    if (typeof update.historyIndex === "number") {
      widget.historyIndex = update.historyIndex;
    }
    if (typeof update.zoomFactor === "number") {
      widget.zoomFactor = update.zoomFactor;
    }

    await workspaceManager.updateWorkspace(workspace);
    const changes: Record<string, any> = { widgetId: update.widgetId };
    if (typeof update.x === "number" && typeof update.y === "number") changes.position = { x: update.x, y: update.y };
    if (typeof update.width === "number" && typeof update.height === "number") changes.size = { width: update.width, height: update.height };
    if (update.url) changes.url = update.url;
    if (Array.isArray(update.historyEntries)) changes.historyEntries = update.historyEntries;
    if (typeof update.historyIndex === "number") changes.historyIndex = update.historyIndex;
    if (typeof update.zoomFactor === "number") changes.zoomFactor = update.zoomFactor;
    console.log("[Tab] Persisted widget update", changes);
  }

  /**
   * Delete a widget from workspace storage
   */
  private async persistWidgetDelete(update: { workspaceId: string; widgetId: string; }): Promise<void> {
    const workspaceManager = getWorkspaceManager();
    const workspace = await workspaceManager.getWorkspace(update.workspaceId);
    if (!workspace) {
      console.warn('[Tab] Workspace not found for delete', update.workspaceId);
      return;
    }

    const nextWidgets = workspace.widgets.filter((w) => w.id !== update.widgetId);
    if (nextWidgets.length === workspace.widgets.length) {
      console.warn('[Tab] Widget not found for delete', update.widgetId);
      return;
    }

    workspace.widgets = nextWidgets;
    await workspaceManager.updateWorkspace(workspace);
    console.log('[Tab] Deleted widget', { widgetId: update.widgetId });
  }

  private setupEventListeners(): void {
    // Inject anti-bot detection as early as possible
    this.webContentsView.webContents.on("did-start-loading", () => {
      this.injectAntiBotDetection();
    });

    // Update title when page title changes
    this.webContentsView.webContents.on("page-title-updated", (_, title) => {
      this._title = title;
    });

    // Update URL when navigation occurs
    this.webContentsView.webContents.on("did-navigate", (_, url) => {
      this._url = url;
      //console.log(`🔄 Navigation detected for tab ${this._id} to ${url}, will inject listeners`);
      // Inject anti-bot detection immediately
      this.injectAntiBotDetection();
      // Wait for page to be ready before injecting
      setTimeout(() => {
        console.log(`⏰ Injecting listeners after navigation for tab ${this._id}`);
        this.injectEventListeners();
      }, 1500);
    });

    this.webContentsView.webContents.on("did-navigate-in-page", (_, url) => {
      this._url = url;
    });

    // Inject event listeners when DOM is ready
    this.webContentsView.webContents.on("dom-ready", () => {
      console.log(`📄 DOM ready for tab ${this._id}, isWorkspacePage=${this._isWorkspacePage}, injecting listeners`);
      setTimeout(() => {
        this.injectEventListeners();
      }, 500);
      
      // For workspace pages, inject IPC bridge for widget position updates
      if (this._isWorkspacePage) {
        console.log(`🔧 [Tab ${this._id}] Injecting workspace IPC bridge (isWorkspacePage=true)`);
        this.injectWorkspaceIPC();
      }
    });

    // Also inject after page finishes loading
    this.webContentsView.webContents.on("did-finish-load", () => {
      console.log(`✅ Page finished loading for tab ${this._id}, injecting listeners`);
      setTimeout(() => {
        this.injectEventListeners();
      }, 500);
    });
    
    // Inject on frame finish load (for iframes and dynamic content)
    this.webContentsView.webContents.on("did-frame-finish-load", () => {
      setTimeout(() => {
        this.injectEventListeners();
      }, 350);
    });
    
    // Inject user interaction detection script
    const interactionScript = `
      (function() {
        let interactionDetected = false;
        
        const detectInteraction = () => {
          if (!interactionDetected) {
            interactionDetected = true;
            // Use console.log with special marker that main process can detect
            console.log('[USER-INTERACTION]', JSON.stringify({ tabId: '${this._id}', timestamp: Date.now() }));
          }
        };
        
        // Listen for clicks, keyboard input, form changes
        document.addEventListener('click', detectInteraction, true);
        document.addEventListener('keydown', detectInteraction, true);
        document.addEventListener('input', detectInteraction, true);
        document.addEventListener('change', detectInteraction, true);
        
        // Store cleanup function
        window.__cleanupInteractionDetection = () => {
          document.removeEventListener('click', detectInteraction, true);
          document.removeEventListener('keydown', detectInteraction, true);
          document.removeEventListener('input', detectInteraction, true);
          document.removeEventListener('change', detectInteraction, true);
        };
      })();
    `;

    // Inject interaction detection after page loads
    this.webContentsView.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        try {
          this.webContentsView.webContents.executeJavaScript(interactionScript).catch(() => {});
        } catch (error) {
          // Ignore errors
        }
      }, 500);
    });

  }

  // Dark mode is now handled by Electron's nativeTheme API
  // No manual CSS injection needed - removed to allow natural browser dark mode

  /**
   * Inject anti-bot detection code to bypass website blocks
   */
  private injectAntiBotDetection(): void {
    const antiBotCode = `
      (function() {
        try {
          // Override webdriver property (most important)
          Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
            configurable: true
          });
          
          // Override plugins to look like a real browser
          Object.defineProperty(navigator, 'plugins', {
            get: () => {
              const plugins = [];
              for (let i = 0; i < 5; i++) {
                plugins.push({
                  name: 'Chrome PDF Plugin',
                  description: 'Portable Document Format',
                  filename: 'internal-pdf-viewer'
                });
              }
              return plugins;
            },
            configurable: true
          });
          
          // Override languages
          Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
            configurable: true
          });
          
          // Override platform
          Object.defineProperty(navigator, 'platform', {
            get: () => 'Win32',
            configurable: true
          });
          
          // Override hardwareConcurrency
          Object.defineProperty(navigator, 'hardwareConcurrency', {
            get: () => 8,
            configurable: true
          });
          
          // Override deviceMemory
          Object.defineProperty(navigator, 'deviceMemory', {
            get: () => 8,
            configurable: true
          });
          
          // Override permissions
          const originalQuery = window.navigator.permissions.query;
          window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
              Promise.resolve({ state: Notification.permission }) :
              originalQuery(parameters)
          );
          
          // Override Chrome runtime (critical for Chrome detection)
          window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
          };
          
          // Override WebGL vendor and renderer
          const getParameter = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) {
              return 'Intel Inc.';
            }
            if (parameter === 37446) {
              return 'Intel Iris OpenGL Engine';
            }
            return getParameter.call(this, parameter);
          };
          
          // Override toString methods to hide overrides
          const originalToString = Function.prototype.toString;
          Function.prototype.toString = function() {
            if (this === navigator.webdriver?.get) {
              return 'function get webdriver() { [native code] }';
            }
            return originalToString.call(this);
          };
          
          // Remove automation indicators
          delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
          delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
          delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
        } catch (e) {
          console.warn('Anti-bot injection error:', e);
        }
      })();
    `;
    
    try {
      this.webContentsView.webContents.executeJavaScript(antiBotCode).catch(() => {
        // Ignore errors if page isn't ready
      });
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Inject JavaScript to capture DOM events for recording
   */
  private injectEventListeners(): void {
    const tabId = this._id;
    
    // Inject anti-bot detection first
    this.injectAntiBotDetection();
    
    // Always re-inject to ensure it works after navigation
    const injectionCode = `
      (function() {
        // Remove existing listeners if re-injecting
        if (window.__recordingCleanup) {
          window.__recordingCleanup();
        }
        
        window.__recordingInjected = true;

        function getElementSelector(element) {
          if (!element) return null;
          
          // Try ID first
          if (element.id) {
            return '#' + element.id;
          }
          
          // Try name attribute
          if (element.name) {
            return '[name="' + element.name + '"]';
          }
          
          // Try class
          if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\\s+/).filter(c => c);
            if (classes.length > 0) {
              return '.' + classes[0];
            }
          }
          
          // Try data attributes
          if (element.dataset && Object.keys(element.dataset).length > 0) {
            const firstKey = Object.keys(element.dataset)[0];
            return '[data-' + firstKey + '="' + element.dataset[firstKey] + '"]';
          }
          
          // Fallback to tag name
          return element.tagName.toLowerCase();
        }

        // Store events and send them via console (which we'll intercept)
        // This is a workaround for context isolation
        window.__recordingEvents = [];
        
        function sendRecordingEvent(type, data) {
          const event = {
            tabId: '${tabId}',
            type: type,
            ...data
          };
          // Use a custom event that we'll listen for in the main process
          // We'll use console.log with a special prefix that we can intercept
          // Format as single string to ensure proper parsing
          const eventString = '__RECORDING_EVENT__' + JSON.stringify(event);
          console.log(eventString);
          // Also try to send via window.postMessage as backup (won't work due to context isolation, but harmless)
          try {
            window.postMessage({ type: '__RECORDING_EVENT__', data: event }, '*');
          } catch(e) {
            // Ignore - context isolation prevents this
          }
        }

        // Capture clicks
        document.addEventListener('click', function(e) {
          const rect = e.target.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const element = getElementSelector(e.target);
          
          sendRecordingEvent('mouse_click', {
            x: Math.round(x),
            y: Math.round(y),
            element: element
          });
        }, true);

        // Capture input changes
        document.addEventListener('input', function(e) {
          if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
            const element = getElementSelector(e.target);
            sendRecordingEvent('input_fill', {
              element: element,
              value: e.target.value
            });
          }
        }, true);

        // Capture select changes
        document.addEventListener('change', function(e) {
          if (e.target && e.target.tagName === 'SELECT') {
            const element = getElementSelector(e.target);
            sendRecordingEvent('dropdown_select', {
              element: element,
              value: e.target.value
            });
          }
        }, true);

        // Capture hover events (with debouncing)
        let hoverTimeout;
        const hoverHandler = function(e) {
          clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(function() {
            const element = getElementSelector(e.target);
            sendRecordingEvent('browser_hover', {
              element: element
            });
          }, 300);
        };
        document.addEventListener('mouseover', hoverHandler, true);

        // Capture scroll events (with throttling)
        let scrollTimeout;
        const scrollHandler = function() {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(function() {
            sendRecordingEvent('browser_scroll', {
              x: window.scrollX || window.pageXOffset,
              y: window.scrollY || window.pageYOffset
            });
          }, 500);
        };
        window.addEventListener('scroll', scrollHandler, true);

        // Store cleanup function
        window.__recordingCleanup = function() {
          // Remove all event listeners if needed
          // Note: We can't easily remove anonymous listeners, but this is fine for re-injection
        };

        // Debug: Log that injection completed
        console.log('✅ Recording event listeners injected for tab: ${tabId}');
        
        // Send a test event after 1 second to verify communication works
        setTimeout(function() {
          sendRecordingEvent('test_injection', { 
            test: true,
            timestamp: Date.now(),
            message: 'Injection test - if you see this, injection is working'
          });
        }, 1000);
      })();
    `;

    try {
      this.webContentsView.webContents.executeJavaScript(injectionCode).then(() => {
        console.log(`✅ Successfully injected recording listeners into tab ${this._id}`);
      }).catch((error) => {
        console.error(`❌ Failed to inject recording listeners into tab ${this._id}:`, error);
      });
    } catch (error) {
      console.error(`❌ Error injecting recording listeners into tab ${this._id}:`, error);
    }
  }

  // Getters
  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get url(): string {
    return this._url;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get webContents() {
    return this.webContentsView.webContents;
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }

  get isWorkspacePage(): boolean {
    return this._isWorkspacePage;
  }

  // Public methods
  show(): void {
    this._isVisible = true;
    this.webContentsView.setVisible(true);
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView.setVisible(false);
  }

  async screenshot(): Promise<NativeImage> {
    return await this.webContentsView.webContents.capturePage();
  }

  async runJs(code: string): Promise<any> {
    return await this.webContentsView.webContents.executeJavaScript(code);
  }

  async getTabHtml(): Promise<string> {
    return await this.runJs("return document.documentElement.outerHTML");
  }

  async getTabText(): Promise<string> {
    return await this.runJs("return document.documentElement.innerText");
  }

  async loadURL(url: string): Promise<void> {
    this._url = url;

    // Handle custom workspace pages
    if (url.startsWith("blueberry://")) {
      this._isWorkspacePage = true; // Mark this tab as a workspace page
      this._workspaceRoute = url; // Preserve route so we can regenerate HTML on refresh
      const renderer = getCustomPageRenderer();
      const workspaceId = url
        .replace("blueberry://workspace/", "")
        .replace("blueberry://", "");
      this._workspaceId = workspaceId && workspaceId !== "home" ? workspaceId : null;
      const html =
        workspaceId && workspaceId !== "home"
          ? await renderer.renderWorkspace(workspaceId)
          : await renderer.renderDefault();

      if (html) {
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
        return this.webContentsView.webContents.loadURL(dataUrl);
      }
      // Fallback to google if no workspace available
      this._isWorkspacePage = false;
      this._workspaceRoute = null;
      this._workspaceId = null;
      return this.webContentsView.webContents.loadURL("https://www.google.com");
    }

    this._isWorkspacePage = false; // Not a workspace page
    this._workspaceRoute = null;
    this._workspaceId = null;
    return this.webContentsView.webContents.loadURL(url);
  }

  /**
   * Regenerate the workspace HTML by reloading the original blueberry:// route.
   * NOTE: We cannot use webContents.reload() because workspace pages are loaded as data: URLs
   * (reloading would just reload the old HTML string).
   */
  private requestWorkspaceRefresh(reason: string): void {
    if (!this._isWorkspacePage) return;
    if (this._workspaceRefreshInProgress) return;

    const route = this._workspaceRoute ?? "blueberry://home";
    this._workspaceRefreshInProgress = true;
    console.log(`🔄 [Tab ${this._id}] Workspace refresh requested (${reason}) -> ${route}`);

    this.loadURL(route)
      .catch((err) => {
        console.warn(`❌ [Tab ${this._id}] Failed to refresh workspace page`, err);
      })
      .finally(() => {
        this._workspaceRefreshInProgress = false;
      });
  }

  /**
   * Inject IPC bridge for workspace pages to save widget positions
   * Uses a polling mechanism to check for widget update events
   */
  private injectWorkspaceIPC(): void {
    const ipcBridge = `
      (function() {
        // Store workspace updates in a queue that the main process can poll
        window.__workspaceUpdates = window.__workspaceUpdates || [];

        // Also check for global refresh flag
        window.__workspaceNeedsRefresh = false;

        // Listen for workspace widget update events
        window.addEventListener('workspace-widget-update', (event) => {
          const { workspaceId, widgetId, x, y, width, height } = event.detail;
          window.__workspaceUpdates.push({
            type: 'widget-update',
            workspaceId, widgetId, x, y, width, height,
            timestamp: Date.now()
          });
          console.log('[Workspace] Queued widget update:', { widgetId, x, y, width, height });
        });

        // Listen for workspace change notifications (DOM events)
        window.addEventListener('workspace-changed', (event) => {
          console.log('[Workspace] Received workspace change notification:', event.detail);
          // Queue the change for polling
          window.__workspaceUpdates.push({
            type: 'workspace-changed',
            workspaceId: event.detail.workspaceId,
            timestamp: Date.now()
          });
        });
      })();
    `;
    
    try {
      this.webContentsView.webContents.executeJavaScript(ipcBridge).catch((err) => {
        console.warn(`Failed to inject workspace IPC bridge:`, err);
      });
      
      // Poll for workspace updates every 500ms
      console.log(`🔄 [Tab ${this._id}] Starting workspace polling (interval: 500ms)`);
      const pollInterval = setInterval(() => {
        if (this._isWorkspacePage) {
          this.webContentsView.webContents.executeJavaScript(`
            (function() {
              const result = { updates: [], needsRefresh: false };

              if (window.__workspaceUpdates && window.__workspaceUpdates.length > 0) {
                result.updates = window.__workspaceUpdates.splice(0);
              }

              if (window.__workspaceNeedsRefresh) {
                result.needsRefresh = true;
                window.__workspaceNeedsRefresh = false;
              }

              return result;
            })();
          `).then((result: { updates: any[], needsRefresh: boolean }) => {
            // Handle refresh flag
            if (result.needsRefresh) {
              console.log(`🔄 [Tab ${this._id}] Workspace needs refresh, regenerating workspace HTML now`);
              this.requestWorkspaceRefresh("needsRefresh-flag");
            }

            // Handle queued updates
            if (result.updates && result.updates.length > 0) {
              console.log(`[Tab ${this._id}] 📥 Received ${result.updates.length} updates from workspace page`);
              result.updates.forEach(async (update) => {
                console.log(`[Tab ${this._id}] Processing update:`, update.type, update);
                if (update.type === 'workspace-changed') {
                  console.log(`[Tab ${this._id}] Processing workspace change, regenerating workspace HTML...`);
                  this.requestWorkspaceRefresh("workspace-changed");
                } else if (update.type === 'widget-update') {
                  console.log(`[Tab ${this._id}] 📝 Persisting widget size/position update...`);
                  await this.persistWidgetUpdate(update).catch((err) => {
                    console.warn('[Tab] Failed to persist widget update', err);
                  });
                  // Note: No reload needed for drag/resize - DOM is already updated
                  // The data has been persisted to JSON for next app load
                } else if (update.type === 'widget-nav') {
                  console.log(`[Tab ${this._id}] 🔗 Persisting widget URL update...`);
                  await this.persistWidgetUpdate(update).catch((err) => {
                    console.warn('[Tab] Failed to persist widget URL update', err);
                  });
                } else if (update.type === 'widget-delete') {
                  console.log(`[Tab ${this._id}] 🗑️ Persisting widget DELETE...`);
                  await this.persistWidgetDelete(update).catch((err) => {
                    console.warn('[Tab] Failed to delete widget', err);
                  });
                  console.log(`[Tab ${this._id}] ✅ Widget deleted from storage`);
                  // Note: No reload needed - widget already removed from DOM by close handler
                  // The data has been persisted to JSON for next app load
                } else if (update.type === 'widget-zoom') {
                  const { widgetId, deltaY } = update;
                  await this.zoomWidgetFromWheelDelta(widgetId, deltaY);
                } else if (update.type === 'webview-resize') {
                  // Handle webview resize request from renderer
                  const { widgetId, width, height } = update;
                  console.log(`[Tab ${this._id}] 🔧 Resizing webview for widget ${widgetId} to ${width}x${height}`);
                  await this.resizeWebviewForWidget(widgetId, width, height);
                }
              });
            }
          }).catch(() => {
            // Page might have navigated away, clear interval
            clearInterval(pollInterval);
          });
        } else {
          clearInterval(pollInterval);
        }
      }, 500);
      
      // Clean up interval when tab is destroyed or navigates away
      this.webContentsView.webContents.on('did-navigate', () => {
        clearInterval(pollInterval);
      });
    } catch (error) {
      console.warn(`Failed to inject workspace IPC bridge:`, error);
    }
  }

  goBack(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoBack()) {
      this.webContentsView.webContents.navigationHistory.goBack();
    }
  }

  goForward(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoForward()) {
      this.webContentsView.webContents.navigationHistory.goForward();
    }
  }

  reload(): void {
    this.webContentsView.webContents.reload();
  }

  stop(): void {
    this.webContentsView.webContents.stop();
  }

  destroy(): void {
    this.webContentsView.webContents.close();
  }

  /**
   * Resize a webview's guest viewport by finding it via widget ID and resizing its WebContents
   */
  private async resizeWebviewForWidget(widgetId: string, width: number, height: number): Promise<void> {
    try {
      // Find the webview element in the renderer by widget ID and get its WebContents ID
      const webviewInfo = await this.webContentsView.webContents.executeJavaScript(`
        (function() {
          const container = document.querySelector('.widget-container[data-widget-id="${widgetId}"]');
          if (!container) return null;
          const wv = container.querySelector('webview');
          if (!wv) return null;

          let webContentsId = null;
          try {
            if (typeof wv.getWebContentsId === 'function') {
              webContentsId = wv.getWebContentsId();
            }
          } catch {
            // ignore
          }

          return { webContentsId };
        })();
      `);

      if (!webviewInfo || webviewInfo.webContentsId === null || webviewInfo.webContentsId === undefined) {
        return;
      }

      // If we have WebContents ID, use it to find and inject resize code into the guest webview
      const { webContents } = require('electron');
      const allWebContents = webContents.getAllWebContents();
      const targetWebContents = allWebContents.find((wc: any) => wc.id === webviewInfo.webContentsId);
      if (!targetWebContents) return;

      // Register the guest webContents for per-widget controls (Ctrl+wheel zoom, etc.)
      await this.registerWidgetGuestWebContents(widgetId, targetWebContents);

      // Best-effort nudge for guest viewport sizing (no-op on many sites, but safe)
      await targetWebContents.executeJavaScript(`
        (function() {
          try {
            if (typeof window.resizeTo === 'function') {
              window.resizeTo(${width}, ${height});
            }
          } catch {}
          try {
            window.dispatchEvent(new Event('resize'));
          } catch {}
          try {
            if (document.documentElement) {
              document.documentElement.style.height = '${height}px';
              document.documentElement.style.minHeight = '${height}px';
              document.documentElement.style.maxHeight = '${height}px';
            }
            if (document.body) {
              document.body.style.height = '${height}px';
              document.body.style.minHeight = '${height}px';
              document.body.style.maxHeight = '${height}px';
              document.body.style.overflow = 'auto';
            }
            if (document.body && document.body.offsetHeight) {
              document.body.offsetHeight; // force reflow
            }
          } catch {}
          return true;
        })();
      `);
    } catch (error) {
      console.error(`[Tab ${this._id}] Failed to resize webview for widget ${widgetId}:`, error);
    }
  }

  private clampZoomFactor(next: number): number {
    // Keep within sane bounds (Chromium allows more, but UX gets weird fast).
    const min = 0.25;
    const max = 5;
    return Math.max(min, Math.min(max, next));
  }

  private schedulePersistWidgetZoom(widgetId: string, zoomFactor: number): void {
    const workspaceId = this._workspaceId;
    if (!workspaceId) return;

    const existing = this.widgetZoomPersistTimersByWidgetId.get(widgetId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.persistWidgetUpdate({ workspaceId, widgetId, zoomFactor }).catch((err) => {
        console.warn("[Tab] Failed to persist widget zoomFactor", { widgetId, zoomFactor }, err);
      });
    }, 250);

    this.widgetZoomPersistTimersByWidgetId.set(widgetId, timer);
  }

  private async applySavedWidgetZoomIfNeeded(widgetId: string, guestWebContents: any): Promise<void> {
    if (this.widgetZoomAppliedWidgetIds.has(widgetId)) return;
    this.widgetZoomAppliedWidgetIds.add(widgetId);

    try {
      const workspaceId = this._workspaceId;
      if (!workspaceId) return;

      const workspace = await getWorkspaceManager().getWorkspace(workspaceId);
      if (!workspace) return;

      const widget = workspace.widgets.find((w) => w.id === widgetId);
      if (!widget) return;

      const zoomFactor =
        typeof widget.zoomFactor === "number" && Number.isFinite(widget.zoomFactor)
          ? widget.zoomFactor
          : 1;

      const clamped = this.clampZoomFactor(zoomFactor);
      this.widgetZoomFactorByWidgetId.set(widgetId, clamped);

      if (guestWebContents && typeof guestWebContents.setZoomFactor === "function") {
        guestWebContents.setZoomFactor(clamped);
      }
    } catch {
      // ignore
    }
  }

  private async getGuestWebContentsForWidget(widgetId: string): Promise<any | null> {
    // Fast path: cached mapping (typically set by webview-resize registration)
    let webContentsId = this.widgetGuestWebContentsIdByWidgetId.get(widgetId) ?? null;

    // Slow path: query the embedder DOM for the <webview>'s WebContents ID
    if (!webContentsId) {
      try {
        const info = await this.webContentsView.webContents.executeJavaScript(`
          (function() {
            const container = document.querySelector('.widget-container[data-widget-id="${widgetId}"]');
            if (!container) return null;
            const wv = container.querySelector('webview');
            if (!wv) return null;

            let id = null;
            try {
              if (typeof wv.getWebContentsId === 'function') {
                id = wv.getWebContentsId();
              }
            } catch {}

            return { webContentsId: id };
          })();
        `);
        if (info && typeof info.webContentsId === "number") {
          webContentsId = info.webContentsId;
        }
      } catch {
        // ignore
      }
    }

    if (!webContentsId) return null;

    try {
      const { webContents } = require("electron");
      const target =
        typeof webContents.fromId === "function"
          ? webContents.fromId(webContentsId)
          : webContents.getAllWebContents().find((wc: any) => wc.id === webContentsId);
      if (!target) return null;

      await this.registerWidgetGuestWebContents(widgetId, target);
      return target;
    } catch {
      return null;
    }
  }

  private async zoomWidgetFromWheelDelta(widgetId: string, deltaY: number): Promise<void> {
    if (!widgetId) return;
    if (typeof deltaY !== "number" || !Number.isFinite(deltaY)) return;

    const direction = deltaY < 0 ? 1 : -1; // wheel up -> zoom in, wheel down -> zoom out
    const now = Date.now();
    const lastAt = this.widgetLastZoomAppliedAtByWidgetId.get(widgetId) ?? 0;
    const lastDir = this.widgetLastZoomDirectionByWidgetId.get(widgetId) ?? 0;
    if (now - lastAt < 8 && direction === lastDir) return;
    this.widgetLastZoomAppliedAtByWidgetId.set(widgetId, now);
    this.widgetLastZoomDirectionByWidgetId.set(widgetId, direction);

    const guest = await this.getGuestWebContentsForWidget(widgetId);
    if (!guest) return;

    const step = 0.1;

    const current =
      this.widgetZoomFactorByWidgetId.get(widgetId) ??
      (typeof guest.getZoomFactor === "function" ? guest.getZoomFactor() : 1);

    const next = this.clampZoomFactor(current + direction * step);
    if (typeof guest.setZoomFactor === "function") {
      guest.setZoomFactor(next);
    }
    this.widgetZoomFactorByWidgetId.set(widgetId, next);
    this.schedulePersistWidgetZoom(widgetId, next);
  }

  private async registerWidgetGuestWebContents(widgetId: string, guestWebContents: any): Promise<void> {
    if (!guestWebContents || typeof guestWebContents.id !== "number") return;

    const guestId = guestWebContents.id as number;
    this.widgetGuestWebContentsIdByWidgetId.set(widgetId, guestId);
    this.widgetIdByGuestWebContentsId.set(guestId, widgetId);

    await this.applySavedWidgetZoomIfNeeded(widgetId, guestWebContents);

    if (this.widgetZoomListenerAttachedGuestIds.has(guestId)) return;
    this.widgetZoomListenerAttachedGuestIds.add(guestId);

    // Note: Ctrl+wheel / Ctrl± zoom is handled inside widget guest via `src/preload/widget-webview.ts`.
    // We still register guests for applying persisted zoomFactor on startup and for resize bookkeeping.

    guestWebContents.once("destroyed", () => {
      this.widgetZoomListenerAttachedGuestIds.delete(guestId);
      this.widgetIdByGuestWebContentsId.delete(guestId);
      const mapped = this.widgetGuestWebContentsIdByWidgetId.get(widgetId);
      if (mapped === guestId) {
        this.widgetGuestWebContentsIdByWidgetId.delete(widgetId);
      }
      this.widgetZoomAppliedWidgetIds.delete(widgetId);
      this.widgetZoomFactorByWidgetId.delete(widgetId);
      const t = this.widgetZoomPersistTimersByWidgetId.get(widgetId);
      if (t) clearTimeout(t);
      this.widgetZoomPersistTimersByWidgetId.delete(widgetId);
    });
  }
}
