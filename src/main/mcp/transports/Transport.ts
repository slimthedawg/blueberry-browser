/**
 * Transport interface for MCP communication
 */
import type { JsonRpcRequest, JsonRpcResponse } from "../types";

export interface Transport {
  send(message: JsonRpcResponse): Promise<void>;
  onMessage(handler: (message: JsonRpcRequest) => void): void;
  close(): void;
}


