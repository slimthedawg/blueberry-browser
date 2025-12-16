import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

const WINDOW_STATE_FILE = join(app.getPath("userData"), "window-state.json");

async function readWindowState(): Promise<WindowState | null> {
  try {
    const content = await fs.readFile(WINDOW_STATE_FILE, "utf-8");
    return JSON.parse(content) as WindowState;
  } catch {
    return null;
  }
}

async function writeWindowState(state: WindowState): Promise<void> {
  try {
    await fs.writeFile(WINDOW_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save window state:", error);
  }
}

export class WindowStateManager {
  private static instance: WindowStateManager | null = null;

  static getInstance(): WindowStateManager {
    if (!WindowStateManager.instance) {
      WindowStateManager.instance = new WindowStateManager();
    }
    return WindowStateManager.instance;
  }

  private constructor() {}

  async getWindowState(): Promise<WindowState | null> {
    return await readWindowState();
  }

  async saveWindowState(state: WindowState): Promise<void> {
    await writeWindowState(state);
  }

  /**
   * Validate window bounds to ensure window is visible on screen
   */
  validateBounds(bounds: WindowState, screenWidth: number, screenHeight: number): WindowState {
    const minWidth = 1000;
    const minHeight = 800;
    const margin = 50; // Minimum margin from screen edges

    let { x, y, width, height } = bounds;

    // Ensure minimum size
    width = Math.max(width, minWidth);
    height = Math.max(height, minHeight);

    // Ensure window is not too large
    width = Math.min(width, screenWidth - margin * 2);
    height = Math.min(height, screenHeight - margin * 2);

    // Ensure window is within screen bounds
    if (x < margin) x = margin;
    if (y < margin) y = margin;
    if (x + width > screenWidth - margin) {
      x = screenWidth - width - margin;
    }
    if (y + height > screenHeight - margin) {
      y = screenHeight - height - margin;
    }

    // If window is completely off-screen, center it
    if (x < 0 || y < 0 || x + width > screenWidth || y + height > screenHeight) {
      x = Math.max(margin, (screenWidth - width) / 2);
      y = Math.max(margin, (screenHeight - height) / 2);
    }

    return { x, y, width, height };
  }
}

export function getWindowStateManager(): WindowStateManager {
  return WindowStateManager.getInstance();
}

