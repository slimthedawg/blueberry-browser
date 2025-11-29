import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

interface ChatRequest {
  message: string;
  context: {
    url: string | null;
    content: string | null;
    text: string | null;
  };
  messageId: string;
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

// Sidebar specific APIs
const sidebarAPI = {
  // Chat functionality
  sendChatMessage: (request: Partial<ChatRequest>) =>
    electronAPI.ipcRenderer.invoke("sidebar-chat-message", request),

  clearChat: () => electronAPI.ipcRenderer.invoke("sidebar-clear-chat"),

  getMessages: () => electronAPI.ipcRenderer.invoke("sidebar-get-messages"),

  onChatResponse: (callback: (data: ChatResponse) => void) => {
    electronAPI.ipcRenderer.on("chat-response", (_, data) => callback(data));
  },

  onMessagesUpdated: (callback: (messages: any[]) => void) => {
    electronAPI.ipcRenderer.on("chat-messages-updated", (_, messages) =>
      callback(messages)
    );
  },

  removeChatResponseListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-response");
  },

  removeMessagesUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-messages-updated");
  },

  // Page content access
  getPageContent: () => electronAPI.ipcRenderer.invoke("get-page-content"),
  getPageText: () => electronAPI.ipcRenderer.invoke("get-page-text"),
  getCurrentUrl: () => electronAPI.ipcRenderer.invoke("get-current-url"),

  // Tab information
  getActiveTabInfo: () => electronAPI.ipcRenderer.invoke("get-active-tab-info"),

  // Agent functionality
  onAgentReasoningUpdate: (callback: (update: any) => void) => {
    electronAPI.ipcRenderer.on("agent-reasoning-update", (_, update) => callback(update));
  },

  onAgentConfirmationRequest: (callback: (request: any) => void) => {
    electronAPI.ipcRenderer.on("agent-confirmation-request", (_, request) => callback(request));
  },

  sendAgentConfirmationResponse: (data: { id: string; confirmed: boolean }) => {
    electronAPI.ipcRenderer.send("agent-confirmation-response", data);
  },

  removeAgentReasoningListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-reasoning-update");
  },

  removeAgentConfirmationListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-confirmation-request");
  },

  onAgentActionPlan: (callback: (plan: any) => void) => {
    electronAPI.ipcRenderer.on("agent-action-plan", (_, plan) => callback(plan));
  },

  onAgentCurrentStep: (callback: (step: number) => void) => {
    electronAPI.ipcRenderer.on("agent-current-step", (_, step) => callback(step));
  },

  removeAgentActionPlanListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-action-plan");
  },

  removeAgentCurrentStepListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-current-step");
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("sidebarAPI", sidebarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.sidebarAPI = sidebarAPI;
}
