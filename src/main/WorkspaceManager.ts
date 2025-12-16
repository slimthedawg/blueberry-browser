import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { FileLock } from "./utils/FileLock";

export interface LayoutConfig {
  mode: "grid" | "free";
}

export interface Widget {
  id: string;
  type: "website" | "custom";
  sourceUrl: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  /**
   * Persisted mini-browser state per widget.
   * - historyEntries/historyIndex: used to restore navigation stack and power back/forward UI
   * - zoomFactor: per-widget zoom level (Ctrl+wheel)
   */
  historyEntries?: string[];
  historyIndex?: number;
  zoomFactor?: number;
  css?: string;
  filters?: Array<Record<string, any>>;
  apiMappings?: Array<Record<string, any>>;
  domSnapshot?: any;
  cssSnapshot?: string;
}

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  widgets: Widget[];
  layout: LayoutConfig;
}

const WORKSPACES_DIR = join(app.getPath("userData"), "workspaces");

async function ensureDir(): Promise<void> {
  await fs.mkdir(WORKSPACES_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, content, "utf-8");
}

export class WorkspaceManager {
  private static instance: WorkspaceManager | null = null;

  static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager();
    }
    return WorkspaceManager.instance;
  }

  private constructor() {}

  private workspacePath(id: string): string {
    return join(WORKSPACES_DIR, `${id}.json`);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    await ensureDir();
    const files = await fs.readdir(WORKSPACES_DIR);
    const workspaces: Workspace[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const ws = await readJsonFile<Workspace>(join(WORKSPACES_DIR, file));
      if (ws) workspaces.push(ws);
    }
    return workspaces;
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    await ensureDir();
    const filePath = this.workspacePath(id);
    const releaseLock = await FileLock.acquire(filePath);
    try {
      return await readJsonFile<Workspace>(filePath);
    } finally {
      await releaseLock();
    }
  }

  async createWorkspace(name: string): Promise<Workspace> {
    await ensureDir();
    const workspace: Workspace = {
      id: randomUUID(),
      name,
      isDefault: false,
      widgets: [],
      layout: { mode: "grid" },
    };
    await writeJsonFile(this.workspacePath(workspace.id), workspace);
    return workspace;
  }

  async updateWorkspace(workspace: Workspace): Promise<Workspace> {
    await ensureDir();
    const filePath = this.workspacePath(workspace.id);
    const releaseLock = await FileLock.acquire(filePath);
    try {
      await writeJsonFile(filePath, workspace);
    } finally {
      await releaseLock();
    }
    return workspace;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await ensureDir();
    try {
      await fs.unlink(this.workspacePath(id));
    } catch {
      // ignore missing
    }
    // Ensure no workspace is marked default if deleted
    const all = await this.listWorkspaces();
    const remaining = all.filter((w) => w.id !== id);
    const hasDefault = remaining.some((w) => w.isDefault);
    if (!hasDefault && remaining.length > 0) {
      remaining[0].isDefault = true;
      await this.updateWorkspace(remaining[0]);
    }
  }

  async setDefaultWorkspace(id: string): Promise<void> {
    const all = await this.listWorkspaces();
    for (const ws of all) {
      const next = { ...ws, isDefault: ws.id === id };
      await this.updateWorkspace(next);
    }
  }

  async getDefaultWorkspace(): Promise<Workspace | null> {
    const all = await this.listWorkspaces();
    const def = all.find((w) => w.isDefault);
    if (def) return def;
    return all[0] || null;
  }

  /**
   * Ensure at least one workspace exists. Creates a default if none found.
   */
  async ensureDefaultWorkspace(): Promise<Workspace> {
    const all = await this.listWorkspaces();
    if (all.length > 0) {
      const def = await this.getDefaultWorkspace();
      if (def) return def;
      const first = all[0];
      await this.setDefaultWorkspace(first.id);
      return first;
    }
    const created = await this.createWorkspace("Default Workspace");
    await this.setDefaultWorkspace(created.id);
    return created;
  }
}

export function getWorkspaceManager(): WorkspaceManager {
  return WorkspaceManager.getInstance();
}

