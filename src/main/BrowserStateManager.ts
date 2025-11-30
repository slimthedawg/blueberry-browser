/**
 * BrowserStateManager - Tracks browser state, console logs, screenshots, and page state
 * Inspired by mcp-browser-agent's state management patterns
 */
import type { WebContents } from "electron";
import { app } from "electron";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";

export interface ConsoleLog {
  level: "log" | "info" | "warn" | "error" | "debug";
  message: string;
  timestamp: number;
  source?: string;
}

export interface ScreenshotInfo {
  name: string;
  path: string;
  timestamp: number;
  tabId: string;
  url?: string;
}

export interface PageState {
  url: string;
  title: string;
  timestamp: number;
  consoleLogs: ConsoleLog[];
  screenshot?: string; // Screenshot name
}

export class BrowserStateManager {
  private consoleLogs: Map<string, ConsoleLog[]> = new Map(); // tabId -> logs
  private screenshots: Map<string, ScreenshotInfo> = new Map(); // name -> info
  private pageStates: Map<string, PageState> = new Map(); // tabId -> state
  private screenshotDir: string;

  constructor() {
    // Create screenshots directory
    const userDataPath = app.getPath("userData");
    this.screenshotDir = join(userDataPath, "screenshots");
    if (!existsSync(this.screenshotDir)) {
      mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  /**
   * Start tracking console logs for a webContents
   */
  startTrackingConsole(webContents: WebContents, tabId: string): void {
    // Clear existing logs for this tab
    this.consoleLogs.set(tabId, []);

    // Listen to console messages
    // Note: console-message uses old format (level, message, line, sourceId) but is deprecated
    // We'll use it for now until Electron provides a clear migration path
    (webContents as any).on("console-message", (level: number, message: string, line: number, sourceId?: string) => {
      const log: ConsoleLog = {
        level: this.mapConsoleLevel(level),
        message: String(message || ''),
        timestamp: Date.now(),
        source: sourceId ? `line ${line}` : undefined,
      };
      this.addConsoleLog(tabId, log);
    });

    // Listen to console API calls (console.log, console.error, etc.)
    webContents.on("did-fail-load", () => {
      this.addConsoleLog(tabId, {
        level: "error",
        message: "Page failed to load",
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Stop tracking console logs for a tab
   */
  stopTrackingConsole(_tabId: string): void {
    // Keep logs but stop listening
    // Could remove logs if needed: this.consoleLogs.delete(tabId);
  }

  /**
   * Add a console log entry
   */
  addConsoleLog(tabId: string, log: ConsoleLog): void {
    const logs = this.consoleLogs.get(tabId) || [];
    logs.push(log);
    // Keep last 100 logs per tab
    if (logs.length > 100) {
      logs.shift();
    }
    this.consoleLogs.set(tabId, logs);
  }

  /**
   * Get console logs for a tab
   */
  getConsoleLogs(tabId: string, limit?: number): ConsoleLog[] {
    const logs = this.consoleLogs.get(tabId) || [];
    if (limit) {
      return logs.slice(-limit);
    }
    return logs;
  }

  /**
   * Get recent error logs for a tab
   */
  getErrorLogs(tabId: string, limit: number = 10): ConsoleLog[] {
    const logs = this.consoleLogs.get(tabId) || [];
    return logs.filter((log) => log.level === "error").slice(-limit);
  }

  /**
   * Save a screenshot
   */
  async saveScreenshot(
    tabId: string,
    name: string,
    imageBuffer: Buffer,
    url?: string
  ): Promise<string> {
    const timestamp = Date.now();
    const filename = `${name}_${timestamp}.png`;
    const filepath = join(this.screenshotDir, filename);

    writeFileSync(filepath, imageBuffer);

    const screenshotInfo: ScreenshotInfo = {
      name,
      path: filepath,
      timestamp,
      tabId,
      url,
    };

    this.screenshots.set(name, screenshotInfo);
    return filepath;
  }

  /**
   * Get screenshot info by name
   */
  getScreenshot(name: string): ScreenshotInfo | undefined {
    return this.screenshots.get(name);
  }

  /**
   * Get all screenshots for a tab
   */
  getScreenshotsForTab(tabId: string): ScreenshotInfo[] {
    return Array.from(this.screenshots.values()).filter((s) => s.tabId === tabId);
  }

  /**
   * Update page state for a tab
   */
  updatePageState(tabId: string, url: string, title: string, screenshot?: string): void {
    const logs = this.getConsoleLogs(tabId);
    const state: PageState = {
      url,
      title,
      timestamp: Date.now(),
      consoleLogs: logs,
      screenshot,
    };
    this.pageStates.set(tabId, state);
  }

  /**
   * Get current page state for a tab
   */
  getPageState(tabId: string): PageState | undefined {
    return this.pageStates.get(tabId);
  }

  /**
   * Get error context for a tab (useful for error messages)
   */
  getErrorContext(tabId: string): {
    url?: string;
    title?: string;
    recentErrors: ConsoleLog[];
    lastScreenshot?: string;
  } {
    const state = this.pageStates.get(tabId);
    const errors = this.getErrorLogs(tabId, 5);
    const screenshots = this.getScreenshotsForTab(tabId);
    const lastScreenshot = screenshots.length > 0 ? screenshots[screenshots.length - 1].name : undefined;

    return {
      url: state?.url,
      title: state?.title,
      recentErrors: errors,
      lastScreenshot,
    };
  }

  /**
   * Clear state for a tab (when tab is closed)
   */
  clearTabState(tabId: string): void {
    this.consoleLogs.delete(tabId);
    this.pageStates.delete(tabId);
    // Keep screenshots (they're stored on disk)
  }

  /**
   * Map Electron console level to our log level
   */
  private mapConsoleLevel(level: number): "log" | "info" | "warn" | "error" | "debug" {
    // Electron console levels: 0=log, 1=info, 2=warn, 3=error
    switch (level) {
      case 0:
        return "log";
      case 1:
        return "info";
      case 2:
        return "warn";
      case 3:
        return "error";
      default:
        return "debug";
    }
  }

  /**
   * Get screenshot directory path
   */
  getScreenshotDir(): string {
    return this.screenshotDir;
  }
}

// Singleton instance
let stateManagerInstance: BrowserStateManager | null = null;

export function getBrowserStateManager(): BrowserStateManager {
  if (!stateManagerInstance) {
    stateManagerInstance = new BrowserStateManager();
  }
  return stateManagerInstance;
}

