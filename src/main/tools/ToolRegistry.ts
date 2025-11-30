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

    // Normalize parameters to fix common LLM mistakes
    const normalizedParams = this.normalizeParameters(tool, params);
    
    // Validate parameters
    const validationError = this.validateParameters(tool, normalizedParams);
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
      return await tool.execute(normalizedParams, context);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Normalize parameters to fix common LLM mistakes - AGGRESSIVE FIXING
   */
  private normalizeParameters(tool: ToolDefinition, params: Record<string, any>): Record<string, any> {
    const normalized = { ...params };

    // Fix fill_form: Try multiple strategies to find field/value pairs
    if (tool.name === "fill_form" && !normalized.fields) {
      // Strategy 1: {field: "selector", value: "text"}
      if (normalized.field && normalized.value) {
        normalized.fields = { [normalized.field]: normalized.value };
        delete normalized.field;
        delete normalized.value;
      }
      // Strategy 2: {fieldName: "selector", fieldValue: "text"}
      else if (normalized.fieldName && normalized.fieldValue) {
        normalized.fields = { [normalized.fieldName]: normalized.fieldValue };
        delete normalized.fieldName;
        delete normalized.fieldValue;
      }
      // Strategy 3: {selector: "selector", text: "text"} or {selector: "selector", value: "text"}
      else if (normalized.selector && (normalized.text || normalized.value)) {
        normalized.fields = { [normalized.selector]: normalized.text || normalized.value };
        delete normalized.selector;
        delete normalized.text;
        delete normalized.value;
      }
      // Strategy 4: {location: "Stockholm"} - single key-value that looks like a field
      else {
        const keys = Object.keys(normalized).filter(k => k !== "tabId");
        if (keys.length === 1) {
          const key = keys[0];
          const value = normalized[key];
          if (typeof value === "string" && value.length > 0) {
            // Assume this is a field name and we need to find the selector
            // For now, try common selectors
            const fields: Record<string, any> = {};
            fields[`input[name="${key}"]`] = value;
            fields[`#${key}`] = value;
            fields[`[placeholder*="${key}"]`] = value;
            normalized.fields = fields;
            delete normalized[key];
          }
        } else if (keys.length === 2) {
          // Two keys - likely field and value
          const [key1, key2] = keys;
          const val1 = normalized[key1];
          const val2 = normalized[key2];
          // If one looks like a selector (contains #, ., [, etc) and other is text
          const selectorPattern = /[#\.\[\]\(\)]/;
          if (selectorPattern.test(String(val1)) && typeof val2 === "string") {
            normalized.fields = { [val1]: val2 };
            delete normalized[key1];
            delete normalized[key2];
          } else if (selectorPattern.test(String(val2)) && typeof val1 === "string") {
            normalized.fields = { [val2]: val1 };
            delete normalized[key1];
            delete normalized[key2];
          }
        }
      }
    }

    // Fix select_suggestion: Try to find fieldSelector
    if (tool.name === "select_suggestion" && !normalized.fieldSelector) {
      if (normalized.field) {
        normalized.fieldSelector = normalized.field;
        delete normalized.field;
      } else if (normalized.selector) {
        normalized.fieldSelector = normalized.selector;
        delete normalized.selector;
      } else if (normalized.input) {
        normalized.fieldSelector = normalized.input;
        delete normalized.input;
      }
    }

    // Fix click_element: convert {element: "selector"} to {selector: "selector"}
    if (tool.name === "click_element" && !normalized.selector) {
      if (normalized.element) {
        normalized.selector = normalized.element;
        delete normalized.element;
      } else if (normalized.button) {
        normalized.selector = normalized.button;
        delete normalized.button;
      } else if (normalized.link) {
        normalized.selector = normalized.link;
        delete normalized.link;
      }
    }

    // Fix submit_form: ensure formSelector exists or use default
    if (tool.name === "submit_form") {
      if (!normalized.formSelector && !normalized.selector) {
        normalized.formSelector = "form";
      } else if (normalized.selector && !normalized.formSelector) {
        normalized.formSelector = normalized.selector;
        delete normalized.selector;
      }
    }

    return normalized;
  }

  private validateParameters(tool: ToolDefinition, params: Record<string, any>): string | null {
    for (const param of tool.parameters) {
      if (param.required !== false && !(param.name in params)) {
        return `Missing required parameter: ${param.name}`;
      }

      if (param.name in params) {
        const value = params[param.name];
        const type = param.type;

        // Skip validation if value is undefined or null (optional parameters)
        if (value === undefined || value === null) {
          continue;
        }

        // Type validation
        if (type === "string" && typeof value !== "string") {
          // Allow numbers to be converted to strings for tabId (common mistake)
          if (param.name === "tabId" && typeof value === "number") {
            // Don't error, but we'll convert it in the tool execution
            continue;
          }
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

  /**
   * Get tools in MCP format
   */
  getMCPSchemas(): Array<{
    name: string;
    description: string;
    inputSchema: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  }> {
    return Array.from(this.tools.values()).map((tool) => {
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

        if (param.type === "array") {
          property.items = { type: "string" };
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
    });
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

