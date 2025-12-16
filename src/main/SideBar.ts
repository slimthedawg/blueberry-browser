import { is } from "@electron-toolkit/utils";
import { BaseWindow, WebContentsView } from "electron";
import { join } from "path";
import { LLMClient } from "./LLMClient";

export class SideBar {
  private webContentsView: WebContentsView;
  private baseWindow: BaseWindow;
  private llmClient: LLMClient;
  private isVisible: boolean = true;
  private width: number = 400; // Default width, can be resized

  constructor(baseWindow: BaseWindow) {
    this.baseWindow = baseWindow;
    this.webContentsView = this.createWebContentsView();
    baseWindow.contentView.addChildView(this.webContentsView);
    this.setupBounds();

    // Initialize LLM client
    this.llmClient = new LLMClient(this.webContentsView.webContents);
  }

  private createWebContentsView(): WebContentsView {
    const webContentsView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/sidebar.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Need to disable sandbox for preload to work
      },
    });

    // Load the Sidebar React app
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      // In development, load through Vite dev server
      const sidebarUrl = new URL(
        "/sidebar/",
        process.env["ELECTRON_RENDERER_URL"]
      );
      webContentsView.webContents.loadURL(sidebarUrl.toString());
    } else {
      webContentsView.webContents.loadFile(
        join(__dirname, "../renderer/sidebar/index.html")
      );
    }

    return webContentsView;
  }

  private setupBounds(): void {
    if (!this.isVisible) return;

    const bounds = this.baseWindow.getBounds();
    this.webContentsView.setBounds({
      x: bounds.width - this.width, // Dynamic width sidebar on the right
      y: 88, // Start below the topbar
      width: this.width,
      height: bounds.height - 88, // Subtract topbar height
    });
  }

  updateBounds(): void {
    if (this.isVisible) {
      this.setupBounds();
    } else {
      // Hide the sidebar
      this.webContentsView.setBounds({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });
    }
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }

  get client(): LLMClient {
    return this.llmClient;
  }

  show(): void {
    this.isVisible = true;
    this.setupBounds();
  }

  hide(): void {
    this.isVisible = false;
    this.webContentsView.setBounds({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  getWidth(): number {
    return this.width;
  }

  setWidth(newWidth: number): void {
    // Constrain width between 300px and 800px
    const constrainedWidth = Math.max(300, Math.min(800, newWidth));
    
    // Only update if width actually changed
    if (this.width === constrainedWidth) {
      return;
    }
    
    this.width = constrainedWidth;
    this.setupBounds();
  }
}
