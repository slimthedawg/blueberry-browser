/**
 * stdio Transport for MCP
 * Reads from stdin, writes to stdout
 * Uses newline-delimited JSON (NDJSON) format
 */
import type { Transport } from "./Transport";
import type { JsonRpcRequest, JsonRpcResponse } from "../types";

export class StdioTransport implements Transport {
  private messageHandler: ((message: JsonRpcRequest) => void) | null = null;
  private buffer: string = "";
  private isReading: boolean = false;

  constructor() {
    this.startReading();
  }

  private startReading(): void {
    if (this.isReading) return;
    this.isReading = true;

    // Read from stdin
    process.stdin.setEncoding("utf8");
    
    process.stdin.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.processBuffer();
    });

    process.stdin.on("end", () => {
      this.isReading = false;
    });

    process.stdin.on("error", (error) => {
      console.error("stdin error:", error);
      this.isReading = false;
    });
  }

  private processBuffer(): void {
    // Process newline-delimited JSON messages
    const lines = this.buffer.split("\n");
    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message: JsonRpcRequest = JSON.parse(trimmed);
        if (this.messageHandler) {
          this.messageHandler(message);
        }
      } catch (error) {
        console.error("Failed to parse JSON message:", error);
        console.error("Message:", trimmed);
      }
    }
  }

  async send(message: JsonRpcResponse): Promise<void> {
    try {
      const json = JSON.stringify(message);
      process.stdout.write(json + "\n");
      // Ensure the message is flushed
      process.stdout.emit("drain");
    } catch (error) {
      console.error("Failed to send message:", error);
      throw error;
    }
  }

  onMessage(handler: (message: JsonRpcRequest) => void): void {
    this.messageHandler = handler;
  }

  close(): void {
    this.isReading = false;
    this.messageHandler = null;
    process.stdin.removeAllListeners();
  }
}


