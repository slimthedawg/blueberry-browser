import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { getWorkspaceManager, Workspace, Widget } from "./WorkspaceManager";
import { getWidgetManager } from "./widgets/WidgetManager";
import { getWebsiteAnalyzer } from "./widgets/WebsiteAnalyzer";
import { randomUUID } from "crypto";

// Note: Workspace refresh notifications are now handled by EventManager.notifyWorkspaceTabsToRefresh()
// after each workspace-ai-chat IPC call, which properly targets WebContentsView tabs

type LLMProvider = "openai" | "anthropic";

/**
 * WorkspaceAIChat
 * AI chat for workspace customization. Translates natural language into workspace
 * and widget mutations (create, edit, delete widgets, change layout, etc.)
 */
export class WorkspaceAIChat {
  private model: any = null;
  private conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

  constructor() {
    this.initializeModel();
  }

  private initializeModel(): void {
    const provider = (process.env.LLM_PROVIDER?.toLowerCase() || "openai") as LLMProvider;
    const modelName = process.env.LLM_MODEL || (provider === "anthropic" ? "claude-3-5-sonnet-20241022" : "gpt-4o");

    if (provider === "anthropic") {
      this.model = anthropic(modelName);
    } else {
      this.model = openai(modelName);
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
    console.log("[WorkspaceAIChat] Conversation history cleared");
  }

  getHistoryLength(): number {
    return this.conversationHistory.length;
  }

  async handleMessage(message: string): Promise<string> {
    if (!this.model) {
      console.error("[WorkspaceAIChat] Model not initialized");
      return "AI-modellen är inte initierad. Kontrollera LLM_PROVIDER och LLM_MODEL miljövariabler.";
    }

    console.log(`[WorkspaceAIChat] Handling message (history: ${this.conversationHistory.length} messages):`, message.substring(0, 100));

    try {
      // Get current workspace context
      const workspaceManager = getWorkspaceManager();
      const defaultWorkspace = await workspaceManager.getDefaultWorkspace();
      const allWorkspaces = await workspaceManager.listWorkspaces();

      const workspaceContext = defaultWorkspace
        ? `Nuvarande standard arbetsyta: "${defaultWorkspace.name}" (${defaultWorkspace.widgets.length} widgets)`
        : "Ingen standard arbetsyta hittades.";

      const systemPrompt = `Du är en AI-assistent som hjälper användare att anpassa arbetsytor (workspaces) i en webbläsare.

${workspaceContext}
Tillgängliga arbetsytor: ${allWorkspaces.map((w) => w.name).join(", ")}

## Tillgängliga verktyg (tools):

1. **getCurrentWorkspace** - Hämta information om den nuvarande standard-arbetsytan
   - Returnerar: workspace ID, namn, antal widgets, och lista över widgets

2. **createWidget** - Skapa en ny widget från en webbplats-URL
   - Parametrar: type ("website" eller "custom"), sourceUrl (webbplats-URL), width (standard: 800), height (standard: 600)
   - Exempel: "lägg till en widget från hemnet.se" eller "skapa en widget från https://example.com"

3. **deleteWidget** - Ta bort en widget från arbetsytan
   - Parametrar: widgetId (ID för widgeten som ska tas bort)
   - Exempel: "ta bort widget med ID xyz" eller "ta bort widget från example.com"

4. **updateWidget** - Uppdatera en widgets storlek eller position
   - Parametrar: widgetId (krävs), width, height, x, y (valfria)
   - Exempel: "ändra storlek på widget X till 1000x800"

5. **setLayoutMode** - Ändra layout-läge för arbetsytan
   - Parametrar: mode ("grid" eller "free")
   - Exempel: "ändra layout till grid" eller "sätt layout till free"

## Instruktioner:

- När användaren ber om att skapa en widget från en webbplats, använd createWidget-verktyget
- När användaren frågar om tillgängliga verktyg, lista alla verktyg ovan
- Kom ihåg tidigare meddelanden i konversationen för att ge bättre svar
- Svara på svenska och var tydlig med vad du gör
- Om du inte kan utföra en begäran, förklara varför`;

      // Build prompt with conversation history
      let conversationContext = "";
      if (this.conversationHistory.length > 0) {
        conversationContext = "\n\n## Tidigare konversation:\n";
        this.conversationHistory.forEach((msg) => {
          const roleLabel = msg.role === "user" ? "Användare" : "AI";
          conversationContext += `${roleLabel}: ${msg.content}\n\n`;
        });
      }

      const fullPrompt = conversationContext 
        ? `${conversationContext}Användare: ${message}`
        : message;

      console.log("[WorkspaceAIChat] Calling generateText with tools...");
      const result = await generateText({
        model: this.model,
        system: systemPrompt,
        prompt: fullPrompt,
        maxSteps: 5,
        tools: {
          getCurrentWorkspace: {
            description: "Hämta den nuvarande standard-arbetsytan",
            parameters: {
              type: "object",
              properties: {},
            },
            execute: async () => {
              const ws = await workspaceManager.getDefaultWorkspace();
              return ws
                ? {
                    id: ws.id,
                    name: ws.name,
                    widgetCount: ws.widgets.length,
                    widgets: ws.widgets.map((w) => ({
                      id: w.id,
                      type: w.type,
                      sourceUrl: w.sourceUrl,
                      size: w.size,
                  historyEntries: w.historyEntries,
                  historyIndex: w.historyIndex,
                  zoomFactor: w.zoomFactor,
                    })),
                  }
                : null;
            },
          },
          createWidget: {
            description: "Create widget from URL. Just provide URL - uses smart defaults (500x500, website type).",
            parameters: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  description: "Widget type. Default: 'website'. Almost always use website.",
                  enum: ["website", "custom"],
                  default: "website",
                },
                sourceUrl: {
                  type: "string",
                  description: "URL to load. Add https:// if missing.",
                },
                width: {
                  type: "number",
                  description: "Width in px. Default: 500. Don't ask - use default.",
                  default: 500,
                },
                height: {
                  type: "number",
                  description: "Height in px. Default: 500. Don't ask - use default.",
                  default: 500,
                },
              },
              required: ["sourceUrl"],
            },
            execute: async ({ type = "website", sourceUrl, width = 500, height = 500 }) => {
              const widgetManager = getWidgetManager();
              const workspace = await workspaceManager.ensureDefaultWorkspace();

              if (!workspace) {
                throw new Error("Ingen standard arbetsyta hittades. Skapa en arbetsyta först.");
              }

              // Analyze website if it's a website widget
              let analysis = null;
              if (type === "website") {
                try {
                  const analyzer = getWebsiteAnalyzer();
                  analysis = await analyzer.analyzeWebsite(sourceUrl);
                } catch (error) {
                  console.warn("Kunde inte analysera webbplats:", error);
                }
              }

              const widget: Widget = {
                id: randomUUID(),
                type: type as "website" | "custom",
                sourceUrl,
                position: { x: 0, y: 0 },
                size: { width, height },
                historyEntries: [sourceUrl],
                historyIndex: 0,
                zoomFactor: 1,
                domSnapshot: analysis?.dom,
                cssSnapshot: analysis?.css,
                apiMappings: analysis?.apiMappings,
              };

              const updated = widgetManager.addWidget(workspace, widget);
              await workspaceManager.updateWorkspace(updated);

              console.log(`[WorkspaceAIChat] Widget created: ${widget.id} from ${sourceUrl}`);

              return {
                success: true,
                widgetId: widget.id,
                message: `Widget skapad från ${sourceUrl}`,
              };
            },
          },
          deleteWidget: {
            description: "Ta bort en widget från arbetsytan",
            parameters: {
              type: "object",
              properties: {
                widgetId: {
                  type: "string",
                  description: "ID för widgeten som ska tas bort",
                },
              },
              required: ["widgetId"],
            },
            execute: async ({ widgetId }) => {
              const workspaceManager = getWorkspaceManager();
              const widgetManager = getWidgetManager();
              const workspace = await workspaceManager.getDefaultWorkspace();

              if (!workspace) {
                throw new Error("Ingen standard arbetsyta hittades.");
              }

              const widget = workspace.widgets.find((w) => w.id === widgetId);
              if (!widget) {
                throw new Error(`Widget med ID ${widgetId} hittades inte.`);
              }

              const updated = widgetManager.deleteWidget(workspace, widgetId);
              await workspaceManager.updateWorkspace(updated);

              console.log(`[WorkspaceAIChat] Widget deleted: ${widgetId}`);

              return {
                success: true,
                message: `Widget från ${widget.sourceUrl} har tagits bort.`,
              };
            },
          },
          updateWidget: {
            description: "Uppdatera en widgets storlek eller position",
            parameters: {
              type: "object",
              properties: {
                widgetId: {
                  type: "string",
                  description: "ID för widgeten som ska uppdateras",
                },
                width: {
                  type: "number",
                  description: "Ny bredd (valfritt)",
                },
                height: {
                  type: "number",
                  description: "Ny höjd (valfritt)",
                },
                x: {
                  type: "number",
                  description: "Ny x-position (valfritt)",
                },
                y: {
                  type: "number",
                  description: "Ny y-position (valfritt)",
                },
              },
              required: ["widgetId"],
            },
            execute: async ({ widgetId, width, height, x, y }) => {
              const workspaceManager = getWorkspaceManager();
              const widgetManager = getWidgetManager();
              const workspace = await workspaceManager.getDefaultWorkspace();

              if (!workspace) {
                throw new Error("Ingen standard arbetsyta hittades.");
              }

              const widget = workspace.widgets.find((w) => w.id === widgetId);
              if (!widget) {
                throw new Error(`Widget med ID ${widgetId} hittades inte.`);
              }

              const updatedWidget: Widget = {
                ...widget,
                size: {
                  width: width ?? widget.size.width,
                  height: height ?? widget.size.height,
                },
                position: {
                  x: x ?? widget.position.x,
                  y: y ?? widget.position.y,
                },
              };

              const updated = widgetManager.updateWidget(workspace, updatedWidget);
              await workspaceManager.updateWorkspace(updated);

              console.log(`[WorkspaceAIChat] Widget updated: ${widgetId}`);

              return {
                success: true,
                message: `Widget uppdaterad.`,
              };
            },
          },
          setLayoutMode: {
            description: "Ändra layout-läge för arbetsytan (grid eller free)",
            parameters: {
              type: "object",
              properties: {
                mode: {
                  type: "string",
                  description: "Layout-läge",
                  enum: ["grid", "free"],
                },
              },
              required: ["mode"],
            },
            execute: async ({ mode }) => {
              const workspaceManager = getWorkspaceManager();
              const workspace = await workspaceManager.getDefaultWorkspace();

              if (!workspace) {
                throw new Error("Ingen standard arbetsyta hittades.");
              }

              const updated = { ...workspace, layout: { mode: mode as "grid" | "free" } };
              await workspaceManager.updateWorkspace(updated);

              return {
                success: true,
                message: `Layout ändrad till ${mode}.`,
              };
            },
          },
        },
      });

      const responseText = result.text || "Inget svar genererades.";

      console.log(`[WorkspaceAIChat] Response received (${responseText.length} chars):`, responseText.substring(0, 100));

      // Update conversation history
      this.conversationHistory.push(
        { role: "user", content: message },
        { role: "assistant", content: responseText }
      );

      // Keep only last 20 messages to avoid token limits
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      return responseText;
    } catch (error) {
      console.error("WorkspaceAIChat error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Full error details:", {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        error,
      });
      return `Ett fel uppstod: ${errorMessage}. Kontrollera konsolen för mer information.`;
    }
  }
}

let instance: WorkspaceAIChat | null = null;
export function getWorkspaceAIChat(): WorkspaceAIChat {
  if (!instance) instance = new WorkspaceAIChat();
  return instance;
}


