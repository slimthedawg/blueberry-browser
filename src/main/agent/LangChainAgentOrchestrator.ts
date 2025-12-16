import { WebContents } from "electron";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import * as dotenv from "dotenv";
import { join } from "path";
import type { Window } from "../Window";
import { getAllLangChainTools } from "./tools/ToolRegistry";
import { getLongTermMemory } from "./memory/LongTermMemory";
import { getBrowserStateManager } from "../BrowserStateManager";
import type { VisualContextSnapshot, DomSnapshotSummary } from "../ExecutionState";
import { toolContextStore } from "./tools/ToolContext";
import { encodingForModel } from "js-tiktoken";

dotenv.config({ path: join(__dirname, "../../.env") });

// Visual context refresh intervals (used for on-demand context, not auto-refresh)
const SCREENSHOT_REFRESH_INTERVAL = 30000; // 30 seconds
const DOM_REFRESH_INTERVAL = 15000; // 15 seconds

interface VisualContext {
  screenshot?: VisualContextSnapshot;
  domSnapshot?: DomSnapshotSummary;
}

export class LangChainAgentOrchestrator {
  private readonly webContents: WebContents;
  private window: Window | null = null;
  private model: BaseChatModel | null = null;
  private agent: any = null; // LangChain agent
  private visualContext: VisualContext = {};
  private lastScreenshotTime: number = 0;
  private lastDomTime: number = 0;
  private currentAbortController: AbortController | null = null;
  private agentActiveTabId: string | null = null; // Track which tab the agent is working on
  private userInteractionListeners: Map<string, () => void> = new Map(); // Track user interactions per tab
  private tokenEncoder: any = null;
  
  // Cached agent components for reuse
  private cachedAgent: any = null;
  private cachedTools: any[] | null = null;
  private lastContextHash: string = '';
  
  // Token estimation thresholds
  private readonly LARGE_TASK_TOKEN_THRESHOLD = 50000; // Warn if estimated tokens > 50k
  private readonly VERY_LARGE_TASK_TOKEN_THRESHOLD = 100000; // Strong warning if > 100k

  constructor(webContents: WebContents, window: Window) {
    this.webContents = webContents;
    this.window = window;
    this.initializeModel();
    
    // Initialize token encoder for estimation
    try {
      this.tokenEncoder = encodingForModel("gpt-4o");
    } catch (error) {
      console.warn("[AGENT] Failed to initialize token encoder:", error);
    }

    // Keep rarely-used private helpers referenced to avoid TS noUnusedLocals warnings.
    // (These are intentionally kept for future agent improvements.)
    void this.getVisualContext;
  }

  /**
   * Safely send agent reasoning updates to the sidebar
   */
  private sendReasoningUpdate(update: { type: string; content: string; stepNumber?: number; toolName?: string }): void {
    try {
      if (this.window?.sidebar?.view?.webContents) {
        this.window.sidebar.view.webContents.send("agent-reasoning-update", update);
      } else {
        // Fallback to main webContents if sidebar not available
        this.webContents.send("agent-reasoning-update", update);
      }
    } catch (error) {
      console.warn("[AGENT] Failed to send reasoning update:", error);
    }
  }

  private async initializeModel(): Promise<void> {
    try {
      const provider = process.env.LLM_PROVIDER?.toLowerCase() || "openai";
      const modelName = process.env.LLM_MODEL || (provider === "anthropic" ? "claude-3-5-sonnet-20241022" : "gpt-4o");
      
      // Initialize model based on provider
      if (provider === "anthropic") {
        this.model = new ChatAnthropic({
          modelName,
          temperature: 0.3,
          maxTokens: 4000,
        }) as BaseChatModel;
      } else {
        this.model = new ChatOpenAI({
          modelName,
          temperature: 0.3,
          maxTokens: 4000,
          timeout: 30000,
        }) as BaseChatModel;
      }

      // Initialize tools once (they're a fixed set)
      // Tools will fetch context dynamically via toolContextStore
      this.cachedTools = getAllLangChainTools(this.window!, this.window?.activeTab?.id);
      
      // Add debugging wrapper to each tool to catch schema errors
      const debuggedTools = this.cachedTools.map(tool => {
        const originalInvoke = tool.invoke.bind(tool);
        tool.invoke = async (input: any, config?: any) => {
          try {
            console.log(`🔧 [TOOL DEBUG] Invoking: ${tool.name}`);
            console.log(`   Input: ${JSON.stringify(input)}`);
            const result = await originalInvoke(input, config);
            return result;
          } catch (error: any) {
            console.error(`❌ [TOOL ERROR] Tool: ${tool.name}`);
            console.error(`   Input: ${JSON.stringify(input)}`);
            console.error(`   Error: ${error.message}`);
            if (error.name === 'ToolInputParsingException') {
              console.error(`   🔍 SCHEMA VALIDATION FAILED!`);
              console.error(`   Tool schema:`, JSON.stringify(tool.schema, null, 2));
            }
            throw error;
          }
        };
        return tool;
      });

      // Build system prompt
      const enhancedSystemPrompt = this.buildSystemPrompt();

      // Create prompt template with system message
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", enhancedSystemPrompt],
        ["human", "{input}"],
        ["placeholder", "{agent_scratchpad}"],
      ]);

      // Create agent using LangChain's standard agent creation API
      const agent = await createToolCallingAgent({
        llm: this.model,
        tools: debuggedTools,
        prompt: prompt,
      });

      // Wrap in AgentExecutor for execution
      this.cachedAgent = AgentExecutor.fromAgentAndTools({
        agent,
        tools: debuggedTools,
        verbose: false,
      });
      
      this.agent = this.cachedAgent;
      this.lastContextHash = this.getContextHash();

      console.log(`✅ LangChain Agent initialized with ${provider} model: ${modelName}`);
    } catch (error) {
      console.error("❌ Failed to initialize LangChain agent:", error);
      throw error;
    }
  }

  private buildSystemPrompt(): string {
    return `You are an AI agent that helps users accomplish tasks by breaking them down into steps and executing tools.

Available tools:
- Browser tools: 
  * analyze_page_structure: ⭐ USE THIS FIRST after navigation - returns ALL clickable elements, inputs, buttons, links with their exact CSS selectors
  * navigate_to_url: Go to a webpage
  * fill_form: Fill form inputs with values. REQUIRES 'fields' parameter as an object with selector-value pairs. Get selectors from analyze_page_structure!
  * click_element: Click buttons, links, etc. using selector from analyze_page_structure
  * submit_form: Submit a form
  * read_page_content: Extract text content from page
  * create_tab, switch_tab, close_tab: Manage browser tabs
  * capture_screenshot: Take a screenshot for visual inspection (use when you need to see the current page state or are stuck)
  * execute_recording, list_recordings: Replay recorded interactions
  * select_suggestion: Select from dropdown suggestions
- Workspace tools:
  * get_current_workspace: Fetch current/default workspace summary (id, name, widgets)
  * create_widget: Create widget from URL. DEFAULTS: type="website", width=500, height=500. Just provide the URL!
  * delete_widget: Remove widget by id (optionally specify workspaceId; otherwise search)
  * update_widget: Change widget size/position (requires widgetId; optional workspaceId)
  * set_layout_mode: Switch layout to grid/free (optional workspaceId, defaults to standard)
- Filesystem tools: read_file, write_file, list_directory
- Search tools: google_search
- Code tools: execute_python

## MANDATORY: Page Analysis & Cookie Consent Workflow
⚠️ **YOU MUST FOLLOW THIS WORKFLOW FOR EVERY WEB PAGE INTERACTION:**

1. **After navigate_to_url**: IMMEDIATELY call 'analyze_page_structure' to see what's on the page
   - This shows you ALL available buttons, inputs, links, and interactive elements
   - It reveals cookie dialogs, overlays, and pop-ups that might be blocking the page
   - NEVER skip this step - it prevents errors and failed interactions

2. **Check for Cookie Consent**: Most websites show cookie dialogs that MUST be accepted first
   - Common cookie buttons: "Accept all", "Acceptera alla", "Accept", "OK", "Godkänn", "Allow"
   - Cookie dialogs usually appear at the bottom or top of the page
   - analyze_page_structure will show you these buttons with their exact selectors
   - Click the accept button BEFORE attempting any other interactions

3. **After accepting cookies**: Call 'analyze_page_structure' AGAIN to see the full page content
   - The page structure changes after dismissing cookie dialogs
   - This ensures you have accurate selectors for the actual page elements

**EXAMPLE WORKFLOW:**
Step 1: navigate_to_url("https://example.com")
Step 2: analyze_page_structure() → Returns: cookie button "#cookie-accept", search input "#search-box", etc.
Step 3: click_element(selector="#cookie-accept")
Step 4: analyze_page_structure() → Returns: form inputs "#location", "#rooms", "#price", submit button ".search-btn"
Step 5: fill_form(fields={{"#location": "Stockholm", "#rooms": "3", "#price": "5000000"}}, tabId=null)
Step 6: click_element(selector=".search-btn")
Step 7: read_page_content() → Extract search results

**CRITICAL: fill_form ALWAYS needs the 'fields' parameter!**
✅ CORRECT: fill_form(fields={{"#email": "user@test.com", "#password": "pass"}}, tabId=null)
❌ WRONG: fill_form(tabId=null) ← Missing 'fields'!
❌ WRONG: fill_form("#email", "user@test.com") ← Wrong format!

The 'fields' parameter must be an OBJECT with selector-value pairs, where selectors come from analyze_page_structure.

## Planning Guidelines:

1. **Chain-of-Thought Reasoning**: Think step-by-step. For each tool call, explain:
   - Why this tool is needed
   - What information it will provide
   - How it contributes to the overall goal

2. **Subgoal Decomposition**: Break complex tasks into smaller subgoals:
   - Identify the main goal
   - List subgoals needed to achieve it
   - Execute subgoals in logical order

3. **Self-Critique**: Before executing a plan:
   - Verify all required parameters are available
   - Check if the approach is efficient
   - Consider alternative approaches if needed

4. **Reflection**: After each tool execution:
   - Analyze the result
   - Determine if the approach is working
   - Adjust strategy if needed

IMPORTANT DECISION RULES:
1. **For simple greetings or casual conversation** (hi, hello, hey, how are you, thanks, etc.):
   - Respond conversationally without using tools

2. **For questions about YOUR capabilities or tools**:
   - You know your own tools - respond directly without using read_page_content
   - **EXCEPTION**: If the user asks about recordings, use the list_recordings tool

3. **For web page interactions** (THE MOST COMMON TASK):
   - ⭐ **MANDATORY WORKFLOW**:
     a) navigate_to_url(url)
     b) analyze_page_structure() ← REQUIRED! Never skip this!
     c) Handle cookie consent if detected (click accept button)
     d) analyze_page_structure() again after accepting cookies
     e) Now use the selectors from step (d) to interact with the page
   - **WHY THIS MATTERS**: analyze_page_structure gives you the EXACT selectors for every element
   - **NEVER GUESS SELECTORS**: Guessing causes ToolInputParsingException and other errors
   - analyze_page_structure output shows you: buttons, inputs, links, text areas - everything you need

4. **For other tool requests**:
   - Use the appropriate tools to accomplish the task
   - NEVER invent tool names. If the user says "repeat", interpret that as rerunning existing tools (e.g., execute_recording)
   - **IMPORTANT**: For tabId parameters, use technical IDs like "tab-1", "tab-2" (format: "tab-" followed by a number). NEVER use page titles, URLs, or page content as tabId. If you don't know the tab ID, leave tabId empty/null to use the active tab.

5. **For workspace/widgets** - BE ACTION-ORIENTED, USE DEFAULTS:
   - **IMPORTANT**: DON'T ask for size/dimensions - use defaults: 500x500 pixels
   - **IMPORTANT**: DON'T ask which workspace - use the default workspace
   - **IMPORTANT**: Widget type is almost always "website" - use that as default
   - **JUST DO IT**: If user says "create widget for example.com" → immediately call create_widget with:
     * sourceUrl: "https://example.com" (add https:// if missing)
     * type: "website"
     * width: 500
     * height: 500
   - After creating: Report success with the widget ID
   - For delete/update: If widgetId not specified, first call get_current_workspace to see available widgets and pick the right one
   - Only ask questions if the URL is completely unclear (e.g., user just says "create a widget" with no URL)

6. **When to ask questions vs just act**:
   - ASK if: The request is fundamentally unclear (no URL for widget, no target for navigation)
   - DON'T ASK if: You can use sensible defaults (widget size, workspace, type)
   - Prefer ACTION over questions - users want things done, not interrogated

Your task:
1. Analyze the user's request
2. Determine if tools are needed or if this is conversational
3. Use tools appropriately to accomplish the goal
4. Provide clear feedback about what you're doing

Remember: Simple greetings = conversational response, no tools needed.`;
  }

  private async getVisualContext(): Promise<VisualContext> {
    const tab = this.window?.activeTab;
    if (!tab) {
      return {};
    }

    const url = tab.webContents.getURL();
    const now = Date.now();

    // Capture screenshot if needed
    if (
      !this.visualContext.screenshot ||
      this.visualContext.screenshot.url !== url ||
      now - this.lastScreenshotTime > SCREENSHOT_REFRESH_INTERVAL
    ) {
      try {
        const stateManager = getBrowserStateManager();
        const image = await tab.webContents.capturePage();
        const screenshotName = `plan-${Date.now()}`;
        const filepath = await stateManager.saveScreenshot(
          tab.id,
          screenshotName,
          image.toPNG(),
          url
        );

        this.visualContext.screenshot = {
          path: filepath,
          url,
          name: screenshotName,
          capturedAt: now,
          reason: "planning",
        };
        this.lastScreenshotTime = now;
      } catch (error) {
        console.warn("Failed to capture screenshot:", error);
      }
    }

    // Capture DOM snapshot if needed
    if (
      !this.visualContext.domSnapshot ||
      this.visualContext.domSnapshot.url !== url ||
      now - this.lastDomTime > DOM_REFRESH_INTERVAL
    ) {
      try {
        const analysis = await tab.webContents.executeJavaScript(`
          (() => {
            const inputs = document.querySelectorAll('input, textarea').length;
            const buttons = document.querySelectorAll('button, [role="button"]').length;
            const selects = document.querySelectorAll('select').length;
            const links = document.querySelectorAll('a[href]').length;
            
            return {
              elementCount: inputs + buttons + selects + links,
              summary: {
                inputs,
                buttons,
                selects,
                links,
              },
            };
          })();
        `);

        this.visualContext.domSnapshot = {
          url,
          capturedAt: now,
          elementCount: analysis.elementCount,
          summaryText: `${analysis.summary.inputs} inputs, ${analysis.summary.buttons} buttons, ${analysis.summary.selects} selects, ${analysis.summary.links} links`,
        };
        this.lastDomTime = now;
      } catch (error) {
        console.warn("Failed to capture DOM snapshot:", error);
      }
    }

    return this.visualContext;
  }

  /**
   * Get context hash to detect when we need to update tool context
   */
  private getContextHash(): string {
    return `${this.window?.activeTab?.id || 'none'}`;
  }

  /**
   * Update tool context if needed (e.g., after tab operations)
   */
  private updateToolContext(): void {
    if (!this.window) return;
    const nextHash = this.getContextHash();
    if (nextHash === this.lastContextHash) return;
    this.lastContextHash = nextHash;
    toolContextStore.setContext(this.window, this.window?.activeTab?.id);
  }

  async processRequest(userMessage: string, messageId: string, abortSignal?: AbortSignal): Promise<void> {
    if (!this.model) {
      await this.initializeModel();
    }

    if (!this.cachedAgent || !this.cachedTools) {
      this.sendErrorMessage(messageId, "Agent not initialized");
      return;
    }

    // Create abort controller if signal provided
    if (abortSignal) {
      this.currentAbortController = new AbortController();
      // Forward abort from parent signal
      abortSignal.addEventListener('abort', () => {
        console.log(`⏹️ [AGENT] Abort signal received, aborting agent execution`);
        this.currentAbortController?.abort();
      });
    }

    try {
      console.log(`🧠 [AGENT] Incoming message (${messageId}): ${userMessage}`);
      console.log(`🧠 [AGENT] Agent state:`, {
        hasModel: !!this.model,
        hasCachedAgent: !!this.cachedAgent,
        hasCachedTools: !!this.cachedTools,
        toolsCount: this.cachedTools?.length || 0,
        hasAbortSignal: !!abortSignal,
      });
      
      // Update tool context with current active tab (tools fetch this dynamically)
      this.updateToolContext();
      
      // Track which tab the agent is working on
      this.agentActiveTabId = this.window?.activeTab?.id || null;
      
      // Set up user interaction detection for the active tab
      this.setupUserInteractionDetection();

      // Build enhanced system prompt with current context
      let enhancedSystemPrompt = this.buildSystemPrompt();
      
      // Estimate tokens for the task (qualitative guess for large tasks)
      const estimatedTokens = this.estimateTaskTokens(userMessage, enhancedSystemPrompt);
      if (estimatedTokens > this.VERY_LARGE_TASK_TOKEN_THRESHOLD) {
        this.sendReasoningUpdate({
          type: "warning",
          content: `⚠️ This appears to be a very large task (estimated ~${Math.round(estimatedTokens / 1000)}k tokens). It may take significant time and cost. Consider breaking it into smaller subtasks.`,
        });
      } else if (estimatedTokens > this.LARGE_TASK_TOKEN_THRESHOLD) {
        this.sendReasoningUpdate({
          type: "info",
          content: `📊 Estimated task size: ~${Math.round(estimatedTokens / 1000)}k tokens. This is a moderately large task.`,
        });
      }
      
      // Inject memory context
      const longTermMemory = getLongTermMemory();
      const relevantMemories = longTermMemory.getRelevantMemories(userMessage, []);
      if (relevantMemories.patterns.length > 0 || relevantMemories.failures.length > 0) {
        let memoryContext = "\n\n## Relevant Past Experiences:\n";
        if (relevantMemories.patterns.length > 0) {
          memoryContext += "Successful patterns:\n";
          relevantMemories.patterns.slice(0, 3).forEach((pattern, idx) => {
            memoryContext += `${idx + 1}. ${pattern.task} (tools: ${pattern.tools.join(", ")})\n`;
          });
        }
        if (relevantMemories.failures.length > 0) {
          memoryContext += "\nPrevious failures to avoid:\n";
          relevantMemories.failures.slice(0, 2).forEach((failure, idx) => {
            memoryContext += `${idx + 1}. ${failure.task}: ${failure.error}\n`;
            if (failure.solution) {
              memoryContext += `   Solution: ${failure.solution}\n`;
            }
          });
        }
        enhancedSystemPrompt += memoryContext;
      }

      // Visual context is now on-demand - agent should use capture_screenshot tool when needed
      // Removed automatic visual context injection

      // Create prompt template with enhanced system message
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", enhancedSystemPrompt],
        ["human", "{input}"],
        ["placeholder", "{agent_scratchpad}"],
      ]);

      // Recreate agent with updated prompt (tools are cached, only prompt changes)
      const agent = await createToolCallingAgent({
        llm: this.model!,
        tools: this.cachedTools,
        prompt: prompt,
      });

      this.agent = AgentExecutor.fromAgentAndTools({
        agent,
        tools: this.cachedTools,
        verbose: false,
      });

      // Track tool call sequence for workflow validation
      const toolCallSequence: Array<{ tool: string; timestamp: number }> = [];
      let lastToolName: string | null = null;

      // Stream agent execution
      // Send initial planning update
      this.sendReasoningUpdate({
        type: "planning",
        content: "🤔 Analyzing task and planning approach...",
      });

      console.log(`🔄 [AGENT] Starting agent stream...`);

      // AgentExecutor.stream() returns an async iterable
      const streamConfig: any = {
        callbacks: [
            {
              handleLLMStart: () => {
                // Only show thinking indicator, don't spam with tokens
                this.sendReasoningUpdate({
                  type: "planning",
                  content: "💭 Thinking...",
                });
              },
              // NOTE: handleLLMNewToken is intentionally NOT used here
              // Tokens are the actual response content, not reasoning steps
              // They are handled by the stream processing below and sent via chat-response
              handleAgentAction: (action: any) => {
                // Track tool call sequence
                lastToolName = action.tool;
                toolCallSequence.push({
                  tool: action.tool,
                  timestamp: Date.now(),
                });

                // Workflow validation: check for common mistakes
                let workflowWarning = "";
                if (action.tool === "navigate_to_url") {
                  console.log("📍 WORKFLOW: Agent is navigating to a URL. Next step should be analyze_page_structure.");
                  // Send workflow reminder to UI
                  this.sendReasoningUpdate({
                    type: "planning",
                    content: "📍 Navigated to URL. Next: analyze_page_structure to discover page elements.",
                  });
                } else if (action.tool === "click_element" || action.tool === "fill_form" || action.tool === "submit_form") {
                  // Check if analyze_page_structure was called recently
                  const recentTools = toolCallSequence.slice(-5).map(t => t.tool);
                  if (!recentTools.includes("analyze_page_structure")) {
                    workflowWarning = " ⚠️ WARNING: Interacting without analyzing page first!";
                    console.warn(`⚠️ WORKFLOW VIOLATION: Agent calling ${action.tool} without recent analyze_page_structure call`);
                    console.warn(`   Recent tools: ${recentTools.join(" → ")}`);
                    
                    // Send warning to UI
                    this.sendReasoningUpdate({
                      type: "error",
                      content: `⚠️ WORKFLOW WARNING: Calling ${action.tool} without analyzing page structure first. This may fail. You should call analyze_page_structure after navigate_to_url to get correct selectors.`,
                    });
                  }
                }

                // Extract parameters for display
                const params = action.toolInput || action.tool_input || {};
                const paramStr = Object.keys(params).length > 0 
                  ? `(${Object.entries(params).map(([k, v]) => `${k}: ${typeof v === 'string' ? v.substring(0, 50) : JSON.stringify(v)}`).join(', ')})`
                  : '';
                
                this.sendReasoningUpdate({
                  type: "executing",
                  content: `🔧 Calling: ${action.tool} ${paramStr}${workflowWarning}`,
                  toolName: action.tool,
                });

                // Log tool call sequence
                console.log(`📊 TOOL SEQUENCE: ${toolCallSequence.map(t => t.tool).join(" → ")}`);
              },
              handleToolStart: (tool: any) => {
                this.sendReasoningUpdate({
                  type: "executing",
                  content: `⚙️ Executing tool: ${tool.name}...`,
                  toolName: tool.name,
                });
              },
              handleToolEnd: (output: any) => {
                const outputPreview = typeof output === "string" 
                  ? output.substring(0, 150) 
                  : JSON.stringify(output).substring(0, 150);
                const suffix = (typeof output === "string" ? output.length : JSON.stringify(output).length) > 150 ? "..." : "";
                
                this.sendReasoningUpdate({
                  type: "executing",
                  content: `✅ Result: ${outputPreview}${suffix}`,
                });
                
                // Update tool context after tab operations
                // This ensures subsequent tools use the correct active tab
                if (lastToolName && (lastToolName === "create_tab" || lastToolName === "switch_tab" || lastToolName === "close_tab")) {
                  this.updateToolContext();
                  console.log(`🔄 Updated tool context after ${lastToolName} operation. New active tab: ${this.window?.activeTab?.id || 'none'}`);
                }
              },
              handleToolError: (error: any) => {
                // Send detailed error information to UI
                const errorMessage = error.message || String(error);
                const errorDetails = error.stack ? `\n${error.stack.split('\n').slice(0, 3).join('\n')}` : '';
                const fullError = `❌ Tool error: ${errorMessage}${errorDetails}`;
                
                console.error(`❌ [AGENT ERROR] Tool error:`, error);
                
                this.sendReasoningUpdate({
                  type: "error",
                  content: fullError,
                  toolName: error.toolName || error.name,
                });
              },
              handleLLMError: (error: any) => {
                // Catch LLM reasoning errors
                const errorMessage = error.message || String(error);
                console.error(`❌ [AGENT ERROR] LLM error:`, error);
                
                this.sendReasoningUpdate({
                  type: "error",
                  content: `❌ LLM reasoning error: ${errorMessage}`,
                });
              },
              handleAgentEnd: () => {
                this.sendReasoningUpdate({
                  type: "completed",
                  content: "✨ Task completed",
                });
              },
            },
          ],
        };

      // Add abort signal to stream config if available
      if (this.currentAbortController) {
        streamConfig.signal = this.currentAbortController.signal;
      }

      console.log(`🚀 [AGENT] Calling agent.stream()...`);
      const stream = await this.agent.stream(
        {
          input: userMessage,
          chat_history: [],
        },
        streamConfig
      );
      console.log(`✅ [AGENT] Stream created, starting to process chunks...`);
      console.log(`📊 [AGENT] Stream type:`, typeof stream, stream ? 'exists' : 'null');

      let accumulatedContent = "";
      const toolsUsed: string[] = [];
      let chunkCount = 0;

      // AgentExecutor.stream() yields intermediate steps
      for await (const chunk of stream) {
        chunkCount++;
        // Log EVERY chunk for debugging
        console.log(`📦 [AGENT] Chunk ${chunkCount}:`, JSON.stringify(chunk).substring(0, 200));
        if (chunkCount % 10 === 0) {
          console.log(`📦 [AGENT] Processed ${chunkCount} chunks...`);
        }
        // Check if aborted
        if (this.currentAbortController?.signal.aborted) {
          console.log(`⏹️ [AGENT] Stream aborted, breaking loop`);
          this.sendReasoningUpdate({
            type: "error",
            content: "⏹️ Request cancelled by user",
          });
          break;
        }
        // Handle different chunk types from AgentExecutor
        if (chunk.agent?.messages) {
          const messages = chunk.agent.messages;
          const latestMessage = messages[messages.length - 1];

          // Stream model tokens (AIMessage content)
          if (latestMessage instanceof AIMessage) {
            if (latestMessage.content) {
              let content = "";
              if (typeof latestMessage.content === "string") {
                content = latestMessage.content;
              } else if (Array.isArray(latestMessage.content)) {
                content = latestMessage.content
                  .map((c: any) => {
                    if (typeof c === "string") return c;
                    if (c.type === "text" && c.text) return c.text;
                    return "";
                  })
                  .join("");
              }

              if (content && content.length > accumulatedContent.length) {
                const newContent = content.slice(accumulatedContent.length);
                accumulatedContent = content;

                // Stream new content to sidebar in real-time
                this.webContents.send("chat-response", {
                  messageId,
                  content: newContent,
                  isComplete: false,
                });
              }
            }

            // Track tool calls
            if (latestMessage.tool_calls && Array.isArray(latestMessage.tool_calls)) {
              for (const toolCall of latestMessage.tool_calls) {
                if (!toolsUsed.includes(toolCall.name)) {
                  toolsUsed.push(toolCall.name);
                }
              }
            }
          }
        }

        // Handle tool results
        if (chunk.tools) {
          for (const toolResult of chunk.tools) {
            // Tool results are already handled by callbacks, but we can track tools used
            if (toolResult.tool && !toolsUsed.includes(toolResult.tool)) {
              toolsUsed.push(toolResult.tool);
            }
          }
        }

        // Final output
        if (chunk.output) {
          const output = typeof chunk.output === "string" ? chunk.output : JSON.stringify(chunk.output);
          console.log(`📤 [AGENT] Chunk has output:`, output.substring(0, 100));
          if (output && output !== accumulatedContent) {
            const newContent = output.slice(accumulatedContent.length);
            accumulatedContent = output;
            this.webContents.send("chat-response", {
              messageId,
              content: newContent,
              isComplete: false,
            });
          }
        }
      }

      console.log(`🏁 [AGENT] Stream loop completed. Total chunks: ${chunkCount}, Accumulated content length: ${accumulatedContent.length}`);
      console.log(`📝 [AGENT] Final accumulated content:`, accumulatedContent.substring(0, 200) || "(empty)");

      // Final response
      this.webContents.send("chat-response", {
        messageId,
        content: accumulatedContent,
        isComplete: true,
      });

      // Store successful pattern if task completed
      if (toolsUsed.length > 0) {
        const longTermMemory = getLongTermMemory();
        // Extract steps from accumulated content or tool calls
        const steps = toolsUsed.map((tool, idx) => `Step ${idx + 1}: ${tool}`);
        await longTermMemory.storeSuccessfulPattern(
          userMessage,
          steps,
          toolsUsed
        );
      }
    } catch (error) {
      console.error("Error in LangChain agent:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Send detailed error reasoning update to UI
      let detailedError = errorMessage;
      if (error instanceof Error && error.name === 'ToolInputParsingException') {
        detailedError = `ToolInputParsingException: ${errorMessage}\n\nThis usually means the agent tried to call a tool with incorrect parameters. Check the tool schema and ensure all required parameters are provided.`;
        
        // Try to extract tool name and parameters from error
        const toolMatch = errorMessage.match(/tool[:\s]+(\w+)/i);
        if (toolMatch) {
          detailedError += `\n\nTool: ${toolMatch[1]}`;
        }
      }
      
      this.sendReasoningUpdate({
        type: "error",
        content: `❌ Agent execution failed: ${detailedError}`,
      });
      
      this.sendErrorMessage(messageId, errorMessage);

      // Store failed attempt
      const longTermMemory = getLongTermMemory();
      await longTermMemory.storeFailedAttempt(userMessage, errorMessage);
    } finally {
      // Clear abort controller when done
      this.currentAbortController = null;
    }
  }

  abortCurrentRequest(): void {
    if (this.currentAbortController) {
      console.log("⏹️ [AGENT] Aborting current request");
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    // Clean up user interaction listeners
    this.cleanupUserInteractionDetection();
  }

  /**
   * Set up detection for user interactions on the agent's active tab
   * If user interacts with the tab the agent is working on, trigger recalculation
   */
  private setupUserInteractionDetection(): void {
    if (!this.window || !this.agentActiveTabId) return;

    const tab = this.window.allTabs.find((t) => t.id === this.agentActiveTabId) || null;
    if (!tab) return;

    // Clean up any existing listeners
    this.cleanupUserInteractionDetection();

    // Inject script to detect user interactions (clicks, keyboard input)
    const interactionScript = `
      (function() {
        let interactionDetected = false;
        
        const detectInteraction = () => {
          if (!interactionDetected) {
            interactionDetected = true;
            // Use console.log with special marker that BrowserStateManager can detect
            console.log('[USER-INTERACTION]', JSON.stringify({ tabId: '${this.agentActiveTabId}', timestamp: Date.now() }));
          }
        };
        
        // Listen for clicks, keyboard input, form changes
        document.addEventListener('click', detectInteraction, true);
        document.addEventListener('keydown', detectInteraction, true);
        document.addEventListener('input', detectInteraction, true);
        document.addEventListener('change', detectInteraction, true);
        
        // Store cleanup function
        window.__cleanupInteractionDetection = () => {
          document.removeEventListener('click', detectInteraction, true);
          document.removeEventListener('keydown', detectInteraction, true);
          document.removeEventListener('input', detectInteraction, true);
          document.removeEventListener('change', detectInteraction, true);
        };
      })();
    `;

    try {
      tab.webContents.executeJavaScript(interactionScript).catch(() => {});
      
      // Listen for console messages that contain user interaction markers
      const handleInteraction = () => {
        console.log(`👆 [AGENT] User interaction detected on agent's active tab ${this.agentActiveTabId}`);
        this.sendReasoningUpdate({
          type: "planning",
          content: "⚠️ User interaction detected on active tab. The agent will check the current page state before continuing.",
        });
        
        // Trigger a recalculation by updating tool context
        this.updateToolContext();
        
        // Note: The agent will naturally use analyze_page_structure or capture_screenshot 
        // in its next tool call to see the current state after user interaction
      };

      // Listen for console messages from the tab
      const consoleHandler = (_level: number, message: string) => {
        if (typeof message === 'string' && message.includes('[USER-INTERACTION]')) {
          try {
            const jsonStart = message.indexOf('[USER-INTERACTION]') + '[USER-INTERACTION]'.length;
            const jsonPart = message.substring(jsonStart).trim();
            if (jsonPart) {
              const data = JSON.parse(jsonPart);
              if (data.tabId === this.agentActiveTabId) {
                handleInteraction();
              }
            }
          } catch (error) {
            // Ignore parse errors
          }
        }
      };

      // Use the console-message event (old format but still works)
      (tab.webContents as any).on("console-message", consoleHandler);

      // Store listener for cleanup
      this.userInteractionListeners.set(this.agentActiveTabId, () => {
        (tab.webContents as any).removeListener("console-message", consoleHandler);
      });
    } catch (error) {
      console.warn("[AGENT] Failed to set up user interaction detection:", error);
    }
  }

  /**
   * Clean up user interaction detection listeners
   */
  private cleanupUserInteractionDetection(): void {
    if (this.agentActiveTabId && this.window) {
      const tab = this.window.allTabs.find((t) => t.id === this.agentActiveTabId) || null;
      if (tab) {
        // Clean up injected script
        try {
          tab.webContents.executeJavaScript(`
            if (window.__cleanupInteractionDetection) {
              window.__cleanupInteractionDetection();
            }
          `).catch(() => {});
        } catch (error) {
          // Ignore errors
        }
      }
    }
    this.userInteractionListeners.clear();
    this.agentActiveTabId = null;
  }

  private sendErrorMessage(messageId: string, errorMessage: string): void {
    this.webContents.send("chat-response", {
      messageId,
      content: errorMessage,
      isComplete: true,
    });
  }

  /**
   * Estimate token count for a task (qualitative guess for large tasks)
   * This provides a rough estimate before execution to warn about potentially expensive operations
   */
  private estimateTaskTokens(userMessage: string, systemPrompt: string): number {
    if (!this.tokenEncoder) {
      // Fallback: rough estimate (1 token ≈ 4 characters for English)
      const totalChars = userMessage.length + systemPrompt.length;
      return Math.ceil(totalChars / 4);
    }
    
    try {
      // Estimate tokens for user message + system prompt
      const userTokens = this.tokenEncoder.encode(userMessage).length;
      const systemTokens = this.tokenEncoder.encode(systemPrompt).length;
      
      // Add estimated overhead for:
      // - Tool descriptions (~5k tokens)
      // - Agent reasoning/planning (~10k tokens for complex tasks)
      // - Tool outputs (~5k-20k depending on task)
      const estimatedOverhead = 20000;
      
      // For tasks that mention multiple actions, multiply by estimated iterations
      const actionKeywords = ['then', 'after', 'next', 'also', 'and then', 'finally'];
      const actionCount = actionKeywords.reduce((count, keyword) => 
        count + (userMessage.toLowerCase().split(keyword).length - 1), 1
      );
      
      const baseEstimate = userTokens + systemTokens + estimatedOverhead;
      const totalEstimate = baseEstimate * Math.min(actionCount, 5); // Cap at 5x multiplier
      
      console.log(`[AGENT] Token estimation: user=${userTokens}, system=${systemTokens}, overhead=${estimatedOverhead}, actions=${actionCount}, total≈${totalEstimate}`);
      
      return totalEstimate;
    } catch (error) {
      console.warn("[AGENT] Token estimation failed:", error);
      // Fallback
      const totalChars = userMessage.length + systemPrompt.length;
      return Math.ceil(totalChars / 4) + 20000;
    }
  }
}

