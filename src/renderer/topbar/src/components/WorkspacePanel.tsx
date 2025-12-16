import React, { useEffect, useState } from "react";
import { WorkspaceChat } from "./WorkspaceChat";

interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
}

export const WorkspacePanel: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const refresh = async () => {
    if (!window.electron?.ipcRenderer) {
      console.error("IPC renderer not available");
      return;
    }
    setLoading(true);
    try {
      const list = await window.electron.ipcRenderer.invoke("workspace-list");
      setWorkspaces(list || []);
    } catch (error) {
      console.error("Failed to list workspaces:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !window.electron?.ipcRenderer) {
      console.error("Cannot create workspace: name empty or IPC not available");
      return;
    }
    try {
      await window.electron.ipcRenderer.invoke("workspace-create", name.trim());
      setName("");
      await refresh();
    } catch (error) {
      console.error("Failed to create workspace:", error);
      alert(`Kunde inte skapa arbetsyta: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!window.electron?.ipcRenderer) {
      console.error("IPC renderer not available");
      return;
    }
    try {
      await window.electron.ipcRenderer.invoke("workspace-set-default", id);
      await refresh();
    } catch (error) {
      console.error("Failed to set default workspace:", error);
      alert(`Kunde inte sätta standard arbetsyta: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.electron?.ipcRenderer) {
      console.error("IPC renderer not available");
      return;
    }
    if (!confirm("Är du säker på att du vill ta bort denna arbetsyta?")) {
      return;
    }
    try {
      await window.electron.ipcRenderer.invoke("workspace-delete", id);
      await refresh();
    } catch (error) {
      console.error("Failed to delete workspace:", error);
      alert(`Kunde inte ta bort arbetsyta: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleStartEdit = (workspace: Workspace) => {
    setEditingId(workspace.id);
    setEditingName(workspace.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim() || !window.electron?.ipcRenderer) {
      console.error("Cannot save: name empty or IPC not available");
      return;
    }
    try {
      const workspace = workspaces.find((w) => w.id === id);
      if (!workspace) return;
      const updated = { ...workspace, name: editingName.trim() };
      await window.electron.ipcRenderer.invoke("workspace-update", updated);
      setEditingId(null);
      setEditingName("");
      await refresh();
    } catch (error) {
      console.error("Failed to update workspace:", error);
      alert(`Kunde inte uppdatera arbetsyta: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="space-y-6 dark:text-foreground">
      <div className="bg-white dark:bg-card overflow-visible shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-800/50 sm:rounded-lg border border-gray-200 dark:border-border">
        <div className="px-4 py-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">Arbetsytor</h3>
              <p className="text-sm text-gray-600 dark:text-muted-foreground">
                Skapa, välj standard och hantera startsidorna för dina arbetsytor.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-input bg-white dark:bg-background text-gray-900 dark:text-foreground shadow-sm focus:border-[#07285D] dark:focus:border-[#07285D] focus:ring-[#07285D] dark:focus:ring-[#07285D] sm:text-sm placeholder:text-gray-500 dark:placeholder:text-muted-foreground"
              placeholder="Namn på arbetsyta"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !loading) {
                  handleCreate();
                }
              }}
            />
            <button
              onClick={handleCreate}
              disabled={!name.trim() || loading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md hover:bg-[#051f4a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#07285D] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#07285D" }}
            >
              Skapa
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500 dark:text-muted-foreground">Laddar arbetsytor...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="flex flex-col justify-between rounded-lg border border-gray-200 dark:border-border bg-gray-50 dark:bg-card p-3 hover:shadow-md transition-shadow"
                >
                  <div className="space-y-2 mb-3">
                    {editingId === ws.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 text-sm rounded-md border-gray-300 dark:border-input bg-white dark:bg-background text-gray-900 dark:text-foreground shadow-sm focus:border-[#07285D] dark:focus:border-[#07285D] focus:ring-[#07285D] dark:focus:ring-[#07285D] px-2 py-1"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSaveEdit(ws.id);
                            } else if (e.key === "Escape") {
                              handleCancelEdit();
                            }
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveEdit(ws.id)}
                          className="px-2 py-1 text-xs font-medium text-white rounded bg-[#07285D] hover:bg-[#051f4a]"
                        >
                          Spara
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-foreground bg-white dark:bg-secondary border border-gray-300 dark:border-border rounded hover:bg-gray-50 dark:hover:bg-secondary/80"
                        >
                          Avbryt
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-900 dark:text-foreground truncate flex-1">
                            {ws.name}
                          </div>
                        </div>
                        {ws.isDefault && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                            Standard
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {editingId !== ws.id && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEdit(ws)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-foreground bg-white dark:bg-secondary border border-gray-300 dark:border-border rounded-md hover:bg-gray-50 dark:hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#07285D] flex-1 justify-center"
                      >
                        Redigera
                      </button>
                      {!ws.isDefault && (
                        <button
                          onClick={() => handleSetDefault(ws.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-foreground bg-white dark:bg-secondary border border-gray-300 dark:border-border rounded-md hover:bg-gray-50 dark:hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#07285D]"
                        >
                          Standard
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(ws.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400 bg-white dark:bg-secondary border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-400"
                      >
                        Ta bort
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {workspaces.length === 0 && (
                <div className="col-span-full text-sm text-gray-500 dark:text-muted-foreground text-center py-4">
                  Inga arbetsytor ännu.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <WorkspaceChat />
    </div>
  );
};

