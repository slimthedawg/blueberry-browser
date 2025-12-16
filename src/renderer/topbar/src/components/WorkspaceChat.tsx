import React, { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";

export const WorkspaceChat: React.FC = () => {
  const [input, setInput] = useState("");
  const [responses, setResponses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when loading or new messages
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [loading, responses]);

  const send = async () => {
    if (!input.trim()) return;
    if (!window.electron?.ipcRenderer) {
      alert("IPC renderer är inte tillgänglig. Kontrollera att applikationen är korrekt startad.");
      return;
    }
    setLoading(true);
    try {
      const reply = await window.electron.ipcRenderer.invoke(
        "workspace-ai-chat",
        input.trim()
      );
      setResponses((prev) => [
        ...prev,
        `Du: ${input}`,
        `AI: ${reply || "Inget svar."}`,
      ]);
      setInput("");
    } catch (error) {
      console.error("Failed to send workspace chat message:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setResponses((prev) => [
        ...prev,
        `Du: ${input}`,
        `AI: Ett fel uppstod: ${errorMessage}`,
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="bg-white dark:bg-card overflow-visible shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-800/50 sm:rounded-lg border border-gray-200 dark:border-border app-region-no-drag"
      style={{ pointerEvents: "auto" }}
    >
      <div className="px-4 py-4 space-y-3 app-region-no-drag" style={{ pointerEvents: "auto" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-foreground">
              Arbetsyte-AI (endast här)
            </div>
            <p className="text-sm text-gray-600 dark:text-muted-foreground">
              Be om att skapa widgets, ändra layout eller sätta data-källor för
              den aktuella arbetsytan.
            </p>
          </div>
        </div>

        <div 
          ref={chatContainerRef}
          className="max-h-56 overflow-auto space-y-3 text-sm bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-md px-3 py-3 app-region-no-drag"
        >
          {responses.map((r, idx) => (
            <div key={idx} className="text-gray-900 dark:text-foreground">
              {r}
            </div>
          ))}
          {loading && (
            <div className="relative w-full animate-fade-in">
              <div className="flex items-start gap-3 py-3 px-4 bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-border shadow-sm">
                <Loader2 className="h-5 w-5 animate-spin text-[#07285D] dark:text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-foreground">
                    AI tänker...
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <div className="w-1.5 h-1.5 bg-[#07285D]/60 dark:bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-1.5 h-1.5 bg-[#07285D]/60 dark:bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-1.5 h-1.5 bg-[#07285D]/60 dark:bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {responses.length === 0 && !loading && (
            <div className="text-gray-500 dark:text-muted-foreground text-sm text-center py-4">Inga meddelanden ännu.</div>
          )}
        </div>

        <div className="flex items-center gap-2 app-region-no-drag">
          <input
            ref={inputRef}
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-input bg-white dark:bg-background text-gray-900 dark:text-foreground shadow-sm focus:border-[#07285D] dark:focus:border-[#07285D] focus:ring-[#07285D] dark:focus:ring-[#07285D] sm:text-sm placeholder:text-gray-500 dark:placeholder:text-muted-foreground px-3 py-2"
            style={{ pointerEvents: "auto", zIndex: 1 }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Be om widgetar, kolumner, API-kopplingar..."
            disabled={loading}
            autoComplete="off"
            tabIndex={0}
          />
          <button
            type="button"
            onClick={send}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md hover:bg-[#051f4a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#07285D] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#07285D", pointerEvents: "auto" }}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Skickar...</span>
              </>
            ) : (
              "Skicka"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

