import type { ToolDefinition, ToolSchema, ToolResult, ToolExecutionContext } from "./ToolDefinition";
import type { Window } from "../Window";

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private window: Window | null = null;

  constructor(window?: Window) {
    if (window) {
      this.window = window;
    }
  }

  setWindow(window: Window): void {
    this.window = window;
  }

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool ${tool.name} is already registered. Overwriting...`);
    }
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: ToolDefinition[]): void {
    tools.forEach((tool) => this.register(tool));
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: ToolDefinition["category"]): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((tool) => tool.category === category);
  }

  async execute(
    toolName: string,
    params: Record<string, any>,
    activeTabId?: string
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolName} not found`,
      };
    }

    if (!this.window) {
      return {
        success: false,
        error: "Window context not available",
      };
    }

    // Validate parameters
    const validationError = this.validateParameters(tool, params);
    if (validationError) {
      return {
        success: false,
        error: validationError,
      };
    }

    // Create execution context
    const context: ToolExecutionContext = {
      window: this.window,
      activeTabId,
    };

    try {
      return await tool.execute(params, context);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private validateParameters(tool: ToolDefinition, params: Record<string, any>): string | null {
    for (const param of tool.parameters) {
      if (param.required !== false && !(param.name in params)) {
        return `Missing required parameter: ${param.name}`;
      }

      if (param.name in params) {
        const value = params[param.name];
        const type = param.type;

        // Type validation
        if (type === "string" && typeof value !== "string") {
          return `Parameter ${param.name} must be a string`;
        }
        if (type === "number" && typeof value !== "number") {
          return `Parameter ${param.name} must be a number`;
        }
        if (type === "boolean" && typeof value !== "boolean") {
          return `Parameter ${param.name} must be a boolean`;
        }
        if (type === "object" && (typeof value !== "object" || Array.isArray(value))) {
          return `Parameter ${param.name} must be an object`;
        }
        if (type === "array" && !Array.isArray(value)) {
          return `Parameter ${param.name} must be an array`;
        }

        // Enum validation
        if (param.enum && !param.enum.includes(String(value))) {
          return `Parameter ${param.name} must be one of: ${param.enum.join(", ")}`;
        }
      }
    }
    return null;
  }

  getSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((tool) => this.toolToSchema(tool));
  }

  private toolToSchema(tool: ToolDefinition): ToolSchema {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const param of tool.parameters) {
      let schemaType: string = param.type;
      if (param.type === "array") {
        schemaType = "array";
      }

      const property: any = {
        type: schemaType,
        description: param.description,
      };

      if (param.enum) {
        property.enum = param.enum;
      }

      properties[param.name] = property;

      if (param.required !== false) {
        required.push(param.name);
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    };
  }
}

