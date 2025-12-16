import { is } from "@electron-toolkit/utils";
import { BaseWindow, WebContentsView } from "electron";
import { join } from "path";

export class TopBar {
  private webContentsView: WebContentsView;
  private baseWindow: BaseWindow;

  constructor(baseWindow: BaseWindow) {
    this.baseWindow = baseWindow;
    this.webContentsView = this.createWebContentsView();
    baseWindow.contentView.addChildView(this.webContentsView);
    this.setupBounds();
  }

  private createWebContentsView(): WebContentsView {
    const webContentsView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/topbar.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Need to disable sandbox for preload to work
      },
    });

    // Set transparent background from the start to avoid white flash
    webContentsView.setBackgroundColor("#00000000");

    // Load the TopBar React app
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      // In development, load through Vite dev server
      const topbarUrl = new URL(
        "/topbar/",
        process.env["ELECTRON_RENDERER_URL"]
      );
      webContentsView.webContents.loadURL(topbarUrl.toString());
    } else {
      webContentsView.webContents.loadFile(
        join(__dirname, "../renderer/topbar/index.html")
      );
    }

    return webContentsView;
  }

  private setupBounds(): void {
    const bounds = this.baseWindow.getBounds();
    // Always keep background transparent to avoid white flash
    this.webContentsView.setBackgroundColor("#00000000");
    this.webContentsView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: 88, // Fixed height for topbar (40px tabs + 48px address bar)
    });
  }

  updateBounds(): void {
    this.setupBounds();
  }

  // Expand topbar to cover full window (for popups) - but keep it transparent
  expandForPopups(): void {
    const bounds = this.baseWindow.getBounds();
    // Ensure background is transparent (no white flash)
    this.webContentsView.setBackgroundColor("#00000000");
    // Expand to full window so popups can render anywhere
    this.webContentsView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    });
  }

  // Restore normal bounds
  restoreBounds(): void {
    // Keep transparent - CSS handles the visual background
    this.webContentsView.setBackgroundColor("#00000000");
    this.setupBounds();
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }
}
