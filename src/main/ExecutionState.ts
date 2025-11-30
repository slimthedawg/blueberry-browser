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
  };
  taskFailureCounts: Map<string, number>;
}

export function createExecutionState(plan: ActionPlan): ExecutionState {
  return {
    originalPlan: JSON.parse(JSON.stringify(plan)),
    currentPlan: JSON.parse(JSON.stringify(plan)),
    completedSteps: [],
    failedSteps: new Map(),
    observations: [],
    goalAchieved: false,
    context: {},
    taskFailureCounts: new Map(),
  };
}

