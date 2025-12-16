import { ipcMain, shell, WebContents } from "electron";
import type { Window } from "./Window";
import { getWorkspaceAIChat } from "./WorkspaceAIChat";
import { getRecordingManager } from "./RecordingManager";

export class EventManager {
  private mainWindow: Window;

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Tab management events
    this.handleTabEvents();

    // Topbar events (popups, etc.)
    this.handleTopBarEvents();

    // Sidebar events
    this.handleSidebarEvents();

    // Workspace AI chat (topbar widget/workspace customization chat)
    this.handleWorkspaceAIChatEvents();

    // Page content events
    this.handlePageContentEvents();

    // Dark mode events
    this.handleDarkModeEvents();

    // Agent events
    this.handleAgentEvents();

    // Debug events
    this.handleDebugEvents();
  }

  private async notifyWorkspaceTabsToRefresh(reason: string): Promise<void> {
    const workspaceTabs = this.mainWindow.allTabs.filter((t) => t.isWorkspacePage);
    if (workspaceTabs.length === 0) return;

    console.log(
      `[EventManager] Notifying ${workspaceTabs.length} workspace tab(s) to refresh (${reason})`
    );

    await Promise.allSettled(
      workspaceTabs.map((tab) =>
        tab.webContents.executeJavaScript(`
          (function() {
            window.__workspaceNeedsRefresh = true;
            return true;
          })();
        `)
      )
    );
  }

  private handleWorkspaceAIChatEvents(): void {
    ipcMain.handle("workspace-ai-chat", async (_event, message: string) => {
      const reply = await getWorkspaceAIChat().handleMessage(message);
      // Ensure open workspace pages update immediately after mutations
      await this.notifyWorkspaceTabsToRefresh("workspace-ai-chat");
      return reply;
    });
  }

  private handleTopBarEvents(): void {
    ipcMain.handle("topbar-bring-to-front", () => {
      this.mainWindow.bringTopBarToFront();
      return true;
    });

    ipcMain.handle("topbar-restore-bounds", () => {
      this.mainWindow.restoreTopBarBounds();
      return true;
    });

    ipcMain.handle("show-item-in-folder", (_event, path: string) => {
      if (!path) return false;
      try {
        shell.showItemInFolder(path);
        return true;
      } catch (error) {
        console.warn("Failed to show item in folder:", error);
        return false;
      }
    });
  }

  private handleTabEvents(): void {
    // Create new tab
    ipcMain.handle("create-tab", (_, url?: string) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e1ac0707-feb3-482d-ac8f-58cfcccea29a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'tabs-1',hypothesisId:'H1',location:'src/main/EventManager.ts:create-tab',message:'ipc_create_tab_called',data:{urlArg:url,activeTabId:this.mainWindow.activeTab?.id,activeTabUrl:this.mainWindow.activeTab?.url,tabCount:this.mainWindow.allTabs.length,workspaceTabCount:this.mainWindow.allTabs.filter(t=>t.isWorkspacePage).length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const newTab = this.mainWindow.createTab(url);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e1ac0707-feb3-482d-ac8f-58cfcccea29a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'tabs-1',hypothesisId:'H2',location:'src/main/EventManager.ts:create-tab',message:'ipc_create_tab_result',data:{newTabId:newTab.id,newTabUrl:newTab.url,newTabIsWorkspacePage:newTab.isWorkspacePage,tabCountAfter:this.mainWindow.allTabs.length,workspaceTabCountAfter:this.mainWindow.allTabs.filter(t=>t.isWorkspacePage).length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return { id: newTab.id, title: newTab.title, url: newTab.url };
    });

    // Close tab
    ipcMain.handle("close-tab", (_, id: string) => {
      this.mainWindow.closeTab(id);
    });

    // Switch tab
    ipcMain.handle("switch-tab", (_, id: string) => {
      this.mainWindow.switchActiveTab(id);
    });

    // Get tabs
    ipcMain.handle("get-tabs", () => {
      const activeTabId = this.mainWindow.activeTab?.id;
      return this.mainWindow.allTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isActive: activeTabId === tab.id,
      }));
    });

    // Navigation (for compatibility with existing code)
    ipcMain.handle("navigate-to", (_, url: string) => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.loadURL(url);
      }
    });

    ipcMain.handle("navigate-tab", async (_, tabId: string, url: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        await tab.loadURL(url);
        return true;
      }
      return false;
    });

    ipcMain.handle("go-back", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goBack();
      }
    });

    ipcMain.handle("go-forward", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goForward();
      }
    });

    ipcMain.handle("reload", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.reload();
      }
    });

    // Tab-specific navigation handlers
    ipcMain.handle("tab-go-back", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goBack();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-go-forward", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goForward();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-reload", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.reload();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-screenshot", async (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        const image = await tab.screenshot();
        return image.toDataURL();
      }
      return null;
    });

    ipcMain.handle("tab-run-js", async (_, tabId: string, code: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        return await tab.runJs(code);
      }
      return null;
    });

    // Tab info
    ipcMain.handle("get-active-tab-info", () => {
      const activeTab = this.mainWindow.activeTab;
      if (activeTab) {
        return {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
          canGoBack: activeTab.webContents.canGoBack(),
          canGoForward: activeTab.webContents.canGoForward(),
        };
      }
      return null;
    });
  }

  private handleSidebarEvents(): void {
    // Toggle sidebar
    ipcMain.handle("toggle-sidebar", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
      return true;
    });

    // Resize sidebar (used by SidebarResizeHandle)
    ipcMain.handle("sidebar-resize", (_event, width: number) => {
      this.mainWindow.sidebar.setWidth(width);
      // Sidebar width affects tab bounds
      this.mainWindow.updateAllBounds();
      return true;
    });

    // Get sidebar width
    ipcMain.handle("sidebar-get-width", () => {
      return this.mainWindow.sidebar.getWidth();
    });

    // Chat message
    ipcMain.handle("sidebar-chat-message", async (_, request) => {
      // The LLMClient now handles getting the screenshot and context directly
      await this.mainWindow.sidebar.client.sendChatMessage(request);
    });

    ipcMain.handle("sidebar-abort-chat", () => {
      this.mainWindow.sidebar.client.abortCurrentRequest();
      return true;
    });

    // Clear chat
    ipcMain.handle("sidebar-clear-chat", () => {
      this.mainWindow.sidebar.client.clearMessages();
      return true;
    });

    // Get messages
    ipcMain.handle("sidebar-get-messages", () => {
      return this.mainWindow.sidebar.client.getMessages();
    });

    // Recording controls
    ipcMain.handle("recording-start", (_event, name?: string) => {
      return getRecordingManager().startRecording(name);
    });

    ipcMain.handle("recording-stop", () => {
      return getRecordingManager().stopRecording();
    });

    ipcMain.handle("recording-pause", () => {
      getRecordingManager().pauseRecording();
      return true;
    });

    ipcMain.handle("recording-resume", () => {
      getRecordingManager().resumeRecording();
      return true;
    });

    ipcMain.handle("recording-get-state", () => {
      return getRecordingManager().getRecordingState();
    });

    ipcMain.handle("recording-get-list", () => {
      return getRecordingManager().getRecordingsList();
    });

    ipcMain.handle("recording-load", (_event, id: string) => {
      return getRecordingManager().loadRecording(id);
    });

    ipcMain.handle("recording-delete", (_event, id: string) => {
      return getRecordingManager().deleteRecording(id);
    });

    ipcMain.handle("recording-rename", (_event, id: string, newName: string) => {
      return getRecordingManager().renameRecording(id, newName);
    });

    ipcMain.handle("recording-get-directory", () => {
      return getRecordingManager().getRecordingsDir();
    });

    ipcMain.handle("recording-open-directory", async () => {
      const dir = getRecordingManager().getRecordingsDir();
      try {
        await shell.openPath(dir);
        return true;
      } catch (error) {
        console.warn("Failed to open recordings directory:", error);
        return false;
      }
    });
  }

  private handlePageContentEvents(): void {
    // Get page content
    ipcMain.handle("get-page-content", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabHtml();
        } catch (error) {
          console.error("Error getting page content:", error);
          return null;
        }
      }
      return null;
    });

    // Get page text
    ipcMain.handle("get-page-text", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabText();
        } catch (error) {
          console.error("Error getting page text:", error);
          return null;
        }
      }
      return null;
    });

    // Get current URL
    ipcMain.handle("get-current-url", () => {
      if (this.mainWindow.activeTab) {
        return this.mainWindow.activeTab.url;
      }
      return null;
    });
  }

  private handleDarkModeEvents(): void {
    // Dark mode broadcasting
    ipcMain.on("dark-mode-changed", (event, isDarkMode) => {
      this.broadcastDarkMode(event.sender, isDarkMode);
    });
  }

  private handleAgentEvents(): void {
    // Agent confirmation response
    ipcMain.on("agent-confirmation-response", (_event, data: { id: string; confirmed: boolean }) => {
      // Forward to sidebar webContents
      this.mainWindow.sidebar.view.webContents.send("agent-confirmation-response", data);
    });

    // Agent user guidance request (element selection)
    ipcMain.on("agent-guidance-request", (_event, data: { 
      id: string; 
      message: string; 
      elementType: string;
      stepNumber: number;
    }) => {
      // Forward to sidebar webContents
      this.mainWindow.sidebar.view.webContents.send("agent-guidance-request", data);
    });

    // Agent user guidance response (element selected by user)
    ipcMain.on("agent-guidance-response", (_event, data: { 
      id: string; 
      selector?: string;
      elementInfo?: any;
      cancelled?: boolean;
    }) => {
      // Forward to sidebar webContents
      this.mainWindow.sidebar.view.webContents.send("agent-guidance-response", data);
    });
  }

  private handleDebugEvents(): void {
    // Ping test
    ipcMain.on("ping", () => console.log("pong"));
  }

  private broadcastDarkMode(sender: WebContents, isDarkMode: boolean): void {
    // Send to topbar
    if (this.mainWindow.topBar.view.webContents !== sender) {
      this.mainWindow.topBar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode
      );
    }

    // Send to sidebar
    if (this.mainWindow.sidebar.view.webContents !== sender) {
      this.mainWindow.sidebar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode
      );
    }

    // Send to all tabs
    this.mainWindow.allTabs.forEach((tab) => {
      if (tab.webContents !== sender) {
        tab.webContents.send("dark-mode-updated", isDarkMode);
      }
    });
  }

  // Clean up event listeners
  public cleanup(): void {
    ipcMain.removeAllListeners();
  }
}
