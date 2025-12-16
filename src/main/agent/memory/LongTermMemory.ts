import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { FileLock } from "../../utils/FileLock";
import { encodingForModel } from "js-tiktoken";

export interface SuccessfulPattern {
  task: string;
  steps: string[];
  tools: string[];
  timestamp: number;
  success: boolean;
}

export interface FailedAttempt {
  task: string;
  error: string;
  solution?: string;
  timestamp: number;
}

export interface UserPreference {
  key: string;
  value: any;
  timestamp: number;
}

const MEMORY_DIR = join(process.cwd(), "memory");
const SUCCESSFUL_PATTERNS_FILE = join(MEMORY_DIR, "successful-patterns.json");
const FAILED_ATTEMPTS_FILE = join(MEMORY_DIR, "failed-attempts.json");
const USER_PREFERENCES_FILE = join(MEMORY_DIR, "user-preferences.json");

export class LongTermMemory {
  private successfulPatterns: SuccessfulPattern[] = [];
  private failedAttempts: FailedAttempt[] = [];
  private userPreferences: UserPreference[] = [];
  private tokenEncoder: any = null;
  private readonly MAX_TOKENS = 200000; // 200k tokens limit

  constructor() {
    // Initialize token encoder (using cl100k_base which works for GPT-4)
    try {
      this.tokenEncoder = encodingForModel("gpt-4");
    } catch (error) {
      console.warn("[LongTermMemory] Failed to initialize token encoder, using fallback:", error);
    }
    // Load memory asynchronously (don't block constructor)
    this.loadMemory().catch((error) => {
      console.error("[LongTermMemory] Failed to load memory:", error);
    });
  }

  /**
   * Estimate token count for a string
   */
  private estimateTokens(text: string): number {
    if (!this.tokenEncoder) {
      // Fallback: rough estimate (1 token ≈ 4 characters for English)
      return Math.ceil(text.length / 4);
    }
    try {
      return this.tokenEncoder.encode(text).length;
    } catch (error) {
      // Fallback if encoding fails
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Get total token count of memory
   */
  private getMemoryTokenCount(): number {
    let total = 0;
    for (const pattern of this.successfulPatterns) {
      total += this.estimateTokens(JSON.stringify(pattern));
    }
    for (const failure of this.failedAttempts) {
      total += this.estimateTokens(JSON.stringify(failure));
    }
    for (const pref of this.userPreferences) {
      total += this.estimateTokens(JSON.stringify(pref));
    }
    return total;
  }

  /**
   * Trim memory to stay within token limit (FIFO - remove oldest first)
   */
  private trimMemory(): void {
    let totalTokens = this.getMemoryTokenCount();
    
    // Remove oldest successful patterns first
    while (totalTokens > this.MAX_TOKENS && this.successfulPatterns.length > 0) {
      const removed = this.successfulPatterns.shift();
      if (removed) {
        totalTokens -= this.estimateTokens(JSON.stringify(removed));
      }
    }
    
    // Remove oldest failed attempts if still over limit
    while (totalTokens > this.MAX_TOKENS && this.failedAttempts.length > 0) {
      const removed = this.failedAttempts.shift();
      if (removed) {
        totalTokens -= this.estimateTokens(JSON.stringify(removed));
      }
    }
    
    // Remove oldest user preferences if still over limit (but keep at least recent ones)
    while (totalTokens > this.MAX_TOKENS && this.userPreferences.length > 10) {
      const removed = this.userPreferences.shift();
      if (removed) {
        totalTokens -= this.estimateTokens(JSON.stringify(removed));
      }
    }
  }

  private async loadMemory(): Promise<void> {
    // Ensure memory directory exists
    if (!existsSync(MEMORY_DIR)) {
      mkdirSync(MEMORY_DIR, { recursive: true });
    }

    // Acquire lock for reading
    const releaseLock = await FileLock.acquire(SUCCESSFUL_PATTERNS_FILE);

    try {
      // Load successful patterns
      if (existsSync(SUCCESSFUL_PATTERNS_FILE)) {
        try {
          const content = readFileSync(SUCCESSFUL_PATTERNS_FILE, "utf-8");
          this.successfulPatterns = JSON.parse(content);
        } catch (error) {
          console.error("Error loading successful patterns:", error);
          this.successfulPatterns = [];
        }
      }

      // Load failed attempts
      if (existsSync(FAILED_ATTEMPTS_FILE)) {
        try {
          const content = readFileSync(FAILED_ATTEMPTS_FILE, "utf-8");
          this.failedAttempts = JSON.parse(content);
        } catch (error) {
          console.error("Error loading failed attempts:", error);
          this.failedAttempts = [];
        }
      }

      // Load user preferences
      if (existsSync(USER_PREFERENCES_FILE)) {
        try {
          const content = readFileSync(USER_PREFERENCES_FILE, "utf-8");
          this.userPreferences = JSON.parse(content);
        } catch (error) {
          console.error("Error loading user preferences:", error);
          this.userPreferences = [];
        }
      }

      // Trim memory to stay within token limit
      this.trimMemory();
    } finally {
      await releaseLock();
    }
  }

  private async saveMemory(): Promise<void> {
    // Trim memory before saving
    this.trimMemory();
    
    // Acquire locks for all files
    const releasePatternsLock = await FileLock.acquire(SUCCESSFUL_PATTERNS_FILE);
    const releaseFailuresLock = await FileLock.acquire(FAILED_ATTEMPTS_FILE);
    const releasePrefsLock = await FileLock.acquire(USER_PREFERENCES_FILE);

    try {
      writeFileSync(SUCCESSFUL_PATTERNS_FILE, JSON.stringify(this.successfulPatterns, null, 2));
      writeFileSync(FAILED_ATTEMPTS_FILE, JSON.stringify(this.failedAttempts, null, 2));
      writeFileSync(USER_PREFERENCES_FILE, JSON.stringify(this.userPreferences, null, 2));
    } catch (error) {
      console.error("Error saving memory:", error);
    } finally {
      await releasePatternsLock();
      await releaseFailuresLock();
      await releasePrefsLock();
    }
  }

  /**
   * Get relevant memories based on current task context
   */
  getRelevantMemories(taskDescription: string, toolsUsed: string[]): {
    patterns: SuccessfulPattern[];
    failures: FailedAttempt[];
  } {
    const taskLower = taskDescription.toLowerCase();
    
    // Find similar tasks
    const relevantPatterns = this.successfulPatterns.filter((pattern) => {
      const patternTaskLower = pattern.task.toLowerCase();
      return (
        patternTaskLower.includes(taskLower) ||
        taskLower.includes(patternTaskLower) ||
        toolsUsed.some((tool) => pattern.tools.includes(tool))
      );
    });

    const relevantFailures = this.failedAttempts.filter((attempt) => {
      const attemptTaskLower = attempt.task.toLowerCase();
      return (
        attemptTaskLower.includes(taskLower) ||
        taskLower.includes(attemptTaskLower)
      );
    });

    return {
      patterns: relevantPatterns.slice(0, 5), // Limit to 5 most relevant
      failures: relevantFailures.slice(0, 3), // Limit to 3 most relevant
    };
  }

  /**
   * Store a successful pattern
   */
  async storeSuccessfulPattern(task: string, steps: string[], tools: string[]): Promise<void> {
    this.successfulPatterns.push({
      task,
      steps,
      tools,
      timestamp: Date.now(),
      success: true,
    });
    await this.saveMemory();
  }

  /**
   * Store a failed attempt
   */
  async storeFailedAttempt(task: string, error: string, solution?: string): Promise<void> {
    this.failedAttempts.push({
      task,
      error,
      solution,
      timestamp: Date.now(),
    });
    await this.saveMemory();
  }

  /**
   * Store user preference
   */
  async storeUserPreference(key: string, value: any): Promise<void> {
    const existing = this.userPreferences.findIndex((p) => p.key === key);
    if (existing >= 0) {
      this.userPreferences[existing] = { key, value, timestamp: Date.now() };
    } else {
      this.userPreferences.push({ key, value, timestamp: Date.now() });
    }
    await this.saveMemory();
  }

  /**
   * Get user preference
   */
  getUserPreference(key: string): any | undefined {
    const pref = this.userPreferences.find((p) => p.key === key);
    return pref?.value;
  }
}

let longTermMemoryInstance: LongTermMemory | null = null;

export function getLongTermMemory(): LongTermMemory {
  if (!longTermMemoryInstance) {
    longTermMemoryInstance = new LongTermMemory();
  }
  return longTermMemoryInstance;
}








