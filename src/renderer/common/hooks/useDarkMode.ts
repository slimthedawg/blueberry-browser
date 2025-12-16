import { useState, useEffect } from "react";

/**
 * Shared dark mode hook that synchronizes across sidebar and topbar
 * Uses a single source of truth in the main process
 */
export const useDarkMode = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check system preference initially
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // Get initial state from main process on mount
  useEffect(() => {
    if (window.electron) {
      // Request current dark mode state from main process
      window.electron.ipcRenderer.invoke("get-dark-mode").then((state: boolean) => {
        setIsDarkMode(state);
      }).catch(() => {
        // Fallback to system preference if main process not ready
        setIsDarkMode(window.matchMedia("(prefers-color-scheme: dark)").matches);
      });
    }
  }, []);

  useEffect(() => {
    // Apply or remove dark class on document root
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Broadcast dark mode change to main process (single source of truth)
    if (window.electron) {
      window.electron.ipcRenderer.send("dark-mode-changed", isDarkMode);
    }
  }, [isDarkMode]);

  // Listen for dark mode changes from main process (synchronizes sidebar and topbar)
  useEffect(() => {
    const handleDarkModeUpdate = (_event: any, newDarkMode: boolean) => {
      setIsDarkMode(newDarkMode);
    };

    if (window.electron) {
      window.electron.ipcRenderer.on("dark-mode-updated", handleDarkModeUpdate);
    }

    return () => {
      if (window.electron) {
        window.electron.ipcRenderer.removeListener(
          "dark-mode-updated",
          handleDarkModeUpdate
        );
      }
    };
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const setThemeSource = (source: "system" | "light" | "dark") => {
    if (window.electron) {
      window.electron.ipcRenderer.send("theme-source-changed", source);
    }
  };

  const getThemeSource = async (): Promise<"system" | "light" | "dark"> => {
    if (window.electron) {
      try {
        return await window.electron.ipcRenderer.invoke("get-theme-source");
      } catch {
        return "system";
      }
    }
    return "system";
  };

  return { isDarkMode, toggleDarkMode, setThemeSource, getThemeSource };
};
