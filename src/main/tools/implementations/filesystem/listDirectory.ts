import { readdirSync, statSync } from "fs";
import { join } from "path";
import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const listDirectory: ToolDefinition = {
  name: "list_directory",
  description: "List files and directories in a given path",
  category: "filesystem",
  requiresConfirmation: false,
  parameters: [
    {
      name: "directoryPath",
      type: "string",
      description: "Path to the directory to list (relative to project root or absolute path, defaults to current directory)",
      required: false,
    },
    {
      name: "includeDetails",
      type: "boolean",
      description: "Whether to include file size and type details",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, _context: ToolExecutionContext): Promise<ToolResult> {
    const { directoryPath = ".", includeDetails = false } = params;

    try {
      // Resolve path
      const resolvedPath = directoryPath.startsWith("/") || directoryPath.match(/^[A-Z]:/i)
        ? directoryPath
        : join(process.cwd(), directoryPath);

      const entries = readdirSync(resolvedPath);
      
      let result: any = {
        path: resolvedPath,
        entries: entries,
      };

      if (includeDetails) {
        result.entries = entries.map((entry) => {
          const fullPath = join(resolvedPath, entry);
          const stats = statSync(fullPath);
          return {
            name: entry,
            type: stats.isDirectory() ? "directory" : "file",
            size: stats.size,
            modified: stats.mtime.toISOString(),
          };
        });
      }

      return {
        success: true,
        result,
        message: `Listed ${entries.length} entries in ${resolvedPath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

