import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const writeFile: ToolDefinition = {
  name: "write_file",
  description: "Write content to a file (creates file if it doesn't exist, overwrites if it does)",
  category: "filesystem",
  requiresConfirmation: true,
  parameters: [
    {
      name: "filePath",
      type: "string",
      description: "Path to the file to write (relative to project root or absolute path)",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "Content to write to the file",
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
    const { filePath, content, encoding = "utf8" } = params;

    if (!filePath || typeof filePath !== "string") {
      return {
        success: false,
        error: "filePath is required and must be a string",
      };
    }

    if (content === undefined || content === null) {
      return {
        success: false,
        error: "content is required",
      };
    }

    try {
      // Resolve path
      const resolvedPath = filePath.startsWith("/") || filePath.match(/^[A-Z]:/i)
        ? filePath
        : join(process.cwd(), filePath);

      // Create directory if it doesn't exist
      const dir = dirname(resolvedPath);
      mkdirSync(dir, { recursive: true });

      // Write file
      writeFileSync(resolvedPath, String(content), encoding as BufferEncoding);

      return {
        success: true,
        result: {
          path: resolvedPath,
          length: String(content).length,
        },
        message: `Wrote file: ${resolvedPath} (${String(content).length} characters)`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

