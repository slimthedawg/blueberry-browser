import { spawn } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";

export const executePython: ToolDefinition = {
  name: "execute_python",
  description: "Execute simple Python code in a sandboxed environment",
  category: "code",
  requiresConfirmation: true,
  parameters: [
    {
      name: "code",
      type: "string",
      description: "Python code to execute",
      required: true,
    },
    {
      name: "timeout",
      type: "number",
      description: "Execution timeout in seconds (defaults to 30)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, _context: ToolExecutionContext): Promise<ToolResult> {
    const { code, timeout = 30 } = params;

    if (!code || typeof code !== "string") {
      return {
        success: false,
        error: "code is required and must be a string",
      };
    }

    const tempFile = join(tmpdir(), `python_exec_${Date.now()}.py`);

    try {
      // Write code to temporary file
      writeFileSync(tempFile, code);

      return new Promise((resolve) => {
        const pythonProcess = spawn("python", [tempFile], {
          stdio: ["pipe", "pipe", "pipe"],
          timeout: timeout * 1000,
        });

        let stdout = "";
        let stderr = "";

        pythonProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        pythonProcess.on("close", (code) => {
          // Clean up temp file
          try {
            unlinkSync(tempFile);
          } catch (error) {
            // Ignore cleanup errors
          }

          if (code !== 0) {
            resolve({
              success: false,
              error: stderr || `Process exited with code ${code}`,
              result: {
                stdout,
                stderr,
                exitCode: code,
              },
            });
          } else {
            resolve({
              success: true,
              result: {
                stdout,
                stderr,
                exitCode: code,
              },
              message: "Python code executed successfully",
            });
          }
        });

        pythonProcess.on("error", (error) => {
          // Clean up temp file
          try {
            unlinkSync(tempFile);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }

          resolve({
            success: false,
            error: `Failed to execute Python: ${error.message}. Make sure Python is installed and in PATH.`,
          });
        });
      });
    } catch (error) {
      // Clean up temp file
      try {
        unlinkSync(tempFile);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

