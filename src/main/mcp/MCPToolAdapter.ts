/**
 * Adapter to convert ToolDefinition to MCP tool format
 */
import type { ToolDefinition } from "../tools/ToolDefinition";
import type { MCPTool, ToolsCallResponse } from "./types";
import type { ToolResult } from "../tools/ToolDefinition";

export class MCPToolAdapter {
  /**
   * Convert ToolDefinition to MCP tool format
   */
  static toMCPTool(tool: ToolDefinition): MCPTool {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const param of tool.parameters) {
      const property: any = {
        type: param.type,
        description: param.description,
      };

      if (param.enum) {
        property.enum = param.enum;
      }

      // Handle array items if needed
      if (param.type === "array") {
        property.items = { type: "string" }; // Default to string array, can be enhanced
      }

      properties[param.name] = property;

      if (param.required !== false) {
        required.push(param.name);
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
      },
    };
  }

  /**
   * Convert ToolResult to MCP ToolsCallResponse
   */
  static toolResultToMCPResponse(result: ToolResult): ToolsCallResponse {
    if (result.success) {
      // Convert result to text content
      let textContent = "";
      
      if (result.message) {
        textContent = result.message;
      } else if (result.result) {
        if (typeof result.result === "string") {
          textContent = result.result;
        } else {
          textContent = JSON.stringify(result.result, null, 2);
        }
      } else {
        textContent = "Tool executed successfully";
      }

      return {
        content: [
          {
            type: "text",
            text: textContent,
          },
        ],
        isError: false,
      };
    } else {
      // Error response
      return {
        content: [
          {
            type: "text",
            text: result.error || "Tool execution failed",
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Convert MCP tool to OpenAI function calling format
   */
  static toOpenAIFunction(mcpTool: MCPTool): {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  } {
    return {
      type: "function",
      function: {
        name: mcpTool.name,
        description: mcpTool.description,
        parameters: mcpTool.inputSchema,
      },
    };
  }
}


