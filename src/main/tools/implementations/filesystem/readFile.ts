import { readFileSync } from "fs";
import { join } from "path";
import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const readFile: ToolDefinition = {
  name: "read_file",
  description: "Read the contents of a file",
  category: "filesystem",
  requiresConfirmation: false,
  parameters: [
    {
      name: "filePath",
      type: "string",
      description: "Path to the file to read (relative to project root or absolute path)",
      required: true,
    },
    {
      name: "encoding",
      type: "string",
      description: "File encoding (defaults to 'utf8')",
      required: false,
      enum: ["utf8", "ascii", "base64"],
    },
  ],
  async execute(params: Record<string, any>, _context: ToolExecutionContext): Promise<ToolResult> {
    const { filePath, encoding = "utf8" } = params;

    if (!filePath || typeof filePath !== "string") {
      return {
        success: false,
        error: "filePath is required and must be a string",
      };
    }

    try {
      // Resolve path (handle relative paths from project root)
      const resolvedPath = filePath.startsWith("/") || filePath.match(/^[A-Z]:/i)
        ? filePath
        : join(process.cwd(), filePath);

      const content = readFileSync(resolvedPath, encoding as BufferEncoding);
      
      return {
        success: true,
        result: {
          content,
          path: resolvedPath,
          length: content.length,
        },
        message: `Read file: ${resolvedPath} (${content.length} characters)`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

