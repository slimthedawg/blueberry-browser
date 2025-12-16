import { BaseWindow, shell, ipcMain, screen } from "electron";
import { Tab } from "./Tab";
import { TopBar } from "./TopBar";
import { SideBar } from "./SideBar";
import { getBrowserStateManager } from "./BrowserStateManager";
import { getRecordingManager } from "./RecordingManager";
import { EventManager } from "./EventManager";
import { getDarkModeManager } from "./DarkModeManager";
import { getWorkspaceManager } from "./WorkspaceManager";
import { getWindowStateManager } from "./WindowStateManager";

export class Window {
  private _baseWindow: BaseWindow;
  private tabsMap: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private tabCounter: number = 0;
  private _topBar: TopBar;
  private _sideBar: SideBar;

  constructor() {
    // Get screen dimensions
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenWidth = primaryDisplay.workAreaSize.width;
    const screenHeight = primaryDisplay.workAreaSize.height;

    // Default window bounds (centered)
    const defaultBounds = {
      width: Math.min(1900, screenWidth - 100),
      height: Math.min(1000, screenHeight - 100),
      x: Math.floor((screenWidth - Math.min(1900, screenWidth - 100)) / 2),
      y: Math.floor((screenHeight - Math.min(1000, screenHeight - 100)) / 2),
    };

    // Create the browser window with default bounds
    this._baseWindow = new BaseWindow({
      ...defaultBounds,
      show: false, // Don't show until we've loaded saved state
      autoHideMenuBar: false,
      titleBarStyle: "hidden",
      ...(process.platform !== "darwin" ? { 
        titleBarOverlay: {
          color: "#141414", // Match topbar background (dark mode default, will update on renderer load)
          symbolColor: "#fafafa", // Match topbar foreground text color
          height: 32, // Chrome-style: just enough for window controls at the top
        } 
      } : {}),
      trafficLightPosition: { x: 15, y: 13 },
    });

    // Load and apply saved window state
    this.loadAndApplyWindowState(screenWidth, screenHeight);

    this._baseWindow.setMinimumSize(1000, 800);

    // Create sidebar and tabs first (lower z-order)
    this._sideBar = new SideBar(this._baseWindow);
    
    // Set the window reference on the LLM client to avoid circular dependency
    this._sideBar.client.setWindow(this);

    // Create the first tab
    this.createTab();

    // Create topbar last so it's on top (for popups)
    this._topBar = new TopBar(this._baseWindow);

    // Set up window resize handler
    this._baseWindow.on("resize", () => {
      this.updateTabBounds();
      this._topBar.updateBounds();
      this._sideBar.updateBounds();
      // Notify renderer of resize through active tab
      const bounds = this._baseWindow.getBounds();
      if (this.activeTab) {
        this.activeTab.webContents.send("window-resized", {
          width: bounds.width,
          height: bounds.height,
        });
      }
      // Save window state on resize
      this.saveWindowState();
    });

    // Save window state on move
    this._baseWindow.on("moved", () => {
      this.saveWindowState();
    });

    // Handle external link opening
    this.tabsMap.forEach((tab) => {
      tab.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: "deny" };
      });
    });

    this.setupEventListeners();
    this.setupDarkModeListener();
    
    // Initialize dark mode manager
    const darkModeManager = getDarkModeManager();
    darkModeManager.setWindow(this);
    darkModeManager.setupIpcHandlers();

    // Ensure a default workspace exists for blueberry://home
    const workspaceManager = getWorkspaceManager();
    workspaceManager.ensureDefaultWorkspace().catch((err) =>
      console.warn("Failed to ensure default workspace", err)
    );
  }

  private setupEventListeners(): void {
    this._baseWindow.on("closed", () => {
      // Save window state before closing
      this.saveWindowState();
      // Clean up all tabs when window is closed
      this.tabsMap.forEach((tab) => tab.destroy());
      this.tabsMap.clear();
    });
  }

  private async loadAndApplyWindowState(screenWidth: number, screenHeight: number): Promise<void> {
    try {
      const windowStateManager = getWindowStateManager();
      const savedState = await windowStateManager.getWindowState();
      
      if (savedState) {
        const validated = windowStateManager.validateBounds(savedState, screenWidth, screenHeight);
        this._baseWindow.setBounds(validated);
      }
    } catch (error) {
      console.warn("Failed to load window state:", error);
    } finally {
      // Show window after state is loaded (or if loading fails)
      this._baseWindow.show();
    }
  }

  private saveWindowState(): void {
    try {
      const bounds = this._baseWindow.getBounds();
      const windowStateManager = getWindowStateManager();
      windowStateManager.saveWindowState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
    } catch (error) {
      console.error("Failed to save window state:", error);
    }
  }

  private setupDarkModeListener(): void {
    // Dark mode is now handled by DarkModeManager
    // This method is kept for compatibility but does nothing
  }

  // Getters
  get window(): BaseWindow {
    return this._baseWindow;
  }

  get activeTab(): Tab | null {
    if (this.activeTabId) {
      return this.tabsMap.get(this.activeTabId) || null;
    }
    return null;
  }

  get allTabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get tabCount(): number {
    return this.tabsMap.size;
  }

  // Tab management methods
  createTab(url?: string): Tab {
    const tabId = `tab-${++this.tabCounter}`;
    // Default new-tab behavior:
    // - First tab (no existing workspace): open the workspace (blueberry://home)
    // - Subsequent tabs created without an explicit URL (TopBar + button): open google.com
    //   to avoid opening multiple workspace tabs (known to cause bugs).
    const workspaceTabCountBefore = Array.from(this.tabsMap.values()).filter((t) => t.isWorkspacePage).length;
    const shouldAvoidWorkspaceDuplicate = !url && workspaceTabCountBefore > 0;
    const initialUrl = shouldAvoidWorkspaceDuplicate ? "https://www.google.com" : (url ?? "blueberry://home");
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e1ac0707-feb3-482d-ac8f-58cfcccea29a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'tabs-1',hypothesisId:'H1',location:'src/main/Window.ts:createTab',message:'window_create_tab',data:{tabId, urlArg:url, initialUrl, tabCountBefore:this.tabsMap.size, workspaceTabCountBefore},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const tab = new Tab(tabId, initialUrl);

    // Add the tab's WebContentsView to the window
    this._baseWindow.contentView.addChildView(tab.view);

    // Set the bounds to fill the window below the topbar and to the left of sidebar
    const bounds = this._baseWindow.getBounds();
    tab.view.setBounds({
      x: 0,
      y: 88, // Start below the topbar
      width: bounds.width - 400, // Subtract sidebar width
      height: bounds.height - 88, // Subtract topbar height
    });

    // Start tracking console logs for this tab
    const stateManager = getBrowserStateManager();
    stateManager.startTrackingConsole(tab.webContents, tabId);

    // Track page state updates
    tab.webContents.on("did-finish-load", () => {
      const url = tab.webContents.getURL();
      const title = tab.webContents.getTitle();
      stateManager.updatePageState(tabId, url, title);
    });

    // Store the tab
    this.tabsMap.set(tabId, tab);

    // If this is the first tab, make it active
    if (this.tabsMap.size === 1) {
      this.switchActiveTab(tabId);
    } else {
      // Hide the tab initially if it's not the first one
      tab.hide();
    }

    return tab;
  }

  closeTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    // Stop tracking and clear state for this tab
    const stateManager = getBrowserStateManager();
    stateManager.clearTabState(tabId);

    // Remove the WebContentsView from the window
    this._baseWindow.contentView.removeChildView(tab.view);

    // Destroy the tab
    tab.destroy();

    // Remove from our tabs map
    this.tabsMap.delete(tabId);

    // If this was the active tab, switch to another tab
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      const remainingTabs = Array.from(this.tabsMap.keys());
      if (remainingTabs.length > 0) {
        this.switchActiveTab(remainingTabs[0]);
      }
    }

    // If no tabs left, close the window
    if (this.tabsMap.size === 0) {
      this._baseWindow.close();
    }

    return true;
  }

  switchActiveTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    // Hide the currently active tab
    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.tabsMap.get(this.activeTabId);
      if (currentTab) {
        currentTab.hide();
      }
    }

    // Show the new active tab
    tab.show();
    this.activeTabId = tabId;

    // Update the window title to match the tab title
    this._baseWindow.setTitle(tab.title || "Blueberry Browser");

    return true;
  }

  getTab(tabId: string): Tab | null {
    return this.tabsMap.get(tabId) || null;
  }

  // Window methods
  show(): void {
    this._baseWindow.show();
  }

  hide(): void {
    this._baseWindow.hide();
  }

  close(): void {
    this._baseWindow.close();
  }

  focus(): void {
    this._baseWindow.focus();
  }

  minimize(): void {
    this._baseWindow.minimize();
  }

  maximize(): void {
    this._baseWindow.maximize();
  }

  unmaximize(): void {
    this._baseWindow.unmaximize();
  }

  isMaximized(): boolean {
    return this._baseWindow.isMaximized();
  }

  setTitle(title: string): void {
    this._baseWindow.setTitle(title);
  }

  setBounds(bounds: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): void {
    this._baseWindow.setBounds(bounds);
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return this._baseWindow.getBounds();
  }

  // Handle window resize to update tab bounds
  private updateTabBounds(): void {
    const bounds = this._baseWindow.getBounds();
    // Only subtract sidebar width if it's visible
    const sidebarWidth = this._sideBar.getIsVisible() ? this._sideBar.getWidth() : 0;

    this.tabsMap.forEach((tab) => {
      tab.view.setBounds({
        x: 0,
        y: 88, // Start below the topbar
        width: bounds.width - sidebarWidth,
        height: bounds.height - 88, // Subtract topbar height
      });
    });
  }

  // Public method to update all bounds when sidebar is toggled
  updateAllBounds(): void {
    this.updateTabBounds();
    this._sideBar.updateBounds();
  }

  // Bring topbar to front (for popups to appear above other views)
  bringTopBarToFront(): void {
    const topBarView = this._topBar.view;
    // Expand first (while still in place) to avoid flash
    this._topBar.expandForPopups();
    // Then remove and re-add to bring to front
    try {
      this._baseWindow.contentView.removeChildView(topBarView);
      this._baseWindow.contentView.addChildView(topBarView);
    } catch (error) {
      console.error('Failed to bring topbar to front:', error);
    }
  }

  // Restore topbar to normal size
  restoreTopBarBounds(): void {
    this._topBar.restoreBounds();
  }

  // Getter for sidebar to access from main process
  get sidebar(): SideBar {
    return this._sideBar;
  }

  // Getter for topBar to access from main process
  get topBar(): TopBar {
    return this._topBar;
  }

  // Getter for all tabs as array
  get tabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  // Getter for baseWindow to access from Menu
  get baseWindow(): BaseWindow {
    return this._baseWindow;
  }
}
