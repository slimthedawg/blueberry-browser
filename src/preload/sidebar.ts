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

  abortChat: () => electronAPI.ipcRenderer.invoke("sidebar-abort-chat"),

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

  onAgentContextUpdate: (callback: (context: any) => void) => {
    electronAPI.ipcRenderer.on("agent-context-update", (_, context) => callback(context));
  },

  removeAgentActionPlanListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-action-plan");
  },

  removeAgentCurrentStepListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-current-step");
  },

  removeAgentContextListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-context-update");
  },

  // User guidance for element selection
  onAgentGuidanceRequest: (callback: (request: any) => void) => {
    electronAPI.ipcRenderer.on("agent-guidance-request", (_, request) => callback(request));
  },

  sendAgentGuidanceResponse: (data: { id: string; selector?: string; elementInfo?: any; cancelled?: boolean }) => {
    electronAPI.ipcRenderer.send("agent-guidance-response", data);
  },

  removeAgentGuidanceListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-guidance-request");
  },

  // Recording functionality
  recordingStart: (name?: string) => electronAPI.ipcRenderer.invoke("recording-start", name),
  recordingStop: () => electronAPI.ipcRenderer.invoke("recording-stop"),
  recordingPause: () => electronAPI.ipcRenderer.invoke("recording-pause"),
  recordingResume: () => electronAPI.ipcRenderer.invoke("recording-resume"),
  recordingGetState: () => electronAPI.ipcRenderer.invoke("recording-get-state"),
  recordingGetList: () => electronAPI.ipcRenderer.invoke("recording-get-list"),
  recordingLoad: (id: string) => electronAPI.ipcRenderer.invoke("recording-load", id),
  recordingDelete: (id: string) => electronAPI.ipcRenderer.invoke("recording-delete", id),
  recordingRename: (id: string, newName: string) => electronAPI.ipcRenderer.invoke("recording-rename", id, newName),
  recordingGetDirectory: () => electronAPI.ipcRenderer.invoke("recording-get-directory"),
  recordingOpenDirectory: () => electronAPI.ipcRenderer.invoke("recording-open-directory"),
 
  // Sidebar resize
  resizeSidebar: (width: number) => electronAPI.ipcRenderer.invoke("sidebar-resize", width),
  getSidebarWidth: () => electronAPI.ipcRenderer.invoke("sidebar-get-width"),
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
