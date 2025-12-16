import { Widget } from "../WorkspaceManager";

/**
 * WidgetInteractionHandler
 * Placeholder for handling interactions inside widgets (clicks, forms, navigation).
 * Future work: intercept network calls and map to API mappings.
 */
export class WidgetInteractionHandler {
  // In this scaffold, we just keep a stub for future expansion.
  handleInteraction(_widget: Widget, _event: any): void {
    // TODO: implement interaction routing
  }
}

let handler: WidgetInteractionHandler | null = null;
export function getWidgetInteractionHandler(): WidgetInteractionHandler {
  if (!handler) handler = new WidgetInteractionHandler();
  return handler;
}













