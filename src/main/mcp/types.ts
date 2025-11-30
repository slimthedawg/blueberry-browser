/**
 * MCP (Model Context Protocol) Types
 * Based on JSON-RPC 2.0 specification
 */

// JSON-RPC 2.0 Base Types
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

// MCP Error Codes
export enum MCPErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  // MCP-specific error codes
  ToolNotFound = -32001,
  ToolExecutionError = -32002,
  InvalidToolParameters = -32003,
}

// MCP Initialize
export interface InitializeRequest {
  protocolVersion: string;
  capabilities?: {
    tools?: {};
    resources?: {};
    prompts?: {};
  };
  clientInfo?: {
    name: string;
    version: string;
  };
}

export interface InitializeResponse {
  protocolVersion: string;
  capabilities: {
    tools?: {};
    resources?: {};
    prompts?: {};
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

// MCP Tools
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolsListRequest {
  // No parameters for tools/list
}

export interface ToolsListResponse {
  tools: MCPTool[];
}

export interface ToolsCallRequest {
  name: string;
  arguments?: Record<string, any>;
}

export interface ToolsCallResponse {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    resource?: {
      uri: string;
      mimeType?: string;
    };
  }>;
  isError?: boolean;
}

// MCP Message Types
export type MCPRequest = 
  | { method: "initialize"; params: InitializeRequest }
  | { method: "tools/list"; params?: ToolsListRequest }
  | { method: "tools/call"; params: ToolsCallRequest };

export type MCPResponse =
  | { result: InitializeResponse }
  | { result: ToolsListResponse }
  | { result: ToolsCallResponse }
  | { error: JsonRpcError };

// Transport Interface
export interface Transport {
  send(message: JsonRpcResponse): Promise<void>;
  onMessage(handler: (message: JsonRpcRequest) => void): void;
  close(): void;
}


