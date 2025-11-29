import type { Window } from "../Window";

export type ToolCategory = "browser" | "filesystem" | "search" | "code";

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ToolParameter[];
  requiresConfirmation: boolean;
  execute: (params: Record<string, any>, context: ToolExecutionContext) => Promise<ToolResult>;
}

export interface ToolExecutionContext {
  window: Window;
  activeTabId?: string;
}

export interface ToolResult {
  success: boolean;
  result?: any;
  error?: string;
  message?: string;
}

// JSON Schema format for LLM function calling
export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
}

