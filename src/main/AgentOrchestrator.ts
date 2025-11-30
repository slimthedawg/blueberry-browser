import { WebContents, ipcMain } from "electron";
import { streamText, type LanguageModel, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import * as dotenv from "dotenv";
import { join } from "path";
import type { Window } from "./Window";
import { ToolRegistry, createToolRegistry } from "./tools";
import type { ToolResult } from "./tools/ToolDefinition";
import type { ExecutionState } from "./ExecutionState";
import { createExecutionState } from "./ExecutionState";
import { classifyError } from "./ErrorClassifier";
import { getBrowserStateManager } from "./BrowserStateManager";

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
  private executionState: ExecutionState | null = null;

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


  /**
   * Observe step result and capture page state
   */
  private async observeStepResult(
    step: ActionStep,
    result: ToolResult,
    currentTabId?: string
  ): Promise<string> {
    const observations: string[] = [];
    
    // Capture page state after navigation/click/submit
    if (step.tool === "navigate_to_url" || 
        step.tool === "click_element" || 
        step.tool === "submit_form") {
      try {
        const tab = currentTabId 
          ? this.window?.getTab(currentTabId) 
          : this.window?.activeTab;
        
        if (tab) {
          // Update URL in context
          this.executionState!.context.currentUrl = tab.url;
          
          // Read page content if successful
          if (result.success) {
            try {
                  const pageText = await tab.getTabText();
                  if (pageText) {
                    this.executionState!.context.lastPageContent = pageText.substring(0, 1000);
                    if (step.tool === "navigate_to_url") {
                      observations.push(`Navigated to ${tab.url}. Page loaded successfully.`);
                    } else if (step.tool === "click_element") {
                      observations.push(`Clicked element. Page updated: ${tab.url}`);
                    } else if (step.tool === "submit_form") {
                      observations.push(`Form submitted. Page updated: ${tab.url}`);
                    }
                  }
            } catch (e) {
              // Ignore errors reading page
            }
          }
        }
      } catch (e) {
        // Ignore observation errors
      }
    }
    
    // Capture page structure after analysis
    if (step.tool === "analyze_page_structure" && result.success && result.result?.elements) {
      const elements = result.result.elements;
      this.executionState!.context.pageElements = elements;
      this.executionState!.context.lastPageAnalysis = result.result;
      
      // Count element types for better reasoning
      const inputCount = elements.filter((el: any) => el.type === "input").length;
      const buttonCount = elements.filter((el: any) => el.type === "button" || el.type === "link").length;
      const selectCount = elements.filter((el: any) => el.type === "select").length;
      
      observations.push(`Found ${elements.length} interactive elements: ${inputCount} inputs, ${selectCount} selects, ${buttonCount} buttons/links`);
    }
    
    // Capture content after reading
    if (step.tool === "read_page_content" && result.success && result.result?.content) {
      const content = typeof result.result.content === 'string' 
        ? result.result.content 
        : JSON.stringify(result.result.content);
      this.executionState!.context.lastPageContent = content.substring(0, 1000);
      observations.push(`Read page content: ${content.substring(0, 200)}...`);
    }
    
    // General observation
    if (result.success) {
      observations.push(`Step ${step.stepNumber} (${step.tool}) completed successfully`);
      if (result.message) {
        observations.push(`Result: ${result.message}`);
      }
    } else {
      observations.push(`Step ${step.stepNumber} (${step.tool}) failed: ${result.error}`);
    }
    
    const observationText = observations.join(". ");
    
    // Store observation
    this.executionState!.observations.push({
      stepNumber: step.stepNumber,
      observation: observationText,
      timestamp: Date.now(),
    });
    
    return observationText;
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

      // Initialize execution state
      this.executionState = createExecutionState(plan);

      // Send action plan to UI for display
      this.webContents.send("agent-action-plan", {
        goal: plan.goal,
        steps: plan.steps,
      });

      // Step 2: Execute plan adaptively with replanning after every step
      let stepIndex = 0;
      const MAX_ITERATIONS = 100; // Safety limit to prevent infinite loops
      let iterations = 0;
      
      while (stepIndex < this.executionState.currentPlan.steps.length && iterations < MAX_ITERATIONS) {
        iterations++;
        const step = this.executionState.currentPlan.steps[stepIndex];

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

        // Get current tab ID
        let currentTabId = this.window?.activeTab?.id;
        if (step.parameters?.tabId) {
          currentTabId = String(step.parameters.tabId);
        }

        // Prepare step parameters
        const stepParams = { ...step.parameters };
        if (currentTabId && !stepParams.tabId) {
          stepParams.tabId = currentTabId;
        }

        // Stream that we're executing the step (immediately, no await)
        this.streamReasoning({
          type: "executing",
          content: `Executing ${step.tool}...`,
          stepNumber: step.stepNumber,
          toolName: step.tool,
        });

        // Execute the step
        let result: ToolResult;
        try {
          result = await this.toolRegistry.execute(step.tool, stepParams, currentTabId);
          
          // Stream result immediately with better context
          if (result.success) {
            let message = result.message || "Success";
            if (step.tool === "fill_form" && stepParams.fields) {
              const fieldValues = Object.entries(stepParams.fields)
                .map(([selector, value]) => `${selector}='${value}'`)
                .join(', ');
              message = `Form filled: ${fieldValues}`;
            } else if (step.tool === "click_element" && stepParams.selector) {
              message = `Clicked element: ${stepParams.selector}`;
            } else if (step.tool === "navigate_to_url" && stepParams.url) {
              message = `Navigated to ${stepParams.url}`;
            }
            
            this.streamReasoning({
              type: "executing",
              content: message,
              stepNumber: step.stepNumber,
              toolName: step.tool,
            });
          } else {
            this.streamReasoning({
              type: "error",
              content: `${step.tool} failed: ${result.error}`,
              stepNumber: step.stepNumber,
              toolName: step.tool,
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          result = {
            success: false,
            error: errorMsg,
          };
          this.streamReasoning({
            type: "error",
            content: `${step.tool} error: ${errorMsg}`,
            stepNumber: step.stepNumber,
            toolName: step.tool,
          });
        }

        // Observe step result
        await this.observeStepResult(step, result, currentTabId);

        this.executionResults.push({ step: step.stepNumber, result });

        // Handle step result
        if (!result.success) {
          // Classify error
          const errorType = classifyError(result.error || "", step.tool);
          
          // Track failure
          const failedInfo = this.executionState.failedSteps.get(step.stepNumber) || {
            step,
            error: result.error || "Unknown error",
            retryCount: 0,
            errorType,
            taskType: step.tool,
          };
          failedInfo.retryCount++;
          this.executionState.failedSteps.set(step.stepNumber, failedInfo);
          
          // Track task failure count
          const taskFailures = this.executionState.taskFailureCounts.get(step.tool) || 0;
          this.executionState.taskFailureCounts.set(step.tool, taskFailures + 1);
          
          // Get error context (console logs, screenshots) for better debugging
          let errorContext = "";
          if (currentTabId) {
            const stateManager = getBrowserStateManager();
            const context = stateManager.getErrorContext(currentTabId);
            if (context.recentErrors.length > 0) {
              errorContext = `\nRecent console errors: ${context.recentErrors.map(e => e.message).join(", ")}`;
            }
            if (context.lastScreenshot) {
              errorContext += `\nLast screenshot: ${context.lastScreenshot}`;
            }
          }

          await this.streamReasoning({
            type: "error",
            content: `Step failed: ${result.error}. Error type: ${errorType}. Retry count: ${failedInfo.retryCount}${errorContext}`,
            stepNumber: step.stepNumber,
            toolName: step.tool,
          });

          // Handle unrecoverable errors
          if (errorType === "UNRECOVERABLE") {
            await this.streamReasoning({
              type: "error",
              content: `Unrecoverable error: ${result.error}. Stopping execution.`,
              stepNumber: step.stepNumber,
            });
            this.sendFinalResponse(messageId, `Plan execution stopped after step ${step.stepNumber} due to unrecoverable error: ${result.error}`);
            return;
          }

          // Handle retries based on error type
          let retrySuccess = false;
          
          if (errorType === "PARAMETER_ERROR") {
            // Auto-fix parameter errors (no retry limit)
            retrySuccess = await this.handleParameterError(step, stepParams, currentTabId, userMessage);
          } else if (errorType === "ELEMENT_NOT_FOUND") {
            // Retry element not found (max 3 times)
            if (failedInfo.retryCount <= 3) {
              retrySuccess = await this.handleElementNotFoundError(step, stepParams, currentTabId, userMessage, failedInfo.retryCount);
            } else {
              // After 3 retries, ask user for help
              retrySuccess = await this.requestUserGuidanceForElement(step, stepParams, currentTabId, userMessage, messageId);
            }
          } else {
            // For other errors, check if same task failed 3 times
            const taskFailureCount = this.executionState.taskFailureCounts.get(step.tool) || 0;
            if (taskFailureCount >= 3) {
              // Ask user for help
              retrySuccess = await this.requestUserGuidanceForTask(step, stepParams, currentTabId, userMessage, messageId);
            }
          }
          
          if (!retrySuccess) {
            // Mark step as failed and continue to replanning
            await this.streamReasoning({
              type: "error",
              content: `Step ${step.stepNumber} failed after retries. Will replan.`,
              stepNumber: step.stepNumber,
            });
          } else {
            // Retry succeeded - update result
            result = await this.toolRegistry.execute(step.tool, stepParams, currentTabId);
            this.executionResults[this.executionResults.length - 1] = { step: step.stepNumber, result };
            await this.observeStepResult(step, result, currentTabId);
          }
        }
        
        // Record completed step
        if (result.success) {
          this.executionState.completedSteps.push({ step, result });
          // Remove from failed steps if it was there
          this.executionState.failedSteps.delete(step.stepNumber);
        }

        // After analyze_page_structure completes successfully, auto-generate form steps
        if (step.tool === "analyze_page_structure" && result.success && result.result?.elements) {
          const elements = result.result.elements;
          await this.streamReasoning({
            type: "planning",
            content: `Found ${elements.length} interactive elements. Analyzing form fields and generating interaction steps...`,
            stepNumber: step.stepNumber,
          });

          const formSteps = await this.generateFormStepsFromElements(userMessage, elements, currentTabId);
          if (formSteps.length > 0) {
            // Insert form steps into plan right after analysis
            const insertIndex = stepIndex + 1;
            this.executionState.currentPlan.steps.splice(insertIndex, 0, ...formSteps);
            // Renumber all steps
            this.executionState.currentPlan.steps.forEach((s, idx) => {
              s.stepNumber = idx + 1;
            });

            // Update UI
            this.webContents.send("agent-action-plan", {
              goal: this.executionState.currentPlan.goal,
              steps: this.executionState.currentPlan.steps,
            });

            await this.streamReasoning({
              type: "planning",
              content: `Generated ${formSteps.length} interaction step(s) based on discovered page elements.`,
            });
          }
        }

        // Check goal achievement after every step
        const goalAchieved = await this.checkIfGoalAchieved(userMessage, this.executionState.currentPlan, result, currentTabId);
        if (goalAchieved) {
          this.executionState.goalAchieved = true;
          await this.streamReasoning({
            type: "completed",
            content: "Goal appears to be achieved!",
          });
          break;
        }

        // Only replan when needed (after failures, when stuck)
        if (await this.shouldReplan(step, result)) {
          await this.streamReasoning({
            type: "planning",
            content: `Re-evaluating plan after step ${step.stepNumber}...`,
          });

          const newPlan = await this.replanWithContext(userMessage, this.executionState);
          if (newPlan && newPlan.steps.length > 0) {
            // Update plan
            this.executionState.currentPlan = newPlan;
            
            // Update UI
            this.webContents.send("agent-action-plan", {
              goal: newPlan.goal,
              steps: newPlan.steps,
            });
            
            await this.streamReasoning({
              type: "planning",
              content: `Plan updated. Continuing with ${newPlan.steps.length} step(s).`,
            });
            
            // Reset step index to start from beginning of new plan
            stepIndex = 0;
            continue;
          }
        }

        // Move to next step
        stepIndex++;
      }

      // Step 3: Generate final response
      await this.streamReasoning({
        type: "completed",
        content: "All steps completed. Generating final response...",
      });

      const finalResponse = await this.generateFinalResponse(userMessage, this.executionState.currentPlan);
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

  /**
   * Handle parameter errors - auto-fix and retry
   */
  private async handleParameterError(
    step: ActionStep,
    stepParams: Record<string, any>,
    currentTabId: string | undefined,
    userMessage: string
  ): Promise<boolean> {
    await this.streamReasoning({
      type: "executing",
      content: `Fixing parameter format and retrying...`,
      stepNumber: step.stepNumber,
      toolName: step.tool,
    });

    // Try multiple normalization strategies (same as before)
    const strategies = [
      // Strategy 1: Direct field/value conversion
      () => {
        if (step.tool === "fill_form" && stepParams.field && stepParams.value) {
          return { fields: { [stepParams.field]: stepParams.value } };
        }
        return null;
      },
      // Strategy 2: Any key-value that looks like field/value
      () => {
        if (step.tool === "fill_form") {
          const keys = Object.keys(stepParams).filter(k => k !== "tabId");
          if (keys.length >= 1) {
            const fieldKey = keys.find(k => /[#\.\[\]]/.test(String(stepParams[k]))) || keys[0];
            const valueKey = keys.find(k => k !== fieldKey && typeof stepParams[k] === "string");
            if (fieldKey && valueKey) {
              return { fields: { [stepParams[fieldKey]]: stepParams[valueKey] } };
            } else if (keys.length === 1) {
              const value = stepParams[keys[0]];
              const fields: Record<string, any> = {};
              fields['input[type="text"]'] = value;
              fields['input[type="search"]'] = value;
              fields['input'] = value;
              return { fields };
            }
          }
        }
        return null;
      },
      // Strategy 3: For select_suggestion, try to infer fieldSelector
      () => {
        if (step.tool === "select_suggestion") {
          const keys = Object.keys(stepParams).filter(k => k !== "tabId" && k !== "suggestionText" && k !== "suggestionIndex");
          if (keys.length > 0) {
            return { fieldSelector: stepParams[keys[0]] };
          }
        }
        return null;
      },
    ];

    for (const strategy of strategies) {
      try {
        const fixedParams = strategy();
        if (fixedParams) {
          const mergedParams = { ...stepParams, ...fixedParams };
          Object.keys(stepParams).forEach(k => {
            if (k !== "tabId" && !(k in fixedParams) && k !== "suggestionText" && k !== "suggestionIndex") {
              delete mergedParams[k];
            }
          });
          
          const fixedResult = await this.toolRegistry.execute(step.tool, mergedParams, currentTabId);
          if (fixedResult.success) {
            // Update stepParams for caller
            Object.assign(stepParams, mergedParams);
            await this.streamReasoning({
              type: "executing",
              content: `Successfully fixed and completed!`,
              stepNumber: step.stepNumber,
              toolName: step.tool,
            });
            return true;
          }
        }
      } catch (e) {
        // Try next strategy
      }
    }
    return false;
  }

  /**
   * Handle element not found errors - retry with page analysis
   */
  private async handleElementNotFoundError(
    step: ActionStep,
    stepParams: Record<string, any>,
    currentTabId: string | undefined,
    userMessage: string,
    retryCount: number
  ): Promise<boolean> {
    if (retryCount > 3) return false;

    await this.streamReasoning({
      type: "planning",
      content: `Element not found (retry ${retryCount}/3). Analyzing page structure...`,
      stepNumber: step.stepNumber,
      toolName: step.tool,
    });

    try {
      const analysisResult = await this.toolRegistry.execute("analyze_page_structure", { tabId: currentTabId }, currentTabId);
      if (analysisResult.success && analysisResult.result?.elements) {
        const elements = analysisResult.result.elements;
        
        // Use LLM to find matching elements
        const matchingElements = await this.findMatchingElements(step, userMessage, elements, step.tool);
        
        // Try each matching element
        for (const matchingElement of matchingElements.slice(0, 5)) { // Limit to top 5
          await this.streamReasoning({
            type: "executing",
            content: `Trying element: ${matchingElement.selector}`,
            stepNumber: step.stepNumber,
            toolName: step.tool,
          });

          const retryParams = { ...stepParams };
          if (step.tool === "click_element") {
            retryParams.selector = matchingElement.selector;
          } else if (step.tool === "fill_form") {
            const fieldKey = Object.keys(stepParams.fields || {})[0];
            if (fieldKey) {
              retryParams.fields = { [matchingElement.selector]: stepParams.fields[fieldKey] };
            }
          } else if (step.tool === "select_suggestion") {
            retryParams.fieldSelector = matchingElement.selector;
          }

          const retryResult = await this.toolRegistry.execute(step.tool, retryParams, currentTabId);
          if (retryResult.success) {
            // Update stepParams for caller
            Object.assign(stepParams, retryParams);
            await this.streamReasoning({
              type: "executing",
              content: `Successfully completed with element: ${matchingElement.selector}!`,
              stepNumber: step.stepNumber,
              toolName: step.tool,
            });
            return true;
          }
        }
      }
    } catch (e) {
      console.error("Error in element retry:", e);
    }
    return false;
  }

  /**
   * Request user guidance for element
   */
  private async requestUserGuidanceForElement(
    step: ActionStep,
    stepParams: Record<string, any>,
    currentTabId: string | undefined,
    userMessage: string,
    messageId: string
  ): Promise<boolean> {
    const elementType = step.tool === "click_element" ? "button or link" : 
                      step.tool === "fill_form" ? "input field" : "suggestion";
    const guidanceMessage = step.tool === "click_element" 
      ? `I couldn't find the ${elementType} after 3 attempts. Could you please click on it to show me where it is?`
      : step.tool === "fill_form"
      ? `I couldn't find the ${elementType} after 3 attempts. Could you please click on it to show me where it is?`
      : `I couldn't find the suggestion after 3 attempts. Could you please click on it to show me?`;
    
    await this.streamReasoning({
      type: "planning",
      content: `Asking for your help to locate the element...`,
      stepNumber: step.stepNumber,
    });

    const guidance = await this.requestUserGuidance(guidanceMessage, elementType, step.stepNumber);

    if (!guidance.cancelled && guidance.selector) {
      await this.streamReasoning({
        type: "executing",
        content: `Using element you selected. Retrying...`,
        stepNumber: step.stepNumber,
      });

      const retryParams = { ...stepParams };
      if (step.tool === "click_element") {
        retryParams.selector = guidance.selector;
      } else if (step.tool === "fill_form") {
        const fieldKey = Object.keys(stepParams.fields || {})[0];
        if (fieldKey) {
          retryParams.fields = { [guidance.selector]: stepParams.fields[fieldKey] };
        }
      }

      const retryResult = await this.toolRegistry.execute(step.tool, retryParams, currentTabId);
      if (retryResult.success) {
        Object.assign(stepParams, retryParams);
        await this.streamReasoning({
          type: "executing",
          content: `Successfully completed with your help!`,
          stepNumber: step.stepNumber,
          toolName: step.tool,
        });
        return true;
      }
    } else if (guidance.cancelled) {
      await this.streamReasoning({
        type: "error",
        content: `User cancelled guidance request.`,
        stepNumber: step.stepNumber,
      });
    }
    return false;
  }

  /**
   * Request user guidance for task failure
   */
  private async requestUserGuidanceForTask(
    step: ActionStep,
    stepParams: Record<string, any>,
    currentTabId: string | undefined,
    userMessage: string,
    messageId: string
  ): Promise<boolean> {
    await this.streamReasoning({
      type: "planning",
      content: `Task ${step.tool} has failed 3 times. Asking for your help...`,
      stepNumber: step.stepNumber,
    });

    // For now, just log and continue - could implement task-specific guidance
    await this.streamReasoning({
      type: "error",
      content: `Task ${step.tool} failed 3 times. Will try alternative approach.`,
      stepNumber: step.stepNumber,
    });
    
    return false; // Let replanning handle it
  }

  /**
   * Determine if replanning is needed
   */
  private async shouldReplan(
    step: ActionStep,
    result: ToolResult
  ): Promise<boolean> {
    // Replan if step failed after retries
    if (!result.success) {
      const failedInfo = this.executionState?.failedSteps.get(step.stepNumber);
      if (failedInfo && failedInfo.retryCount >= 3) {
        return true; // Failed after retries, need to replan
      }
    }

    // Don't replan after successful steps (except analyze_page_structure which triggers auto-generation)
    if (result.success && step.tool !== "analyze_page_structure") {
      return false;
    }

    // Replan if we're stuck (no progress for a while)
    // This is a simple check - could be enhanced
    const recentFailures = Array.from(this.executionState?.failedSteps.values() || [])
      .filter(fs => fs.retryCount >= 3);
    
    if (recentFailures.length >= 2) {
      return true; // Multiple steps failed, need to replan
    }

    return false;
  }

  /**
   * Replan with current context
   */
  private async replanWithContext(
    originalRequest: string,
    state: ExecutionState
  ): Promise<ActionPlan | null> {
    if (!this.model) return null;

    // Get available tools
    const toolSchemas = this.toolRegistry.getSchemas();
    const toolsDescription = toolSchemas
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join("\n");

    // Build context summary
    const completedSummary = state.completedSteps.map(cs => 
      `Step ${cs.step.stepNumber}: ${cs.step.tool} - ${cs.result.success ? "Success" : "Failed"}`
    ).join('\n');
    
    const failedSummary = Array.from(state.failedSteps.values()).map(fs =>
      `Step ${fs.step.stepNumber}: ${fs.step.tool} - Failed ${fs.retryCount} times (${fs.errorType})`
    ).join('\n');
    
    const observationsSummary = state.observations.slice(-5).map(obs => obs.observation).join('\n');
    
    const contextInfo = `
Current URL: ${state.context.currentUrl || "Unknown"}
Page Elements: ${state.context.pageElements?.length || 0} elements available
Last Page Content: ${state.context.lastPageContent ? state.context.lastPageContent.substring(0, 500) + "..." : "None"}
`;

    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an AI agent that needs to replan based on execution context.

Original goal: ${state.originalPlan.goal}

Completed steps:
${completedSummary || "None yet"}

Failed steps:
${failedSummary || "None"}

Recent observations:
${observationsSummary || "None"}

Current context:
${contextInfo}

Available tools (USE EXACT NAMES):
${toolsDescription}

Your task: Generate a NEW plan that:
1. Continues from where we left off
2. Addresses any failed steps with alternative approaches
3. Incorporates new information discovered
4. Works toward the original goal

CRITICAL RULES:
- Each step MUST have a "tool" field with an EXACT tool name from the list above
- Use ONLY tool names from the "Available tools" list
- Return ONLY a JSON object with this exact structure:
{
  "goal": "description",
  "steps": [
    {
      "stepNumber": 1,
      "tool": "exact_tool_name_from_list_above",
      "parameters": { ... },
      "reasoning": "why this step",
      "requiresConfirmation": false
    }
  ]
}

Return ONLY the JSON object, no explanations.`,
      },
      {
        role: "user",
        content: `Replan to accomplish: ${originalRequest}`,
      },
    ];

    try {
      const result = await streamText({
        model: this.model,
        messages,
        temperature: 0.3,
        maxRetries: 2,
      });

      let fullText = "";
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      // Extract JSON (same logic as generateActionPlan)
      let jsonText = fullText.trim();
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      } else {
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonText = jsonText.substring(firstBrace, lastBrace + 1);
        }
      }

      const newPlan = JSON.parse(jsonText) as ActionPlan;
      
      // Validate
      if (!newPlan.steps || !Array.isArray(newPlan.steps)) {
        return null;
      }

      // Validate and filter steps - ensure each has a valid tool name
      const validSteps = newPlan.steps.filter((s: any) => {
        // Must have a tool name
        if (!s.tool || typeof s.tool !== 'string' || s.tool.trim() === '') {
          console.warn(`Replan step ${s.stepNumber || 'unknown'} has invalid tool: ${s.tool}`);
          return false;
        }
        
        // Tool must exist in registry
        const tool = this.toolRegistry.get(s.tool);
        if (!tool) {
          console.warn(`Replan step ${s.stepNumber || 'unknown'} uses unknown tool: ${s.tool}`);
          return false;
        }
        
        // Must have parameters object
        if (!s.parameters || typeof s.parameters !== 'object') {
          console.warn(`Replan step ${s.stepNumber || 'unknown'} missing parameters`);
          s.parameters = {};
        }
        
        return true;
      });

      if (validSteps.length === 0) {
        console.warn("Replan produced no valid steps");
        return null;
      }

      // Renumber steps
      validSteps.forEach((s, idx) => {
        s.stepNumber = idx + 1;
      });

      return {
        goal: newPlan.goal || state.originalPlan.goal,
        steps: validSteps,
      };
    } catch (error) {
      console.error("Error replanning:", error);
      return null;
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
   - **CRITICAL**: When interacting with web pages (filling forms, clicking buttons), ALWAYS use analyze_page_structure as the FIRST step after navigate_to_url to discover available elements
   - Only use read_page_content when the user explicitly wants to read/analyze page content
   - DO NOT guess selectors - use analyze_page_structure first, then generate steps based on the discovered elements

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
          
          // Validate tool exists in registry
          const tool = this.toolRegistry.get(step.tool);
          if (!tool) {
            console.error(`Invalid tool name in step ${step.stepNumber}: ${step.tool}`);
            throw new Error(`Invalid tool name "${step.tool}" in step ${step.stepNumber}. Available tools: ${this.toolRegistry.getAll().map(t => t.name).join(', ')}`);
          }
        }
      }

      console.log("Successfully parsed action plan:", plan);
      
      // Post-process: Ensure analyze_page_structure is included after navigate_to_url
      // if the plan involves web interactions (fill_form, click_element, submit_form)
      const hasWebInteractions = plan.steps.some(s => 
        s.tool === "fill_form" || s.tool === "click_element" || s.tool === "submit_form" || s.tool === "select_suggestion"
      );
      const hasNavigation = plan.steps.some(s => s.tool === "navigate_to_url");
      const hasAnalysis = plan.steps.some(s => s.tool === "analyze_page_structure");
      
      if (hasWebInteractions && hasNavigation && !hasAnalysis) {
        // Find the navigate_to_url step
        const navIndex = plan.steps.findIndex(s => s.tool === "navigate_to_url");
        if (navIndex >= 0) {
          // Insert analyze_page_structure right after navigation
          const navStep = plan.steps[navIndex];
          const analysisStep: ActionStep = {
            stepNumber: navStep.stepNumber + 1,
            tool: "analyze_page_structure",
            parameters: navStep.parameters?.tabId ? { tabId: navStep.parameters.tabId } : {},
            reasoning: "Analyze the page structure to discover all available interactive elements (inputs, buttons, selects) before interacting with them.",
            requiresConfirmation: false,
          };
          
          // Renumber subsequent steps
          plan.steps.splice(navIndex + 1, 0, analysisStep);
          for (let i = navIndex + 2; i < plan.steps.length; i++) {
            plan.steps[i].stepNumber = i + 1;
          }
          
          console.log("Injected analyze_page_structure step after navigation");
        }
      }

      // Post-process: Mark steps with guessed/bad selectors for replacement after analysis
      // This helps us identify which steps need to be regenerated
      plan.steps.forEach(s => {
        if (s.tool === "fill_form" || s.tool === "click_element" || s.tool === "select_suggestion") {
          const params = s.parameters || {};
          const selector = params.selector || Object.keys(params.fields || {})[0] || params.fieldSelector || "";
          const isBadSelector = selector.includes("search_field") || 
                               (selector.includes("input[name=") && selector.includes("search")) ||
                               selector === "input" || 
                               selector === "button" ||
                               (selector.includes("placeholder*=") && selector.includes("search"));
          if (isBadSelector) {
            // Mark this step as needing replacement
            (s as any)._needsReplacement = true;
            console.log(`Marked step ${s.stepNumber} for replacement (bad selector: ${selector})`);
          }
        }
      });
      
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
    // Auto-accept in test mode
    if (process.env.AUTO_TEST_MESSAGE === "true") {
      await this.streamReasoning({
        type: "executing",
        content: `Auto-confirming step ${step.stepNumber} (test mode)`,
        stepNumber: step.stepNumber,
      });
      return true;
    }

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

  // handleStepFailure removed - replaced by automatic retry logic in processRequest

  /**
   * Check if we need more steps based on current progress
   * This enables dynamic replanning during execution
   */
  private async checkIfNeedsMoreSteps(
    originalRequest: string,
    currentPlan: ActionPlan,
    currentStepIndex: number,
    lastResult: ToolResult,
    _tabId?: string
  ): Promise<ActionStep[]> {
    if (!this.model) {
      return [];
    }

    // Get context about what we've discovered
    let pageContext = "";
    if (lastResult.result) {
      if (lastResult.result.elements) {
        // From analyze_page_structure
        const elements = lastResult.result.elements;
        pageContext = `Found ${elements.length} interactive elements on the page: ${elements.slice(0, 10).map((e: any) => `${e.type} (${e.semantic || e.text || 'no label'})`).join(', ')}`;
      } else if (lastResult.result.content) {
        // From read_page_content
        const content = typeof lastResult.result.content === 'string' 
          ? lastResult.result.content 
          : JSON.stringify(lastResult.result.content);
        pageContext = `Page content: ${content.substring(0, 500)}...`;
      }
    }

    // Get what we've done so far
    const completedSteps = currentPlan.steps.slice(0, currentStepIndex);
    const remainingSteps = currentPlan.steps.slice(currentStepIndex);
    const completedActions = completedSteps.map(s => `${s.tool}: ${s.reasoning}`).join('\n');
    const remainingActions = remainingSteps.map(s => `${s.tool}: ${s.reasoning}`).join('\n');

    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an AI agent executing a task. After each key step (like analyzing a page or reading content), you should check if you need to add more steps to complete the goal.

IMPORTANT: Only suggest NEW steps if:
1. You discovered something that requires additional actions
2. The current plan is missing critical steps
3. You need to interact with newly discovered elements

Do NOT suggest steps that are already in the remaining steps list.
Do NOT suggest steps that duplicate what's already been done.

Return ONLY a JSON array of new ActionStep objects, or an empty array [] if no new steps are needed.

Format:
[
  {
    "stepNumber": <next_number>,
    "tool": "tool_name",
    "parameters": {...},
    "reasoning": "why this step is needed",
    "requiresConfirmation": false
  }
]`,
      },
      {
        role: "user",
        content: `Original request: ${originalRequest}

Goal: ${currentPlan.goal}

Completed so far:
${completedActions || "None yet"}

Remaining planned steps:
${remainingActions || "None"}

What I just discovered:
${pageContext || "No new information"}

Do I need additional steps to complete the goal? If yes, what steps? Return ONLY a JSON array.`,
      },
    ];

    try {
      const result = await streamText({
        model: this.model,
        messages,
        maxRetries: 2,
      });

      let fullText = "";
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      // Extract JSON array
      let jsonText = fullText.trim();
      const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonText = arrayMatch[0];
      }

      const newSteps = JSON.parse(jsonText) as ActionStep[];
      
      // Validate and number the steps correctly
      if (Array.isArray(newSteps) && newSteps.length > 0) {
        const nextStepNumber = currentPlan.steps.length + 1;
        return newSteps.map((step, idx) => ({
          ...step,
          stepNumber: nextStepNumber + idx,
        }));
      }

      return [];
    } catch (error) {
      console.error("Error checking if needs more steps:", error);
      return [];
    }
  }

  /**
   * Check if the goal has been achieved
   */
  private async checkIfGoalAchieved(
    originalRequest: string,
    currentPlan: ActionPlan,
    lastResult: ToolResult,
    _tabId?: string
  ): Promise<boolean> {
    if (!this.model) {
      return false;
    }

    // Get current page context
    let pageContext = "";
    try {
      if (this.window?.activeTab) {
        const pageText = await this.window.activeTab.getTabText();
        if (pageText) {
          pageContext = pageText.substring(0, 1000);
        }
      }
    } catch (e) {
      // Ignore errors
    }

    const messages: CoreMessage[] = [
      {
        role: "system",
        content: "You are an AI agent. Determine if the user's goal has been achieved based on the current state. Respond with ONLY 'yes' or 'no'.",
      },
      {
        role: "user",
        content: `Original request: ${originalRequest}

Goal: ${currentPlan.goal}

Current page content:
${pageContext || "Unable to read page"}

Last action result: ${lastResult.message || "Success"}

Has the goal been achieved? Respond with only "yes" or "no".`,
      },
    ];

    try {
      const result = await streamText({
        model: this.model,
        messages,
        maxRetries: 2,
      });

      let response = "";
      for await (const chunk of result.textStream) {
        response += chunk;
      }

      return response.toLowerCase().trim().includes("yes");
    } catch (error) {
      console.error("Error checking if goal achieved:", error);
      return false;
    }
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

  /**
   * Request user guidance to click on an element
   */
  /**
   * Auto-generate form-filling steps from discovered page elements
   * This is a simpler, more direct approach than using LLM
   */
  private async generateFormStepsFromElements(
    userMessage: string,
    elements: any[],
    tabId: string | undefined
  ): Promise<ActionStep[]> {
    const steps: ActionStep[] = [];
    let stepNumber = 1;

    // Extract values from user message
    const userLower = userMessage.toLowerCase();
    
    // Extract location (look for city names, "in [city]", etc.)
    let locationValue: string | null = null;
    const locationPatterns = [
      /(?:in|at|from|location|address|stad|plats|where)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:apartment|appartment|flat|house|property)/i,
    ];
    for (const pattern of locationPatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        locationValue = match[1];
        break;
      }
    }
    // Fallback: look for common city names
    if (!locationValue) {
      const cities = ["Stockholm", "Gothenburg", "Malmö", "Uppsala", "Linköping"];
      for (const city of cities) {
        if (userLower.includes(city.toLowerCase())) {
          locationValue = city;
          break;
        }
      }
    }

    // Extract room count
    let roomsValue: string | null = null;
    const roomsMatch = userMessage.match(/(\d+)\s*(?:room|rum|bedroom|bedrooms)/i);
    if (roomsMatch) {
      roomsValue = roomsMatch[1];
    }

    // Extract price
    let priceValue: string | null = null;
    const pricePatterns = [
      /(?:max|maximum|up to|under|below)\s*(\d+(?:\s*\d+)?)\s*(?:million|miljon|m|sek|kr|kronor)/i,
      /(\d+(?:\s*\d+)?)\s*(?:million|miljon|m)\s*(?:sek|kr|kronor)?/i,
    ];
    for (const pattern of pricePatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        let price = match[1].replace(/\s+/g, '');
        // Convert to number if it's in millions
        if (userLower.includes('million') || userLower.includes('miljon')) {
          priceValue = String(parseInt(price) * 1000000);
        } else {
          priceValue = price;
        }
        break;
      }
    }

    // Find form fields by semantic matching
    const inputElements = elements.filter((el: any) => 
      el.type === "input" || el.type === "select" || el.type === "textarea"
    );

    // Find location field
    const locationField = this.findFieldBySemantic(inputElements, [
      "location", "address", "stad", "plats", "sök", "search", "where", "city", "ort"
    ], locationValue);

    // Find rooms field
    const roomsField = this.findFieldBySemantic(inputElements, [
      "rum", "room", "rooms", "antal", "bedroom", "bedrooms", "rum antal"
    ], roomsValue);

    // Find price field
    const priceField = this.findFieldBySemantic(inputElements, [
      "pris", "price", "max", "maximum", "budget", "maxpris", "max price"
    ], priceValue);

    // Build form fields object
    const formFields: Record<string, string> = {};
    if (locationField && locationValue) {
      formFields[locationField.selector] = locationValue;
    }
    if (roomsField && roomsValue) {
      formFields[roomsField.selector] = roomsValue;
    }
    if (priceField && priceValue) {
      formFields[priceField.selector] = priceValue;
    }

    // Generate fill_form step if we have fields to fill
    if (Object.keys(formFields).length > 0) {
      const fieldDescriptions = Object.entries(formFields)
        .map(([selector, value]) => `${selector}='${value}'`)
        .join(', ');
      
      steps.push({
        stepNumber: stepNumber++,
        tool: "fill_form",
        parameters: {
          fields: formFields,
          tabId: tabId,
        },
        reasoning: `Fill search form with: ${fieldDescriptions}`,
        requiresConfirmation: false,
      });
    }

    // Find submit/search button
    const buttonElements = elements.filter((el: any) => 
      el.type === "button" || el.type === "link" || el.type === "a"
    );

    const searchButton = this.findButtonBySemantic(buttonElements, [
      "search", "sök", "find", "submit", "filter", "apply", "go"
    ]);

    if (searchButton) {
      steps.push({
        stepNumber: stepNumber++,
        tool: "click_element",
        parameters: {
          selector: searchButton.selector,
          tabId: tabId,
        },
        reasoning: `Click search button to find apartments`,
        requiresConfirmation: false,
      });
    }

    return steps;
  }

  /**
   * Find form field by semantic matching
   */
  private findFieldBySemantic(
    elements: any[],
    keywords: string[],
    value: string | null
  ): any | null {
    for (const element of elements) {
      const searchText = [
        element.label || '',
        element.placeholder || '',
        element.semantic || '',
        element.text || '',
        element.selector || '',
      ].join(' ').toLowerCase();

      for (const keyword of keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          return element;
        }
      }
    }
    return null;
  }

  /**
   * Find button by semantic matching
   */
  private findButtonBySemantic(
    elements: any[],
    keywords: string[]
  ): any | null {
    for (const element of elements) {
      const searchText = [
        element.label || '',
        element.text || '',
        element.semantic || '',
        element.selector || '',
      ].join(' ').toLowerCase();

      for (const keyword of keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          return element;
        }
      }
    }
    return null;
  }

  /**
   * Generate interaction steps from page analysis results
   */
  private async generateStepsFromAnalysis(
    userMessage: string,
    elements: any[],
    originalSteps: ActionStep[],
    tabId: string | undefined,
    startStepNumber: number
  ): Promise<ActionStep[]> {
    if (!this.model || elements.length === 0) {
      return [];
    }

    // Create a summary of available elements
    const elementsSummary = elements.slice(0, 100).map((el: any) => 
      `Selector: ${el.selector}, Type: ${el.type}, Label: ${el.label || 'none'}, Text: ${el.text || 'none'}, Semantic: ${el.semantic || 'none'}, Placeholder: ${el.placeholder || 'none'}`
    ).join('\n');

    // Summarize what the original steps were trying to do
    const originalIntent = originalSteps.map(s => `${s.tool}: ${s.reasoning}`).join('\n');

    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an AI agent that needs to generate interaction steps based on page analysis.

The user wants to: ${userMessage}

Available elements on the page:
${elementsSummary}

Original steps that were planned (but had bad selectors):
${originalIntent}

Your task: Generate NEW steps using the EXACT selectors from the elements list above. Match the user's intent to the right elements semantically.

IMPORTANT RULES:
1. Use the EXACT selector from the elements list (e.g., "#sok-bostad", "input[name='location']")
2. For location/address fields: look for elements with semantic/label containing "location", "address", "stad", "plats", "sök", "search"
3. For room count: look for "rum", "room", "antal"
4. For price: look for "pris", "price", "max", "maximum"
5. For buttons: match the action (search, submit, filter, etc.)
6. Extract values from user message (e.g., "Stockholm", "4 rooms", "5 million SEK")

Return ONLY a JSON array of ActionStep objects:
[
  {
    "stepNumber": ${startStepNumber},
    "tool": "fill_form" | "click_element" | "select_suggestion" | "submit_form",
    "parameters": {
      "tabId": "${tabId || ''}",
      "fields": {"selector": "value"} // for fill_form
      OR
      "selector": "selector" // for click_element
      OR
      "fieldSelector": "selector", "suggestionText": "text" // for select_suggestion
      OR
      "formSelector": "selector" // for submit_form
    },
    "reasoning": "Why this step is needed",
    "requiresConfirmation": false
  }
]

Return ONLY the JSON array, no other text.`,
      },
      {
        role: "user",
        content: `Generate steps to accomplish: ${userMessage}`,
      },
    ];

    try {
      const result = await streamText({
        model: this.model,
        messages,
        maxRetries: 2,
      });

      let fullText = "";
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      // Extract JSON array
      let jsonText = fullText.trim();
      
      // Remove markdown code blocks
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      } else {
        const arrayMatch = jsonText.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          jsonText = arrayMatch[0];
        }
      }

      const steps = JSON.parse(jsonText) as ActionStep[];
      
      // Validate and ensure tabId is set
      if (Array.isArray(steps) && steps.length > 0) {
        return steps
          .filter(s => s.tool && s.parameters && s.reasoning)
          .map((s, idx) => ({
            ...s,
            stepNumber: startStepNumber + idx,
            parameters: {
              ...s.parameters,
              tabId: tabId || s.parameters.tabId || undefined,
            },
          }));
      }

      return [];
    } catch (error) {
      console.error("Error generating steps from analysis:", error);
      return [];
    }
  }

  /**
   * Use LLM to intelligently find matching elements based on user intent
   */
  private async findMatchingElements(
    step: ActionStep,
    userMessage: string,
    elements: any[],
    toolType: string
  ): Promise<Array<{ selector: string; semantic?: string; text?: string; label?: string }>> {
    if (!this.model || elements.length === 0) {
      return [];
    }

    // Filter elements by type
    let relevantElements = elements;
    if (toolType === "fill_form" || toolType === "select_suggestion") {
      relevantElements = elements.filter((el: any) => el.type === "input" || el.type === "select" || el.type === "textarea");
    } else if (toolType === "click_element") {
      relevantElements = elements.filter((el: any) => el.type === "button" || el.type === "link" || el.type === "a");
    }

    if (relevantElements.length === 0) {
      return [];
    }

    // Create a summary of available elements
    const elementsSummary = relevantElements.slice(0, 50).map((el: any, idx: number) => 
      `${idx + 1}. Selector: ${el.selector}, Type: ${el.type}, Label: ${el.label || 'none'}, Text: ${el.text || 'none'}, Semantic: ${el.semantic || 'none'}, Placeholder: ${el.placeholder || 'none'}`
    ).join('\n');

    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an AI agent trying to find the right element on a web page to interact with.

The user wants to: ${step.reasoning}
Original user request: ${userMessage}

Available elements on the page:
${elementsSummary}

Your task: Return a JSON array of element indices (1-based) that match what the user wants. Order them by relevance (most relevant first).

Return ONLY a JSON array like: [1, 3, 5] or [] if none match.

Be smart about matching - check ALL fields (label, placeholder, semantic, text, selector):
- For location/address fields: look for "location", "address", "stad", "plats", "sök", "search", "where", "city", "ort"
- For room count: look for "rum", "room", "rooms", "antal", "bedroom", "bedrooms"
- For price: look for "pris", "price", "max", "maximum", "budget", "maxpris"
- For buttons: match the action described (search, sök, submit, filter, apply, go, find)

Return ONLY the JSON array, no other text.`,
      },
      {
        role: "user",
        content: `Find elements that match: ${step.reasoning}`,
      },
    ];

    try {
      const result = await streamText({
        model: this.model,
        messages,
        maxRetries: 2,
      });

      let fullText = "";
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      // Extract JSON array
      let jsonText = fullText.trim();
      const arrayMatch = jsonText.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        jsonText = arrayMatch[0];
      }

      const indices = JSON.parse(jsonText) as number[];
      
      if (Array.isArray(indices) && indices.length > 0) {
        // Convert 1-based indices to 0-based and get elements
        const matched = indices
          .map(idx => relevantElements[idx - 1]) // Convert to 0-based
          .filter(el => el != null) // Remove invalid indices
          .map(el => ({
            selector: el.selector,
            semantic: el.semantic,
            text: el.text,
            label: el.label,
          }));
        
        return matched;
      }

      // Fallback: if LLM returns empty, try simple keyword matching
      const keywords = [
        ...(step.reasoning || '').toLowerCase().split(/\s+/),
        ...(userMessage || '').toLowerCase().split(/\s+/),
      ].filter(k => k.length > 2);

      const fallbackMatches = relevantElements
        .filter((el: any) => {
          const searchText = `${el.semantic || ''} ${el.text || ''} ${el.label || ''} ${el.placeholder || ''} ${el.selector || ''}`.toLowerCase();
          return keywords.some(keyword => searchText.includes(keyword));
        })
        .slice(0, 5) // Limit to top 5
        .map((el: any) => ({
          selector: el.selector,
          semantic: el.semantic,
          text: el.text,
          label: el.label,
        }));

      return fallbackMatches;
    } catch (error) {
      console.error("Error finding matching elements:", error);
      
      // Fallback to simple keyword matching
      const keywords = [
        ...(step.reasoning || '').toLowerCase().split(/\s+/),
        ...(userMessage || '').toLowerCase().split(/\s+/),
      ].filter(k => k.length > 2);

      return relevantElements
        .filter((el: any) => {
          const searchText = `${el.semantic || ''} ${el.text || ''} ${el.label || ''} ${el.placeholder || ''}`.toLowerCase();
          return keywords.some(keyword => searchText.includes(keyword));
        })
        .slice(0, 5)
        .map((el: any) => ({
          selector: el.selector,
          semantic: el.semantic,
          text: el.text,
          label: el.label,
        }));
    }
  }

  private async requestUserGuidance(
    message: string,
    elementType: string,
    stepNumber: number
  ): Promise<{ selector?: string; elementInfo?: any; cancelled: boolean }> {
    return new Promise((resolve) => {
      const guidanceId = `guidance-${Date.now()}-${Math.random()}`;
      
      // Send guidance request to UI
      this.webContents.send("agent-guidance-request", {
        id: guidanceId,
        message,
        elementType,
        stepNumber,
      });

      // Listen for response via IPC (forwarded by EventManager)
      const responseHandler = (_event: any, data: { id: string; selector?: string; elementInfo?: any; cancelled?: boolean }) => {
        if (data.id === guidanceId) {
          ipcMain.removeListener("agent-guidance-response", responseHandler);
          resolve({
            selector: data.selector,
            elementInfo: data.elementInfo,
            cancelled: data.cancelled || false,
          });
        }
      };

      ipcMain.on("agent-guidance-response", responseHandler);

      // Timeout after 60 seconds
      setTimeout(() => {
        ipcMain.removeListener("agent-guidance-response", responseHandler);
        resolve({ cancelled: true });
      }, 60000);
    });
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

