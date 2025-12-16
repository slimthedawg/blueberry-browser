import { Widget, Workspace } from "../WorkspaceManager";

/**
 * WidgetManager
 * Manages widget lifecycle inside a workspace.
 */
export class WidgetManager {
  addWidget(workspace: Workspace, widget: Widget): Workspace {
    return { ...workspace, widgets: [...workspace.widgets, widget] };
  }

  updateWidget(workspace: Workspace, widget: Widget): Workspace {
    const widgets = workspace.widgets.map((w) => (w.id === widget.id ? widget : w));
    return { ...workspace, widgets };
  }

  deleteWidget(workspace: Workspace, widgetId: string): Workspace {
    const widgets = workspace.widgets.filter((w) => w.id !== widgetId);
    return { ...workspace, widgets };
  }
}

let widgetManager: WidgetManager | null = null;
export function getWidgetManager(): WidgetManager {
  if (!widgetManager) widgetManager = new WidgetManager();
  return widgetManager;
}













