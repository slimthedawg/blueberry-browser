import { promises as fs } from "fs";
import { join } from "path";
import { app } from "electron";

/**
 * Simple file-based locking mechanism for preventing concurrent file access
 * Uses lock files with process ID to detect stale locks
 */
export class FileLock {
  private static locks: Map<string, Promise<void>> = new Map();
  private static lockDir: string = join(app.getPath("userData"), ".locks");

  /**
   * Ensure lock directory exists
   */
  private static async ensureLockDir(): Promise<void> {
    try {
      await fs.mkdir(this.lockDir, { recursive: true });
    } catch (error) {
      // Ignore if already exists
    }
  }

  /**
   * Get lock file path for a given file
   */
  private static getLockPath(filePath: string): string {
    const fileName = filePath.replace(/[^a-zA-Z0-9]/g, "_");
    return join(this.lockDir, `${fileName}.lock`);
  }

  /**
   * Acquire a lock for a file operation
   * Returns a function to release the lock
   */
  static async acquire(filePath: string): Promise<() => Promise<void>> {
    await this.ensureLockDir();
    const lockPath = this.getLockPath(filePath);
    const pid = process.pid;

    // Wait for any existing lock to be released
    let existingLock = this.locks.get(lockPath);
    while (existingLock) {
      try {
        await existingLock;
      } catch {
        // Lock was released, continue
      }
      existingLock = this.locks.get(lockPath);
    }

    // Create new lock promise
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(lockPath, lockPromise);

    // Write lock file with PID
    try {
      await fs.writeFile(lockPath, JSON.stringify({ pid, timestamp: Date.now() }), "utf-8");
    } catch (error) {
      // If we can't write the lock file, still proceed (lock is in memory)
      console.warn(`[FileLock] Failed to write lock file for ${filePath}:`, error);
    }

    // Return release function
    return async () => {
      this.locks.delete(lockPath);
      try {
        await fs.unlink(lockPath);
      } catch {
        // Lock file might not exist, ignore
      }
      releaseLock!();
    };
  }

  /**
   * Clean up stale locks (locks from processes that no longer exist)
   * Should be called on startup
   */
  static async cleanupStaleLocks(): Promise<void> {
    await this.ensureLockDir();
    try {
      const files = await fs.readdir(this.lockDir);
      for (const file of files) {
        if (!file.endsWith(".lock")) continue;
        const lockPath = join(this.lockDir, file);
        try {
          const content = await fs.readFile(lockPath, "utf-8");
          const lockData = JSON.parse(content);
          // Check if process still exists (simple check - if PID is different, assume stale)
          if (lockData.pid !== process.pid) {
            // On Windows, we can't easily check if process exists, so use timestamp
            // If lock is older than 5 minutes, consider it stale
            const age = Date.now() - (lockData.timestamp || 0);
            if (age > 5 * 60 * 1000) {
              await fs.unlink(lockPath);
              console.log(`[FileLock] Cleaned up stale lock: ${file}`);
            }
          }
        } catch {
          // If we can't read/parse, delete it
          try {
            await fs.unlink(lockPath);
          } catch {
            // Ignore errors
          }
        }
      }
    } catch (error) {
      console.warn("[FileLock] Failed to cleanup stale locks:", error);
    }
  }
}










