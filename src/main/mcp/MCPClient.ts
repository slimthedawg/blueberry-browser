/**
 * Internal MCP Client for AgentOrchestrator
 * Communicates with MCP server via in-memory calls (not stdio)
 */
import type { ToolRegistry } from "../tools/ToolRegistry";
import type { Window } from "../Window";
import { MCPToolAdapter } from "./MCPToolAdapter";
import type {
  MCPTool,
} from "./types";
import type { ToolResult } from "../tools/ToolDefinition";

export class MCPClient {
  private toolRegistry: ToolRegistry;
  private window: Window;

  constructor(toolRegistry: ToolRegistry, window: Window) {
    this.toolRegistry = toolRegistry;
    this.window = window;
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<MCPTool[]> {
    const tools = this.toolRegistry.getAll();
    return tools.map((tool) => MCPToolAdapter.toMCPTool(tool));
  }

  /**
   * Call a tool by name with arguments
   */
  async callTool(name: string, args: Record<string, any>): Promise<ToolResult> {
    const activeTabId = this.window.activeTab?.id;
    const result = await this.toolRegistry.execute(name, args, activeTabId);
    return result;
  }

  /**
   * Get tools in OpenAI function calling format
   */
  getOpenAIFunctions(): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }> {
    const tools = this.toolRegistry.getAll();
    return tools.map((tool) => {
      const mcpTool = MCPToolAdapter.toMCPTool(tool);
      return MCPToolAdapter.toOpenAIFunction(mcpTool);
    });
  }
}

