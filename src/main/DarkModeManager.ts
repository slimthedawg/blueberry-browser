import { nativeTheme, ipcMain } from "electron";
import type { Window } from "./Window";

/**
 * Centralized dark mode manager
 * Uses Electron's nativeTheme API for natural browser view dark mode
 * Synchronizes sidebar and topbar dark mode state
 */
export class DarkModeManager {
  private window: Window | null = null;
  private isDarkMode: boolean = false;
  private themeSource: "system" | "light" | "dark" = "system";

  constructor() {
    // Initialize from system preference
    this.isDarkMode = nativeTheme.shouldUseDarkColors;
    
    // Set initial theme source to follow system
    nativeTheme.themeSource = "system";
    this.themeSource = "system";
    
    // Listen for system theme changes
    nativeTheme.on("updated", () => {
      // Only update if we're following system
      if (this.themeSource === "system") {
        const systemIsDark = nativeTheme.shouldUseDarkColors;
        this.setDarkMode(systemIsDark, false); // Don't change themeSource
      }
    });
  }

  setWindow(window: Window): void {
    this.window = window;
    // Apply initial dark mode to all tabs
    this.applyDarkModeToTabs();
  }

  /**
   * Set dark mode state
   * @param isDarkMode - Whether dark mode should be enabled
   * @param updateThemeSource - Whether to update nativeTheme.themeSource (default: true)
   */
  setDarkMode(isDarkMode: boolean, updateThemeSource: boolean = true): void {
    this.isDarkMode = isDarkMode;
    
    // Update Electron's nativeTheme (this affects WebContents naturally)
    if (updateThemeSource && this.themeSource !== "system") {
      nativeTheme.themeSource = isDarkMode ? "dark" : "light";
    }
    
    // Broadcast to sidebar and topbar
    this.broadcastToRenderers();
    
    // Apply to all browser tabs using nativeTheme (no manual CSS injection)
    this.applyDarkModeToTabs();
    
    // Update window title bar overlay
    if (this.window) {
      this.updateTitleBarOverlay();
    }
  }

  /**
   * Set theme source (system, light, or dark)
   */
  setThemeSource(source: "system" | "light" | "dark"): void {
    this.themeSource = source;
    nativeTheme.themeSource = source;
    
    if (source === "system") {
      this.setDarkMode(nativeTheme.shouldUseDarkColors, false);
    } else {
      this.setDarkMode(source === "dark", false);
    }
  }

  getThemeSource(): "system" | "light" | "dark" {
    return this.themeSource;
  }

  getDarkMode(): boolean {
    return this.isDarkMode;
  }

  /**
   * Broadcast dark mode state to sidebar and topbar
   */
  private broadcastToRenderers(): void {
    if (!this.window) return;

    // Send to topbar
    this.window.topBar.view.webContents.send("dark-mode-updated", this.isDarkMode);

    // Send to sidebar
    this.window.sidebar.view.webContents.send("dark-mode-updated", this.isDarkMode);
  }

  /**
   * Apply dark mode to browser tabs using nativeTheme
   * This is done automatically by Electron - no manual CSS injection needed
   */
  private applyDarkModeToTabs(): void {
    if (!this.window) return;
    
    // nativeTheme.themeSource is already set, which automatically affects all WebContents
    // No manual CSS injection needed - Electron handles this naturally
    // The browser view will respect the system/app dark mode preference
  }

  /**
   * Update window title bar overlay colors
   */
  private updateTitleBarOverlay(): void {
    if (!this.window || process.platform === "darwin") {
      return; // macOS uses traffic lights, not titleBarOverlay
    }

    const backgroundColor = this.isDarkMode ? "#282828" : "#ffffff";
    const symbolColor = this.isDarkMode ? "#fafafa" : "#141414";

    try {
      const baseWindow = (this.window as any)._baseWindow;
      if (baseWindow && typeof (baseWindow as any).setTitleBarOverlay === "function") {
        (baseWindow as any).setTitleBarOverlay({
          color: backgroundColor,
          symbolColor: symbolColor,
          height: 32,
        });
      } else {
        const browserWindow = (baseWindow as any)?.window;
        if (browserWindow && typeof browserWindow.setTitleBarOverlay === "function") {
          browserWindow.setTitleBarOverlay({
            color: backgroundColor,
            symbolColor: symbolColor,
            height: 32,
          });
        }
      }
    } catch (error) {
      console.error("Failed to update title bar overlay:", error);
    }
  }

  /**
   * Setup IPC handlers for dark mode changes from renderers
   */
  setupIpcHandlers(): void {
    ipcMain.on("dark-mode-changed", (_event, isDarkMode: boolean) => {
      this.setDarkMode(isDarkMode, true);
    });

    // Handle theme source changes (system/light/dark)
    ipcMain.on("theme-source-changed", (_event, source: "system" | "light" | "dark") => {
      this.setThemeSource(source);
    });

    // Provide a way for renderers to get current dark mode state
    ipcMain.handle("get-dark-mode", () => {
      return this.isDarkMode;
    });

    // Provide a way for renderers to get current theme source
    ipcMain.handle("get-theme-source", () => {
      return this.themeSource;
    });
  }
}

// Singleton instance
let darkModeManager: DarkModeManager | null = null;

export function getDarkModeManager(): DarkModeManager {
  if (!darkModeManager) {
    darkModeManager = new DarkModeManager();
  }
  return darkModeManager;
}




