import { BrowserWindow, WebContents } from "electron";

export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  headers?: Record<string, any>;
  body?: any;
}

export interface DOMSnapshot {
  html: string;
  title?: string;
}

export interface APIMapping {
  url: string;
  method: string;
}

export interface WebsiteAnalysis {
  dom: DOMSnapshot;
  css?: string;
  requests: NetworkRequest[];
  apiMappings: APIMapping[];
}

/**
 * WebsiteAnalyzer
 * Loads a website in a hidden WebContentsView, captures network requests,
 * extracts DOM and CSS snapshots, and returns analysis for widget creation.
 */
export class WebsiteAnalyzer {
  async analyzeWebsite(url: string): Promise<WebsiteAnalysis> {
    // Use a headless BrowserWindow (hidden) to avoid BrowserView errors in this context
    const hiddenWin = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    // Set realistic Chrome user agent to bypass bot detection
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    hiddenWin.webContents.setUserAgent(userAgent);
    
    // Also set at session level for all requests
    hiddenWin.webContents.session.setUserAgent(userAgent);

    const captured: NetworkRequest[] = [];
    const wc: WebContents = hiddenWin.webContents;
    
    // Inject anti-bot detection code before loading
    const antiBotCode = `
      (function() {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} };
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return 'Intel Inc.';
          if (parameter === 37446) return 'Intel Iris OpenGL Engine';
          return getParameter.call(this, parameter);
        };
      })();
    `;
    const requestListener = (_event: any, details: any) => {
      // Guard against undefined details
      if (!details || !details.url) {
        return;
      }
      captured.push({
        url: details.url,
        method: details.method || 'GET',
      });
    };

    try {
      wc.session.webRequest.onCompleted(requestListener);
      
      // Inject anti-bot detection before loading
      wc.once("did-start-loading", () => {
        wc.executeJavaScript(antiBotCode).catch(() => {});
      });
      
      await wc.loadURL(url);
      
      // Inject again after page loads to ensure it's applied
      await wc.executeJavaScript(antiBotCode).catch(() => {});
      await wc.executeJavaScript("new Promise(r => setTimeout(r, 1500))"); // allow dynamic content

      const html: string = await wc.executeJavaScript("document.documentElement.outerHTML");
      const title: string = await wc.executeJavaScript("document.title");

      const analysis: WebsiteAnalysis = {
        dom: { html, title },
        requests: captured,
        apiMappings: captured.map((r) => ({ url: r.url, method: r.method })),
      };
      return analysis;
    } catch (error) {
      console.warn("WebsiteAnalyzer failed, returning minimal analysis:", error);
      return {
        dom: { html: "", title: "" },
        requests: [],
        apiMappings: [],
      };
    } finally {
      try {
        wc.session.webRequest.off("completed", requestListener);
      } catch {}
      hiddenWin.destroy();
    }
  }
}

let analyzer: WebsiteAnalyzer | null = null;
export function getWebsiteAnalyzer(): WebsiteAnalyzer {
  if (!analyzer) analyzer = new WebsiteAnalyzer();
  return analyzer;
}


