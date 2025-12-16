import type { ActionPlan, ActionStep } from "./AgentOrchestrator";
import type { ToolResult } from "./tools/ToolDefinition";

export type ErrorType = "ELEMENT_NOT_FOUND" | "PARAMETER_ERROR" | "TASK_FAILURE" | "UNRECOVERABLE" | "PARTIAL_SUCCESS" | "UNKNOWN";

export interface FailedStepInfo {
  step: ActionStep;
  error: string;
  retryCount: number;
  errorType: ErrorType;
  taskType: string;
}

export interface RecordingExecutionState {
  recordingId: string | null;
  currentActionIndex: number;
  actionsExecuted: number;
  batchCount: number;
  totalActions: number;
}

export interface VisualContextSnapshot {
  path: string;
  url?: string;
  name?: string;
  capturedAt: number;
  reason?: string;
}

export interface DomSnapshotSummary {
  url?: string;
  capturedAt: number;
  elementCount: number;
  summaryText?: string;
  sampleSelectors?: string[];
}

export interface ExecutionState {
  originalPlan: ActionPlan;
  currentPlan: ActionPlan;
  completedSteps: Array<{ step: ActionStep; result: ToolResult }>;
  failedSteps: Map<number, FailedStepInfo>;
  observations: Array<{ stepNumber: number; observation: string; timestamp: number }>;
  goalAchieved: boolean;
  context: {
    currentUrl?: string;
    pageElements?: any[];
    lastPageContent?: string;
    lastPageAnalysis?: any;
    lastScreenshot?: VisualContextSnapshot;
    lastDomSnapshot?: DomSnapshotSummary;
  };
  taskFailureCounts: Map<string, number>;
  recordingExecution: RecordingExecutionState | null;
}

export function createExecutionState(plan: ActionPlan): ExecutionState {
  return {
    originalPlan: JSON.parse(JSON.stringify(plan)),
    currentPlan: JSON.parse(JSON.stringify(plan)),
    completedSteps: [],
    failedSteps: new Map(),
    observations: [],
    goalAchieved: false,
    context: {
      currentUrl: undefined,
      pageElements: undefined,
      lastPageContent: undefined,
      lastPageAnalysis: undefined,
      lastScreenshot: undefined,
      lastDomSnapshot: undefined,
    },
    taskFailureCounts: new Map(),
    recordingExecution: null,
  };
}

