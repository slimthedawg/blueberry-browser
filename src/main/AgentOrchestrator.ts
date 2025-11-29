import { WebContents, ipcMain } from "electron";
import { streamText, type LanguageModel, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import * as dotenv from "dotenv";
import { join } from "path";
import type { Window } from "./Window";
import { ToolRegistry, createToolRegistry } from "./tools";
import type { ToolResult } from "./tools/ToolDefinition";

dotenv.config({ path: join(__dirname, "../.env") });

type LLMProvider = "openai" | "anthropic";

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-20241022",
};

const DEFAULT_TEMPERATURE = 0.7;

export interface ActionPlan {
  steps: ActionStep[];
  goal: string;
}

export interface ActionStep {
  stepNumber: number;
  tool: string;
  parameters: Record<string, any>;
  reasoning: string;
  requiresConfirmation: boolean;
}

export interface ReasoningUpdate {
  type: "planning" | "executing" | "completed" | "error";
  content: string;
  stepNumber?: number;
  toolName?: string;
}

export class AgentOrchestrator {
  private readonly webContents: WebContents;
  private window: Window | null = null;
  private readonly provider: LLMProvider;
  private readonly modelName: string;
  private readonly model: LanguageModel | null;
  private toolRegistry: ToolRegistry;
  private executionResults: Array<{ step: number; result: ToolResult }> = [];
  private onAssistantMessage: ((msg: CoreMessage) => void) | null = null;

  constructor(webContents: WebContents, window: Window, onAssistantMessage?: (msg: CoreMessage) => void) {
    this.webContents = webContents;
    this.window = window;
    this.provider = this.getProvider();
    this.modelName = this.getModelName();
    this.model = this.initializeModel();
    this.toolRegistry = createToolRegistry();
    this.toolRegistry.setWindow(window);
    this.onAssistantMessage = onAssistantMessage || null;
  }

  private getProvider(): LLMProvider {
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    if (provider === "anthropic") return "anthropic";
    return "openai";
  }

  private getModelName(): string {
    return process.env.LLM_MODEL || DEFAULT_MODELS[this.provider];
  }

  private initializeModel(): LanguageModel | null {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    switch (this.provider) {
      case "anthropic":
        return anthropic(this.modelName);
      case "openai":
        return openai(this.modelName);
      default:
        return null;
    }
  }

  private getApiKey(): string | undefined {
    switch (this.provider) {
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY;
      case "openai":
        return process.env.OPENAI_API_KEY;
      default:
        return undefined;
    }
  }

  async processRequest(userMessage: string, messageId: string): Promise<void> {
    if (!this.model) {
      this.sendError(messageId, "LLM service is not configured. Please add your API key to the .env file.");
      return;
    }

    try {
      // Reset state
      this.executionResults = [];

      // Step 1: Generate action plan (LLM decides if tools are needed)
      await this.streamReasoning({
        type: "planning",
        content: "Analyzing your request and creating an action plan...",
      });

      let plan: ActionPlan;
      try {
        plan = await this.generateActionPlan(userMessage);
      } catch (error) {
        console.error("Error generating action plan:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        await this.streamReasoning({
          type: "error",
          content: `Failed to create action plan: ${errorMsg}`,
        });
        this.sendError(messageId, `Failed to create action plan: ${errorMsg}. Please try rephrasing your request or check the console for details.`);
        return;
      }

      await this.streamReasoning({
        type: "planning",
        content: `Created plan with ${plan.steps.length} step(s): ${plan.goal}`,
      });

      // Check if this is a conversational plan (no tools needed)
      const hasNoTools = plan.steps.length === 0 || 
        plan.steps.every(step => step.tool === "none" || step.tool === "conversational" || !step.tool);
      
      if (hasNoTools) {
        // This is a conversational request - generate response directly
        await this.streamReasoning({
          type: "planning",
          content: "This is a conversational request. Generating response...",
        });
        
        const isAboutCapabilities = /(what can you do|what tools|capabilities|help me with|what are you|what do you|what are your|list your|show me your|tell me about your)/i.test(userMessage);
        const response = await this.generateConversationalResponse(userMessage, isAboutCapabilities);
        this.sendFinalResponse(messageId, response);
        return;
      }

      // Send action plan to UI for display
      this.webContents.send("agent-action-plan", {
        goal: plan.goal,
        steps: plan.steps,
      });

      // Step 2: Execute plan step by step
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];

        // Update current step in UI
        this.webContents.send("agent-current-step", step.stepNumber);

        await this.streamReasoning({
          type: "executing",
          content: step.reasoning,
          stepNumber: step.stepNumber,
          toolName: step.tool,
        });

        // Check if confirmation is required
        if (step.requiresConfirmation) {
          const confirmed = await this.requestConfirmation(step, messageId);
          if (!confirmed) {
            await this.streamReasoning({
              type: "error",
              content: "Step cancelled by user",
              stepNumber: step.stepNumber,
            });
            this.sendFinalResponse(messageId, "Action plan cancelled by user.");
            return;
          }
        }

        // Execute the step
        const result = await this.toolRegistry.execute(
          step.tool,
          step.parameters,
          this.window?.activeTab?.id
        );

        this.executionResults.push({ step: step.stepNumber, result });

        if (!result.success) {
          await this.streamReasoning({
            type: "error",
            content: `Step failed: ${result.error}`,
            stepNumber: step.stepNumber,
          });

          // Ask LLM how to proceed
          const shouldContinue = await this.handleStepFailure(step, result, userMessage);
          if (!shouldContinue) {
            this.sendFinalResponse(messageId, `Plan execution stopped after step ${step.stepNumber} due to error.`);
            return;
          }
        } else {
          await this.streamReasoning({
            type: "executing",
            content: `Step ${step.stepNumber} completed: ${result.message || "Success"}`,
            stepNumber: step.stepNumber,
          });
        }
      }

      // Step 3: Generate final response
      await this.streamReasoning({
        type: "completed",
        content: "All steps completed successfully. Generating final response...",
      });

      const finalResponse = await this.generateFinalResponse(userMessage, plan);
      this.sendFinalResponse(messageId, finalResponse);
    } catch (error) {
      console.error("Error in agent orchestration:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.streamReasoning({
        type: "error",
        content: `Error: ${errorMsg}`,
      });
      this.sendError(messageId, `Agent error: ${errorMsg}`);
    }
  }

  private async generateActionPlan(userMessage: string): Promise<ActionPlan> {
    if (!this.model) {
      throw new Error("Model not initialized");
    }

    const toolSchemas = this.toolRegistry.getSchemas();
    const toolsDescription = toolSchemas
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join("\n");

    const systemPrompt = `You are an AI agent that helps users accomplish tasks by breaking them down into steps and executing tools.

Available tools:
${toolsDescription}

IMPORTANT DECISION RULES:
1. **For simple greetings or casual conversation** (hi, hello, hey, how are you, thanks, etc.):
   - Create a plan with goal "Respond conversationally" and an empty steps array: {"goal": "Respond conversationally", "steps": []}
   - DO NOT use any tools for these

2. **For questions about YOUR capabilities or tools**:
   - Create a plan with goal "Explain capabilities" and an empty steps array: {"goal": "Explain capabilities", "steps": []}
   - You know your own tools - respond directly without using read_page_content

3. **For requests that need tools** (clicking, navigating, reading pages, searching, file operations, etc.):
   - Create a proper action plan with specific steps using the available tools
   - Only use read_page_content when the user explicitly wants to read/analyze page content

4. **For ambiguous requests**:
   - If it's unclear whether tools are needed, err on the side of creating a conversational plan (empty steps)
   - You can always ask clarifying questions in your response

Your task:
1. Analyze the user's request
2. Determine if tools are needed or if this is conversational
3. Create an appropriate plan:
   - Conversational: {"goal": "description", "steps": []}
   - With tools: {"goal": "description", "steps": [{"stepNumber": 1, "tool": "tool_name", ...}]}
4. Return ONLY a valid JSON object with this exact structure (no other text before or after):
{
  "goal": "Brief description of what we're trying to accomplish",
  "steps": [
    {
      "stepNumber": 1,
      "tool": "tool_name",
      "parameters": { "param1": "value1", "param2": "value2" },
      "reasoning": "Why this step is needed",
      "requiresConfirmation": true
    }
  ]
}

CRITICAL RULES:
- Return ONLY the JSON object, no explanations, no markdown, no code blocks
- For conversational requests, return {"goal": "description", "steps": []} with an empty steps array
- For tool-based requests, use tool names exactly as listed above
- Only include parameters that the tool accepts
- Set requiresConfirmation to true for destructive operations (write_file, submit_form, close_tab, execute_python)
- Set requiresConfirmation to false for read-only operations
- Keep steps focused and atomic
- Maximum 10 steps per plan
- Remember: Simple greetings and casual conversation = empty steps array, no tools needed`;

    const messages: CoreMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userMessage,
      },
    ];

    const result = await streamText({
      model: this.model,
      messages,
      temperature: 0.3, // Lower temperature for more structured output
      maxRetries: 2,
      // Try to use response format if available (OpenAI supports this)
      ...(this.provider === "openai" && {
        experimental_telemetry: undefined,
      }),
    });

    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    console.log("LLM Response for action plan:", fullText);

    // Try to extract JSON from response
    let jsonText = fullText.trim();
    
    // Remove markdown code blocks if present
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    } else {
      // Try to find JSON object - look for the first { and last }
      const firstBrace = jsonText.indexOf("{");
      const lastBrace = jsonText.lastIndexOf("}");
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      } else {
        // Try regex as fallback
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
      }
    }

    // Clean up any leading/trailing whitespace or text
    jsonText = jsonText.trim();
    
    // Remove any text before the first {
    const firstBraceIndex = jsonText.indexOf("{");
    if (firstBraceIndex > 0) {
      jsonText = jsonText.substring(firstBraceIndex);
    }

    if (!jsonText || !jsonText.startsWith("{")) {
      console.error("=== ACTION PLAN PARSING ERROR ===");
      console.error("Full LLM response:", fullText);
      console.error("Extracted JSON text:", jsonText);
      console.error("===================================");
      throw new Error(`No valid JSON found. LLM returned: ${fullText.substring(0, 500)}`);
    }

    try {
      const plan = JSON.parse(jsonText) as ActionPlan;
      
      // Validate plan structure
      if (!plan.steps || !Array.isArray(plan.steps)) {
        console.error("Invalid plan structure. Plan object:", plan);
        throw new Error("Invalid action plan structure: steps must be an array (can be empty for conversational requests)");
      }

      // Validate each step (only if steps exist)
      // Empty steps array is valid for conversational requests
      if (plan.steps.length > 0) {
        for (const step of plan.steps) {
          if (!step.stepNumber || !step.tool || !step.parameters || !step.reasoning) {
            console.error("Invalid step:", step);
            throw new Error(`Invalid step structure: missing required fields in step ${step.stepNumber}`);
          }
        }
      }

      console.log("Successfully parsed action plan:", plan);
      return plan;
    } catch (error) {
      console.error("=== JSON PARSE ERROR ===");
      console.error("Parse error:", error);
      console.error("Attempted to parse:", jsonText.substring(0, 500));
      console.error("Full LLM response:", fullText.substring(0, 1000));
      console.error("========================");
      throw new Error(`JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async requestConfirmation(step: ActionStep, messageId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const confirmationId = `confirm-${messageId}-${step.stepNumber}`;
      
      // Send confirmation request to renderer
      this.webContents.send("agent-confirmation-request", {
        id: confirmationId,
        step,
      });

      // Set up one-time listener for response using IPC
      // The response comes back through IPC and is forwarded by EventManager
      const handler = (_event: any, data: { id: string; confirmed: boolean }) => {
        if (data.id === confirmationId) {
          ipcMain.removeListener("agent-confirmation-response", handler);
          resolve(data.confirmed);
        }
      };

      ipcMain.on("agent-confirmation-response", handler);

      // Timeout after 60 seconds
      setTimeout(() => {
        ipcMain.removeListener("agent-confirmation-response", handler);
        resolve(false);
      }, 60000);
    });
  }

  private async handleStepFailure(
    step: ActionStep,
    result: ToolResult,
    originalRequest: string
  ): Promise<boolean> {
    if (!this.model) {
      return false;
    }

    // For certain errors, automatically retry once
    const retryableErrors = ["Script failed to execute", "Element not found", "timeout"];
    const shouldAutoRetry = retryableErrors.some(error => result.error?.includes(error));
    
    if (shouldAutoRetry) {
      await this.streamReasoning({
        type: "executing",
        content: `Retrying step ${step.stepNumber} after error...`,
        stepNumber: step.stepNumber,
      });
      
      // Wait a bit before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Retry the step
      const retryResult = await this.toolRegistry.execute(
        step.tool,
        step.parameters,
        this.window?.activeTab?.id
      );
      
      if (retryResult.success) {
        this.executionResults.push({ step: step.stepNumber, result: retryResult });
        await this.streamReasoning({
          type: "executing",
          content: `Step ${step.stepNumber} succeeded on retry`,
          stepNumber: step.stepNumber,
        });
        return true;
      }
    }

    // Ask LLM if we should continue
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: "You are an AI agent. A step in your action plan failed. Decide whether to continue with the next step or abort the plan.",
      },
      {
        role: "user",
        content: `Original request: ${originalRequest}\n\nFailed step: ${step.stepNumber}\nTool: ${step.tool}\nError: ${result.error}\n\nShould I continue with the next step or abort? Respond with only "continue" or "abort".`,
      },
    ];

    const response = await streamText({
      model: this.model,
      messages,
      temperature: 0.3,
    });

    let decision = "";
    for await (const chunk of response.textStream) {
      decision += chunk;
    }

    return decision.toLowerCase().trim().includes("continue");
  }

  private async generateConversationalResponse(userMessage: string, isAboutCapabilities: boolean = false): Promise<string> {
    if (!this.model) {
      const toolsList = this.toolRegistry.getAll().map(t => `- ${t.name}: ${t.description}`).join("\n");
      return `Hello! I'm an AI agent integrated into this browser. I can help you with various tasks using these tools:\n\n${toolsList}\n\nHow can I help you today?`;
    }

    // Get available tools information
    const toolsList = this.toolRegistry.getAll()
      .map(t => `- **${t.name}**: ${t.description} (category: ${t.category})`)
      .join("\n");

    // Get page context if available and not asking about capabilities
    let pageContext = "";
    if (!isAboutCapabilities && this.window?.activeTab) {
      try {
        const pageText = await this.window.activeTab.getTabText();
        if (pageText) {
          const truncated = pageText.substring(0, 500);
          pageContext = `\n\nCurrent page context: ${truncated}...`;
        }
      } catch (error) {
        // Ignore errors getting page context
      }
    }

    const systemPrompt = isAboutCapabilities
      ? `You are a friendly AI agent integrated into a web browser. The user is asking about your capabilities and tools. 

Available tools you have access to:
${toolsList}

Respond helpfully about what you can do and how you can help the user. Be specific about the tools and their purposes.`
      : `You are a friendly AI assistant integrated into a web browser. Respond conversationally to the user's greeting or question.${pageContext}`;

    const messages: CoreMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userMessage,
      },
    ];

    const response = await streamText({
      model: this.model,
      messages,
      temperature: DEFAULT_TEMPERATURE,
    });

    let finalText = "";
    for await (const chunk of response.textStream) {
      finalText += chunk;
    }

    return finalText;
  }

  private async generateFinalResponse(originalRequest: string, plan: ActionPlan): Promise<string> {
    if (!this.model) {
      return "Task completed. All steps executed successfully.";
    }

    const resultsSummary = this.executionResults
      .map((r) => `Step ${r.step}: ${r.result.success ? "Success" : `Failed: ${r.result.error}`}`)
      .join("\n");

    const messages: CoreMessage[] = [
      {
        role: "system",
        content: "You are an AI assistant. Summarize what was accomplished based on the action plan and results.",
      },
      {
        role: "user",
        content: `Original request: ${originalRequest}\n\nAction plan goal: ${plan.goal}\n\nExecution results:\n${resultsSummary}\n\nProvide a brief summary of what was accomplished.`,
      },
    ];

    const response = await streamText({
      model: this.model,
      messages,
      temperature: DEFAULT_TEMPERATURE,
    });

    let finalText = "";
    for await (const chunk of response.textStream) {
      finalText += chunk;
    }

    return finalText;
  }

  private streamReasoning(update: ReasoningUpdate): void {
    this.webContents.send("agent-reasoning-update", update);
  }

  private sendFinalResponse(messageId: string, content: string): void {
    // Send the response
    this.webContents.send("chat-response", {
      messageId,
      content,
      isComplete: true,
    });
    
    // Update messages array via callback
    if (this.onAssistantMessage) {
      this.onAssistantMessage({
        role: "assistant",
        content,
      });
    }
  }

  private sendError(messageId: string, error: string): void {
    const errorContent = `Error: ${error}`;
    this.webContents.send("chat-response", {
      messageId,
      content: errorContent,
      isComplete: true,
    });
    
    // Update messages array via callback
    if (this.onAssistantMessage) {
      this.onAssistantMessage({
        role: "assistant",
        content: errorContent,
      });
    }
  }

}

