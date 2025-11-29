import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";
import * as dotenv from "dotenv";
import { join } from "path";

// Load environment variables
dotenv.config({ path: join(__dirname, "../../../../.env") });

export const googleSearch: ToolDefinition = {
  name: "google_search",
  description: "Perform a Google search and return results",
  category: "search",
  requiresConfirmation: false,
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Search query",
      required: true,
    },
    {
      name: "maxResults",
      type: "number",
      description: "Maximum number of results to return (defaults to 10)",
      required: false,
    },
  ],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { query, maxResults = 10 } = params;

    if (!query || typeof query !== "string") {
      return {
        success: false,
        error: "query is required and must be a string",
      };
    }

    try {
      // Try Google Custom Search API first if key is available
      const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
      const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

      if (apiKey && searchEngineId) {
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=${Math.min(maxResults, 10)}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Google API error: ${response.statusText}`);
        }

        const data = await response.json();
        const results = (data.items || []).map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
        }));

        return {
          success: true,
          result: {
            query,
            results,
            count: results.length,
          },
          message: `Found ${results.length} search results`,
        };
      }

      // Fallback: Navigate to Google search in browser
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      const tab = context.window.activeTab || context.window.createTab();
      await tab.loadURL(searchUrl);

      return {
        success: true,
        result: {
          query,
          url: searchUrl,
          method: "browser_navigation",
        },
        message: `Opened Google search for "${query}" in browser`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

