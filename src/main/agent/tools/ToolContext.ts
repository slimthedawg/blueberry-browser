import type { Window } from "../../Window";

/**
 * Global context store for LangChain tools
 * This allows tools to access window and activeTabId without passing through LangChain's tool system
 */
class ToolContextStore {
  private window: Window | null = null;
  private activeTabId: string | undefined = undefined;

  setContext(window: Window, activeTabId?: string): void {
    this.window = window;
    this.activeTabId = activeTabId;
  }

  getWindow(): Window | null {
    return this.window;
  }

  getActiveTabId(): string | undefined {
    return this.activeTabId;
  }
}

export const toolContextStore = new ToolContextStore();



















