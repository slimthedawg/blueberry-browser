import type { ErrorType } from "./ExecutionState";

/**
 * Classify error type for appropriate retry strategy
 */
export function classifyError(error: string, _tool: string): ErrorType {
  const errorLower = error.toLowerCase();
  
  // Unrecoverable errors - stop execution
  if (errorLower.includes("api") || 
      errorLower.includes("openai") || 
      errorLower.includes("anthropic") ||
      errorLower.includes("network") ||
      errorLower.includes("authentication") ||
      errorLower.includes("unauthorized") ||
      errorLower.includes("rate limit")) {
    return "UNRECOVERABLE";
  }
  
  // Element not found errors - retry with page analysis (max 3)
  if (errorLower.includes("not found") || 
      errorLower.includes("not visible") || 
      errorLower.includes("element") ||
      errorLower.includes("field not found") ||
      errorLower.includes("could not find")) {
    return "ELEMENT_NOT_FOUND";
  }
  
  // Parameter errors - auto-fix immediately
  if (errorLower.includes("missing required parameter") || 
      errorLower.includes("must be") ||
      errorLower.includes("invalid parameter") ||
      errorLower.includes("parameter")) {
    return "PARAMETER_ERROR";
  }
  
  // Partial success - some fields worked, others didn't
  if (errorLower.includes("partial") || 
      (errorLower.includes("some") && errorLower.includes("failed"))) {
    return "PARTIAL_SUCCESS";
  }
  
  // Default to unknown - will be handled as task failure
  return "UNKNOWN";
}

