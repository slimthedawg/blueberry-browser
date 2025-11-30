/**
 * MCP Server implementation
 * Handles JSON-RPC 2.0 requests and routes to appropriate methods
 */
import type { ToolRegistry } from "../tools/ToolRegistry";
import type { Window } from "../Window";
import { StdioTransport } from "./transports/StdioTransport";
import { MCPToolAdapter } from "./MCPToolAdapter";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  InitializeRequest,
  InitializeResponse,
  ToolsListRequest,
  ToolsListResponse,
  ToolsCallRequest,
  ToolsCallResponse,
} from "./types";
import { MCPErrorCode } from "./types";

export class MCPServer {
  private transport: StdioTransport;
  private toolRegistry: ToolRegistry | null = null;
  private window: Window | null = null;
  // private initialized: boolean = false; // Tracked but not currently used
  private protocolVersion: string = "2024-11-05";

  constructor() {
    this.transport = new StdioTransport();
    this.transport.onMessage((message) => this.handleMessage(message));
  }

  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  setWindow(window: Window): void {
    this.window = window;
  }

  private async handleMessage(request: JsonRpcRequest): Promise<void> {
    try {
      const response = await this.processRequest(request);
      if (response) {
        await this.transport.send(response);
      }
    } catch (error) {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: MCPErrorCode.InternalError,
          message: error instanceof Error ? error.message : String(error),
        },
      };
      await this.transport.send(errorResponse);
    }
  }

  private async processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    // Handle notifications (id is null)
    if (request.id === null || request.id === undefined) {
      // Notifications don't require a response
      await this.handleNotification(request);
      return null;
    }

    try {
      let result: any;

      switch (request.method) {
        case "initialize":
          result = await this.handleInitialize(request.params as InitializeRequest);
          break;

        case "tools/list":
          result = await this.handleToolsList(request.params as ToolsListRequest);
          break;

        case "tools/call":
          result = await this.handleToolsCall(request.params as ToolsCallRequest);
          break;

        default:
          throw new Error(`Method not found: ${request.method}`);
      }

      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error) {
      const errorCode =
        error instanceof Error && error.message.includes("not found")
          ? MCPErrorCode.MethodNotFound
          : MCPErrorCode.InternalError;

      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async handleNotification(_request: JsonRpcRequest): Promise<void> {
    // Handle notifications (e.g., initialized, ping, etc.)
    // Currently no-op, but can be extended
  }

  private async handleInitialize(_params: InitializeRequest): Promise<InitializeResponse> {
    // this.initialized = true; // Tracked but not currently used

    return {
      protocolVersion: this.protocolVersion,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "blueberry-browser-mcp",
        version: "1.0.0",
      },
    };
  }

  private async handleToolsList(_params: ToolsListRequest): Promise<ToolsListResponse> {
    if (!this.toolRegistry) {
      throw new Error("Tool registry not set");
    }

    const tools = this.toolRegistry.getAll();
    const mcpTools = tools.map((tool) => MCPToolAdapter.toMCPTool(tool));

    return {
      tools: mcpTools,
    };
  }

  private async handleToolsCall(params: ToolsCallRequest): Promise<ToolsCallResponse> {
    if (!this.toolRegistry) {
      throw new Error("Tool registry not set");
    }

    if (!this.window) {
      throw new Error("Window context not available");
    }

    const tool = this.toolRegistry.get(params.name);
    if (!tool) {
      const error: JsonRpcError = {
        code: MCPErrorCode.ToolNotFound,
        message: `Tool not found: ${params.name}`,
      };
      throw error;
    }

    // Execute the tool
    const activeTabId = this.window.activeTab?.id;
    const result = await this.toolRegistry.execute(
      params.name,
      params.arguments || {},
      activeTabId
    );

    // Convert result to MCP response
    return MCPToolAdapter.toolResultToMCPResponse(result);
  }

  close(): void {
    this.transport.close();
  }
}

