/**
 * RecordingManager - Manages browser action recordings
 * Captures user interactions and saves them as minimal JSON files
 */
import { app } from "electron";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync, renameSync } from "fs";
import { ListDetector } from "./utils/ListDetector";

export interface RecordingAction {
  type: string;
  timestamp: number;
  [key: string]: any; // Allow additional properties per action type
}

export interface Recording {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  actions: RecordingAction[];
}

export class RecordingManager {
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private currentRecording: Recording | null = null;
  private recordingsDir: string;
  private listDetector: ListDetector;
  private static readonly DUPLICATE_THRESHOLD_MS = 10;

  constructor() {
    const userDataPath = app.getPath("userData");
    this.recordingsDir = join(userDataPath, "recordings");
    if (!existsSync(this.recordingsDir)) {
      mkdirSync(this.recordingsDir, { recursive: true });
    }
    this.listDetector = new ListDetector();
  }

  /**
   * Start a new recording
   */
  startRecording(name?: string): string {
    if (this.isRecording) {
      throw new Error("Recording already in progress");
    }

    const id = `recording-${Date.now()}`;
    this.currentRecording = {
      id,
      name: name || `Recording ${new Date().toLocaleString()}`,
      startTime: Date.now(),
      endTime: 0,
      actions: [],
    };
    this.isRecording = true;
    this.isPaused = false;
    console.log(`🎬 Started recording: ${id} - "${this.currentRecording.name}"`);
    return id;
  }

  /**
   * Stop recording and save to file
   */
  stopRecording(): string | null {
    if (!this.isRecording || !this.currentRecording) {
      console.log(`⚠️ Cannot stop recording - isRecording=${this.isRecording}, hasRecording=${!!this.currentRecording}`);
      return null;
    }

    this.currentRecording.endTime = Date.now();
    const originalActionCount = this.currentRecording.actions.length;
    this.currentRecording.actions = this.removeDuplicateActions(this.currentRecording.actions);
    const deduplicatedCount = this.currentRecording.actions.length;
    const removedCount = originalActionCount - deduplicatedCount;
    const filepath = this.saveRecording(this.currentRecording);
    if (removedCount > 0) {
      console.log(
        `🧹 Removed ${removedCount} duplicate actions before saving recording ${this.currentRecording.id}. Final action count: ${deduplicatedCount}`
      );
    }
    console.log(`🛑 Stopped recording: ${this.currentRecording.id} - Saved ${deduplicatedCount} actions to ${filepath}`);
    this.isRecording = false;
    this.isPaused = false;
    this.currentRecording = null;
    return filepath;
  }

  /**
   * Pause recording
   */
  pauseRecording(): void {
    if (this.isRecording) {
      this.isPaused = true;
    }
  }

  /**
   * Resume recording
   */
  resumeRecording(): void {
    if (this.isRecording) {
      this.isPaused = false;
    }
  }

  /**
   * Check if currently recording
   */
  getRecordingState(): { isRecording: boolean; isPaused: boolean; recordingId: string | null } {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      recordingId: this.currentRecording?.id || null,
    };
  }

  /**
   * Add an action to the current recording
   */
  addAction(action: Omit<RecordingAction, "timestamp">): void {
    if (!this.isRecording || this.isPaused || !this.currentRecording) {
      console.log(`⚠️ Cannot add action - Recording state: isRecording=${this.isRecording}, isPaused=${this.isPaused}, hasRecording=${!!this.currentRecording}`);
      return;
    }

    const timestamp = Date.now();
    const fullAction: RecordingAction = {
      type: action.type || "unknown",
      ...action,
      timestamp,
    };

    // Detect if this is a list action
    if (action.type === "mouse_click" && action.element) {
      const listInfo = this.listDetector.detectList(action.element);
      if (listInfo.isList) {
        fullAction.isList = true;
        fullAction.listContainer = listInfo.containerSelector;
      }
    }

    this.currentRecording.actions.push(fullAction);
    console.log(`📝 Added action to recording ${this.currentRecording.id}: ${action.type} (total: ${this.currentRecording.actions.length})`);
  }

  /**
   * Save recording to JSON file
   */
  private saveRecording(recording: Recording): string {
    const filename = this.getRecordingFilename(recording);
    const filepath = join(this.recordingsDir, filename);
    writeFileSync(filepath, JSON.stringify(recording, null, 2), "utf-8");
    return filepath;
  }

  /**
   * Load a recording from file
   */
  loadRecording(id: string): Recording | null {
    const filepath = this.findRecordingFilePath(id);
    if (!filepath) {
      return null;
    }

    try {
      const content = readFileSync(filepath, "utf-8");
      return JSON.parse(content) as Recording;
    } catch (error) {
      console.error(`Failed to load recording ${id}:`, error);
      return null;
    }
  }

  /**
   * Get list of all recordings
   */
  getRecordingsList(): Array<{ id: string; name: string; startTime: number; endTime: number; actionCount: number }> {
    if (!existsSync(this.recordingsDir)) {
      return [];
    }

    const files = readdirSync(this.recordingsDir).filter((f) => f.endsWith(".json"));
    const recordings: Array<{ id: string; name: string; startTime: number; endTime: number; actionCount: number }> = [];

    for (const file of files) {
      try {
        const filepath = join(this.recordingsDir, file);
        const content = readFileSync(filepath, "utf-8");
        const recording = JSON.parse(content) as Partial<Recording>;
        
        // Handle recordings that might not have actions array (legacy or corrupted)
        // Safely check if actions exists and is an array
        let actionCount = 0;
        if (recording && recording.actions && Array.isArray(recording.actions)) {
          actionCount = recording.actions.length;
        }
        
        // Only add if we have at least basic recording data
        if (recording && (recording.id || recording.name)) {
          recordings.push({
            id: recording.id || file.replace('.json', ''),
            name: recording.name || file.replace('.json', ''),
            startTime: recording.startTime || 0,
            endTime: recording.endTime || 0,
            actionCount: actionCount,
          });
        }
      } catch (error) {
        console.error(`Failed to read recording file ${file}:`, error);
        // Skip corrupted files instead of crashing
        // Optionally delete corrupted files:
        // try {
        //   unlinkSync(join(this.recordingsDir, file));
        //   console.log(`Deleted corrupted recording file: ${file}`);
        // } catch (deleteError) {
        //   console.error(`Failed to delete corrupted file ${file}:`, deleteError);
        // }
      }
    }

    // Sort by start time (newest first)
    return recordings.sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Delete a recording
   */
  deleteRecording(id: string): boolean {
    const filepath = this.findRecordingFilePath(id);
    if (!filepath) {
      return false;
    }

    try {
      unlinkSync(filepath);
      return true;
    } catch (error) {
      console.error(`Failed to delete recording ${id}:`, error);
      return false;
    }
  }

  /**
   * Rename a recording
   */
  renameRecording(id: string, newName: string): boolean {
    const filepath = this.findRecordingFilePath(id);
    if (!filepath) {
      return false;
    }

    try {
      const content = readFileSync(filepath, "utf-8");
      const recording = JSON.parse(content) as Recording;
      
      // Update the name
      recording.name = newName;

      const newFilename = this.getRecordingFilename(recording);
      const newFilepath = join(this.recordingsDir, newFilename);

      if (filepath !== newFilepath) {
        renameSync(filepath, newFilepath);
      }

      // Save back to file (with updated name)
      writeFileSync(newFilepath, JSON.stringify(recording, null, 2), "utf-8");
      return true;
    } catch (error) {
      console.error(`Failed to rename recording ${id}:`, error);
      return false;
    }
  }

  /**
   * Remove sequential duplicate actions (same signature within a short time window)
   */
  private removeDuplicateActions(actions: RecordingAction[]): RecordingAction[] {
    if (!actions || actions.length === 0) {
      return [];
    }

    const filtered: RecordingAction[] = [];
    let lastSignature: string | null = null;
    let lastTimestamp = 0;

    for (const action of actions) {
      if (!action) {
        continue;
      }
      const signature = this.getActionSignature(action);
      if (
        signature === lastSignature &&
        Math.abs(action.timestamp - lastTimestamp) <= RecordingManager.DUPLICATE_THRESHOLD_MS
      ) {
        continue;
      }

      filtered.push(action);
      lastSignature = signature;
      lastTimestamp = action.timestamp;
    }

    return filtered;
  }

  private getActionSignature(action: RecordingAction): string {
    const { timestamp, ...rest } = action;
    const keys = Object.keys(rest).sort();
    return JSON.stringify(rest, keys);
  }

  /**
   * Get recordings directory path
   */
  getRecordingsDir(): string {
    return this.recordingsDir;
  }

  /**
   * Generate the filename for a recording, incorporating a slugged name when available
   */
  private getRecordingFilename(recording: Recording): string {
    const slug = this.slugifyRecordingName(recording.name);
    if (slug.length === 0) {
      return `${recording.id}.json`;
    }
    return `${recording.id}-${slug}.json`;
  }

  private slugifyRecordingName(name?: string): string {
    if (!name) {
      return "";
    }

    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  /**
   * Locate the on-disk file for a recording ID, supporting filenames that include slugs
   */
  private findRecordingFilePath(id: string): string | null {
    if (!id) {
      return null;
    }

    const defaultPath = join(this.recordingsDir, `${id}.json`);
    if (existsSync(defaultPath)) {
      return defaultPath;
    }

    if (!existsSync(this.recordingsDir)) {
      return null;
    }

    try {
      const files = readdirSync(this.recordingsDir).filter((file) => file.endsWith(".json"));
      const prefixedMatch = files.find((file) => file.startsWith(`${id}-`));
      if (prefixedMatch) {
        return join(this.recordingsDir, prefixedMatch);
      }

      // Fallback: inspect file contents (covers legacy files renamed manually)
      for (const file of files) {
        try {
          const filepath = join(this.recordingsDir, file);
          const content = readFileSync(filepath, "utf-8");
          const recording = JSON.parse(content) as Partial<Recording>;
          if (recording?.id === id) {
            return filepath;
          }
        } catch (innerError) {
          console.error(`Failed to inspect recording file ${file}:`, innerError);
        }
      }
    } catch (error) {
      console.error(`Failed to scan recordings directory for ${id}:`, error);
    }

    return null;
  }

  /**
   * Search recordings by name or ID
   */
  searchRecordings(query: string): Recording[] {
    const allRecordings = this.getRecordingsList();
    const queryLower = query.toLowerCase();
    const results: Recording[] = [];

    for (const recordingInfo of allRecordings) {
      // Check if query matches ID or name
      if (
        recordingInfo.id.toLowerCase().includes(queryLower) ||
        recordingInfo.name.toLowerCase().includes(queryLower)
      ) {
        const recording = this.loadRecording(recordingInfo.id);
        if (recording) {
          results.push(recording);
        }
      }
    }

    return results;
  }

  /**
   * Get actions for a recording
   */
  getRecordingActions(recordingId: string): RecordingAction[] {
    const recording = this.loadRecording(recordingId);
    return recording?.actions || [];
  }

  /**
   * Get human-readable summary of a recording
   */
  getRecordingSummary(recordingId: string): string {
    const recording = this.loadRecording(recordingId);
    if (!recording) {
      return `Recording ${recordingId} not found`;
    }

    const actionCount = recording.actions.length;
    const duration = recording.endTime - recording.startTime;
    const durationSeconds = Math.round(duration / 1000);

    const actionTypes = new Map<string, number>();
    for (const action of recording.actions) {
      actionTypes.set(action.type, (actionTypes.get(action.type) || 0) + 1);
    }

    const actionSummary = Array.from(actionTypes.entries())
      .map(([type, count]) => `${count} ${type}`)
      .join(", ");

    return `${recording.name}: ${actionCount} actions over ${durationSeconds}s (${actionSummary})`;
  }
}

// Singleton instance
let recordingManagerInstance: RecordingManager | null = null;

export function getRecordingManager(): RecordingManager {
  if (!recordingManagerInstance) {
    recordingManagerInstance = new RecordingManager();
  }
  return recordingManagerInstance;
}

