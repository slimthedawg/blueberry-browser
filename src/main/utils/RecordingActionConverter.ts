/**
 * RecordingActionConverter - Converts recording actions to tool calls
 * Handles adaptive conversion with intelligent selector matching
 */
import type { RecordingAction } from "../RecordingManager";
import type { ActionStep } from "../AgentOrchestrator";
import { ListDetector } from "./ListDetector";

export interface ExecutionContext {
  currentUrl?: string;
  tabId?: string;
  pageElements?: any[];
}

export class RecordingActionConverter {
  private listDetector: ListDetector;

  constructor() {
    this.listDetector = new ListDetector();
  }

  /**
   * Convert a recording action to an ActionStep (tool call)
   */
  convertActionToToolCall(
    action: RecordingAction,
    context: ExecutionContext,
    stepNumber: number
  ): ActionStep | null {
    switch (action.type) {
      case "browser_navigate":
        return this.convertNavigate(action, stepNumber);
      case "mouse_click":
        return this.convertClick(action, stepNumber);
      case "input_fill":
        return this.convertInputFill(action, stepNumber);
      case "dropdown_select":
        return this.convertDropdownSelect(action, stepNumber);
      case "browser_hover":
        // Hover is optional - only include if needed
        return null;
      case "browser_scroll":
        // Scroll is handled automatically by tools
        return null;
      case "tab_open":
        return this.convertTabOpen(action, stepNumber);
      case "tab_change":
        return this.convertTabChange(action, stepNumber);
      case "tab_close":
        return this.convertTabClose(action, stepNumber);
      default:
        console.warn(`Unknown action type: ${action.type}`);
        return null;
    }
  }

  private convertNavigate(action: RecordingAction, stepNumber: number): ActionStep {
    return {
      stepNumber,
      tool: "navigate_to_url",
      parameters: {
        url: action.url,
        tabId: action.tabId,
      },
      reasoning: `Navigate to ${action.url}`,
      requiresConfirmation: false,
    };
  }

  private convertClick(action: RecordingAction, stepNumber: number): ActionStep {
    const selector = action.element || action.selector;
    if (!selector) {
      console.warn("Click action missing element/selector");
      return null as any;
    }

    // Check if this is a list action
    const listInfo = this.listDetector.detectList(selector);
    const isListAction = action.isList || listInfo.isList;

    return {
      stepNumber,
      tool: "click_element",
      parameters: {
        selector: selector,
        selectorType: "css",
        tabId: action.tabId,
        // Mark as list action for adaptive handling
        isListAction: isListAction,
        listContainer: listInfo.containerSelector || action.listContainer,
      },
      reasoning: isListAction
        ? `Click list item: ${selector} (will adapt to find similar items)`
        : `Click element: ${selector}`,
      requiresConfirmation: false,
    };
  }

  private convertInputFill(action: RecordingAction, stepNumber: number): ActionStep {
    const selector = action.element || action.selector;
    if (!selector) {
      console.warn("Input fill action missing element/selector");
      return null as any;
    }

    return {
      stepNumber,
      tool: "fill_form",
      parameters: {
        fields: {
          [selector]: action.value || action.text || "",
        },
        tabId: action.tabId,
      },
      reasoning: `Fill input ${selector} with "${action.value || action.text}"`,
      requiresConfirmation: false,
    };
  }

  private convertDropdownSelect(action: RecordingAction, stepNumber: number): ActionStep {
    const selector = action.element || action.selector;
    if (!selector) {
      console.warn("Dropdown select action missing element/selector");
      return null as any;
    }

    return {
      stepNumber,
      tool: "fill_form",
      parameters: {
        fields: {
          [selector]: action.value || action.selectedValue || "",
        },
        tabId: action.tabId,
      },
      reasoning: `Select "${action.value || action.selectedValue}" in dropdown ${selector}`,
      requiresConfirmation: false,
    };
  }

  private convertTabOpen(action: RecordingAction, stepNumber: number): ActionStep {
    return {
      stepNumber,
      tool: "create_tab",
      parameters: {
        url: action.url || "about:blank",
      },
      reasoning: `Open new tab${action.url ? ` with ${action.url}` : ""}`,
      requiresConfirmation: false,
    };
  }

  private convertTabChange(action: RecordingAction, stepNumber: number): ActionStep {
    return {
      stepNumber,
      tool: "switch_tab",
      parameters: {
        tabId: action.tabId,
      },
      reasoning: `Switch to tab ${action.tabId}`,
      requiresConfirmation: false,
    };
  }

  private convertTabClose(action: RecordingAction, stepNumber: number): ActionStep {
    return {
      stepNumber,
      tool: "close_tab",
      parameters: {
        tabId: action.tabId,
      },
      reasoning: `Close tab ${action.tabId}`,
      requiresConfirmation: true,
    };
  }

  /**
   * Convert multiple actions to ActionSteps
   */
  convertActionsToSteps(
    actions: RecordingAction[],
    startFromIndex: number = 0,
    context: ExecutionContext = {}
  ): ActionStep[] {
    const steps: ActionStep[] = [];
    let stepNumber = 1;

    for (let i = startFromIndex; i < actions.length; i++) {
      const action = actions[i];
      const step = this.convertActionToToolCall(action, context, stepNumber);
      
      if (step) {
        steps.push(step);
        stepNumber++;
      }
    }

    return steps;
  }
}

























