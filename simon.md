## Simon summary of assignment

First step was to implement an Agent into the chat functionality instead of hacing a simple api call to openAI and in the beginning i tried building my own orchestrator plus define local tools for the browser like click, move, scroll, create/change tabs and more. But quickly realised that it would probably be smoother to use something like Langchain instead and after changing the orchestrator i made was actually better at the tools but then after some tuning I managed to get the Langchain to work better and its much quicker at taking the right action.


After the actual Agent, I tried to implement recordings, which would enable the user to record a sequence of mouse/keyboard events on one or multiple pages/tabs and result in a historical document for the Agent. But since the recordings didnt work that well i decided to do something else based on stress to be done at some point. 

Then I went into some frontend design additions, like panels for bookmarks, downloads etc, some some visuals. And then I started on another idea i had which i call workspaces. The workspaces allows users to create widgets for different websites inside a type of canvas/dashboard and move, resize anything to their liking. And the next step would be to allow the Agent access to all widgets in real time.

But ultimately the grand vision for the wigets inside the workspaces is for the agent to be able to call backends instead of loading websites inside webview and then allow users to apply their own coherent style to any website according to their liking. And being able to connect different backend flawlessly in multiple ways only users in the future could come up with. 

Essentially a fully customizable dashboard with everything a user would need on one page.



(There are ofc some stuff that I have forgotten during this assignment that are of interest but I leave it to history)

Changes ->

### What this enables right now (user-facing)
- **Workspace**: the first tab opens the workspace by default; new tabs open a normal web page by default to avoid multiple workspace tabs.
- **Multiple widget**: drag/resize widgets, close them, and use per-widget back/forward; per-widget zoom works (Ctrl/Cmd + wheel, Ctrl/Cmd + plus/minus/0).
- **Workspace AI entrypoint**: the topbar includes a “Workspace AI” chat surface that can mutate the default workspace.

### Stuff saved locally
- **Workspaces**: saved as JSON under the app user data folder (`workspaces/*.json`).
- **Window state**: saved as JSON (`window-state.json`) so the window re-opens where it was.
- **Recordings**: stored as JSON files (`recordings/*.json`) when recording is fully wired.
- **File locks**: lightweight lock files (`.locks/`) to avoid concurrent writes.



### Added files

- **`src/main/CustomPageRenderer.ts`**: builds the workspace “canvas” HTML (widgets, drag/resize, and the update queue that the main process reads).
- **`src/main/DarkModeManager.ts`**: central place to sync dark mode across topbar/sidebar/tabs via Electron native theme.
- **`src/main/RecordingManager.ts`**: stores user recordings as small JSON files and provides list/load/rename/delete utilities.
- **`src/main/WindowStateManager.ts`**: saves/restores window size and position to disk.
- **`src/main/WorkspaceAIChat.ts`**: a separate “workspace-only” AI that can create/update/delete widgets in the default workspace.
- **`src/main/WorkspaceManager.ts`**: persistence and CRUD for workspaces stored as JSON.

- **`src/main/agent/LangChainAgentOrchestrator.ts`**: the new agent pipeline used by sidebar chat to plan steps and run tools.
- **`src/main/agent/context/VisualContextMiddleware.ts`**: collects visual context (screenshots/page context) for better agent decisions.
- **`src/main/agent/memory/LongTermMemory.ts`**: long-term memory storage interface/implementation for the agent.
- **`src/main/agent/memory/MemoryMiddleware.ts`**: injects/retrieves memory into the agent flow.
- **`src/main/agent/middleware/ErrorHandlingMiddleware.ts`**: standardizes error capture/classification for agent steps.
- **`src/main/agent/planning/PlanningMiddleware.ts`**: turns a user goal into a step-by-step plan.
- **`src/main/agent/state/CustomAgentState.ts`**: shared “agent run” state object (progress, context, etc.).
- **`src/main/agent/tools/LangChainToolAdapter.ts`**: bridges the tool system into the agent framework.
- **`src/main/agent/tools/ToolContext.ts`**: defines the runtime context passed into tools (active tab/window, etc.).
- **`src/main/agent/tools/ToolRegistry.ts`**: registers and exposes the available tools to the agent.

- **`src/main/testing/ToolTester.ts`**: small harness to manually exercise tools during development.

- **`src/main/tools/implementations/browser/executeRecording.ts`**: takes a saved recording and turns it into actionable tool steps (in batches).
- **`src/main/tools/implementations/browser/listRecordings.ts`**: tool that returns a list of saved recordings for the agent/UI.

- **`src/main/utils/FileLock.ts`**: simple file lock helper to prevent workspace JSON write collisions.
- **`src/main/utils/ListDetector.ts`**: detects “list-like” selectors so replays can adapt to changing list items.
- **`src/main/utils/RecordingActionConverter.ts`**: converts recorded actions (click/input/select) into agent tool calls.

- **`src/main/widgets/WebsiteAnalyzer.ts`**: optional analysis for a website widget (DOM/CSS hints, mappings).
- **`src/main/widgets/WidgetInteractionHandler.ts`**: handles widget-level interactions/events (glue around widget webviews).
- **`src/main/widgets/WidgetManager.ts`**: add/update/delete widgets inside a workspace object.
- **`src/main/widgets/WidgetRenderer.ts`**: renders a widget as an embedded webview with safe defaults and restore behavior.

- **`src/preload/widget-webview.ts`**: preload inside widget webviews (handles per-widget zoom and reports it back to the host).

- **`src/renderer/sidebar/src/components/Recording.tsx`**: sidebar UI for recording controls + listing recordings.
- **`src/renderer/sidebar/src/components/SidebarResizeHandle.tsx`**: drag handle UI to resize the sidebar width.
- **`src/renderer/sidebar/src/contexts/RecordingContext.tsx`**: React context that wires the sidebar recording UI to IPC.

- **`src/renderer/topbar/src/components/BookmarkFolderPopup.tsx`**: new topbar popup surface (bookmark folders UI shell).
- **`src/renderer/topbar/src/components/DownloadHistoryPopup.tsx`**: new topbar popup surface (download history UI shell).
- **`src/renderer/topbar/src/components/MainPopup.tsx`**: shared popup container used for topbar menus/panels.
- **`src/renderer/topbar/src/components/UserPopup.tsx`**: new topbar popup surface (user/account UI shell).
- **`src/renderer/topbar/src/components/WorkspaceChat.tsx`**: topbar “workspace AI” chat box UI.
- **`src/renderer/topbar/src/components/WorkspacePanel.tsx`**: topbar UI for managing workspaces (list/create/default/edit/delete), pending backend wiring.

