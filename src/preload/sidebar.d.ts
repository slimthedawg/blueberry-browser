import { ElectronAPI } from "@electron-toolkit/preload";

interface ChatRequest {
  message: string;
  messageId: string;
  context?: {
    url: string | null;
    content: string | null;
    text: string | null;
  };
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

interface ReasoningUpdate {
  type: "planning" | "executing" | "completed" | "error";
  content: string;
  stepNumber?: number;
  toolName?: string;
}

interface ConfirmationRequest {
  id: string;
  step: {
    stepNumber: number;
    tool: string;
    parameters: Record<string, any>;
    reasoning: string;
    requiresConfirmation: boolean;
  };
}

interface SidebarAPI {
  // Chat functionality
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  onChatResponse: (callback: (data: ChatResponse) => void) => void;
  removeChatResponseListener: () => void;
  onMessagesUpdated: (callback: (messages: any[]) => void) => void;
  removeMessagesUpdatedListener: () => void;
  clearChat: () => Promise<void>;
  getMessages: () => Promise<any[]>;

  // Page content access
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;

  // Tab information
  getActiveTabInfo: () => Promise<TabInfo | null>;

  // Agent functionality
  onAgentReasoningUpdate: (callback: (update: ReasoningUpdate) => void) => void;
  onAgentConfirmationRequest: (callback: (request: ConfirmationRequest) => void) => void;
  sendAgentConfirmationResponse: (data: { id: string; confirmed: boolean }) => void;
  removeAgentReasoningListener: () => void;
  removeAgentConfirmationListener: () => void;
  onAgentActionPlan: (callback: (plan: ActionPlan) => void) => void;
  onAgentCurrentStep: (callback: (step: number) => void) => void;
  removeAgentActionPlanListener: () => void;
  removeAgentCurrentStepListener: () => void;
}

interface ActionPlan {
  goal: string;
  steps: Array<{
    stepNumber: number;
    tool: string;
    parameters: Record<string, any>;
    reasoning: string;
    requiresConfirmation: boolean;
  }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}

