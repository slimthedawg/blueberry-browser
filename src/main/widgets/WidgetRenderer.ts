import { join } from "path";
import { Widget } from "../WorkspaceManager";

/**
 * WidgetRenderer
 * Responsible for preparing widget HTML/CSS payloads.
 * Renders iframes with security sandbox attributes.
 */
export class WidgetRenderer {
  renderIframe(widget: Widget): string {
    // IMPORTANT: <webview> initial styling - will be overridden by syncWebviewToContainer()
    // to use explicit pixel dimensions. Use minimal initial style - JavaScript will set exact pixels.
    // Ensure the webview has a real size IMMEDIATELY at creation time (otherwise Chromium defaults to 300x150
    // and in this app the guest viewport can get stuck at 150px tall).
    // Using top/left/right/bottom lets layout compute the correct pixel size from the container's explicit height.
    const style = `position:absolute;top:0;left:0;right:0;bottom:0;border:none;`;
    const css = widget.css ? `<style>${widget.css}</style>` : "";

    const candidateUrl =
      Array.isArray(widget.historyEntries) &&
      typeof widget.historyIndex === "number" &&
      widget.historyIndex >= 0 &&
      widget.historyIndex < widget.historyEntries.length
        ? widget.historyEntries[widget.historyIndex]
        : widget.sourceUrl;
    const normalizedUrl = this.normalizeSourceUrl(candidateUrl);

    // Preload used by <webview> widgets for zoom controls (Ctrl+wheel, Ctrl±)
    // electron-vite outputs to out/main + out/preload, so preload lives at ../preload from the main bundle directory.
    const widgetPreloadPath = join(__dirname, "../preload/widget-webview.js");

    // Render all widgets with <webview> to avoid iframe X-Frame-Options/CSP blocks
    // Use a per-widget persistent partition so cookies/localStorage and session state are isolated per widget
    // Use autosize with minwidth/minheight to prevent 150px minimum size issue
    return `${css}<webview src="${normalizedUrl}" style="${style}" autosize="on" minwidth="300" minheight="300" allowpopups allowfullscreen partition="persist:blueberry-widget-${widget.id}" preload="${widgetPreloadPath}" webpreferences="sandbox=no,contextIsolation=yes" useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"></webview>`;
  }

  /**
   * Normalize known providers so they can render in an iframe.
   * For YouTube, switch to embed URLs to avoid ERR_BLOCKED_BY_RESPONSE on the main site.
   */
  private normalizeSourceUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();

      // YouTube: convert watch/short youtu.be links to embed; otherwise default to homepage
      if (host.includes("youtube.com") || host.includes("youtu.be")) {
        // Already embed
        if (parsed.pathname.startsWith("/embed/")) {
          return this.appendEmbedParams(url);
        }

        // youtu.be/{id}
        if (host.includes("youtu.be")) {
          const videoId = parsed.pathname.replace("/", "");
          if (videoId) return this.appendEmbedParams(`https://www.youtube.com/embed/${videoId}`);
        }

        // youtube.com/watch?v={id}
        const videoId = parsed.searchParams.get("v");
        if (videoId) return this.appendEmbedParams(`https://www.youtube.com/embed/${videoId}`);

        // Fallback: show YouTube homepage (user can navigate)
        return "https://www.youtube.com/";
      }

      return url;
    } catch {
      return url;
    }
  }

  /**
   * Apply safe embed params to reduce related content noise and autoplay.
   */
  private appendEmbedParams(embedUrl: string): string {
    try {
      const url = new URL(embedUrl);
      url.searchParams.set("rel", "0");
      url.searchParams.set("autoplay", "0");
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("modestbranding", "1");
      return url.toString();
    } catch {
      return embedUrl;
    }
  }
}

let renderer: WidgetRenderer | null = null;
export function getWidgetRenderer(): WidgetRenderer {
  if (!renderer) renderer = new WidgetRenderer();
  return renderer;
}


