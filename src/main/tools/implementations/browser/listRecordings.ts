import type { ToolDefinition, ToolResult, ToolExecutionContext } from "../../ToolDefinition";
import { getRecordingManager } from "../../../RecordingManager";

export const listRecordings: ToolDefinition = {
  name: "list_recordings",
  description: "List all available browser recordings. Use this when the user asks about recordings, wants to see what recordings exist, or mentions a recording name.",
  category: "browser",
  requiresConfirmation: false,
  parameters: [],
  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const recordingManager = getRecordingManager();
    const recordings = recordingManager.getRecordingsList();

    if (recordings.length === 0) {
      return {
        success: true,
        message: "No recordings found",
        result: {
          recordings: [],
          count: 0,
        },
      };
    }

    // Format recordings for display
    const formattedRecordings = recordings.map((r) => ({
      id: r.id,
      name: r.name,
      actionCount: r.actionCount,
      startTime: r.startTime,
      endTime: r.endTime,
      duration: Math.round((r.endTime - r.startTime) / 1000), // Duration in seconds
      summary: recordingManager.getRecordingSummary(r.id),
    }));

    return {
      success: true,
      message: `Found ${recordings.length} recording(s)`,
      result: {
        recordings: formattedRecordings,
        count: recordings.length,
      },
    };
  },
};

























