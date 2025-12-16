import { ipcRenderer, webFrame } from "electron";

/**
 * Webview preload for widgets.
 * - Implements per-widget zoom inside the focused widget:
 *   - Ctrl/Cmd + Wheel
 *   - Ctrl/Cmd + Plus/Minus
 * - Persists the resulting zoomFactor by sending it to the embedder via sendToHost.
 */

function clampZoomFactor(next: number): number {
  const min = 0.25;
  const max = 5;
  return Math.max(min, Math.min(max, next));
}

function sendZoomToHost(zoomFactor: number, source: "wheel" | "key", meta?: Record<string, any>): void {
  try {
    ipcRenderer.sendToHost("blueberry-widget-zoom", {
      zoomFactor,
      source,
      ...(meta || {}),
    });
  } catch {
    // ignore
  }
}

function applyZoomDelta(direction: 1 | -1, source: "wheel" | "key"): void {
  const step = 0.1;
  const current = typeof webFrame.getZoomFactor === "function" ? webFrame.getZoomFactor() : 1;
  const next = clampZoomFactor(current + direction * step);
  try {
    if (typeof webFrame.setZoomFactor === "function") {
      webFrame.setZoomFactor(next);
    }
  } catch {
    // ignore
  }
  sendZoomToHost(next, source);
}

function applyZoomReset(source: "key"): void {
  const next = 1;
  try {
    if (typeof webFrame.setZoomFactor === "function") {
      webFrame.setZoomFactor(next);
    }
  } catch {
    // ignore
  }
  sendZoomToHost(next, source, { reset: true });
}

window.addEventListener(
  "wheel",
  (e: WheelEvent) => {
    try {
      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      if (!ctrlOrCmd) return;

      // Prevent default Chromium zoom so we control it consistently.
      e.preventDefault();

      const direction: 1 | -1 = e.deltaY < 0 ? 1 : -1; // wheel up -> zoom in, wheel down -> zoom out
      applyZoomDelta(direction, "wheel");
    } catch {
      // ignore
    }
  },
  { capture: true, passive: false }
);

window.addEventListener(
  "keydown",
  (e: KeyboardEvent) => {
    try {
      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      if (!ctrlOrCmd) return;

      const key = e.key;
      const code = (e as any).code as string | undefined;

      const isZoomIn =
        key === "+" ||
        key === "=" ||
        key === "Add" ||
        code === "Equal" ||
        code === "NumpadAdd";

      const isZoomOut =
        key === "-" ||
        key === "_" ||
        key === "Subtract" ||
        code === "Minus" ||
        code === "NumpadSubtract";

      const isReset = key === "0" || code === "Digit0" || code === "Numpad0";

      if (!isZoomIn && !isZoomOut && !isReset) return;

      // Prevent default browser zoom.
      e.preventDefault();

      if (isReset) {
        applyZoomReset("key");
        return;
      }

      applyZoomDelta(isZoomIn ? 1 : -1, "key");
    } catch {
      // ignore
    }
  },
  { capture: true }
);


