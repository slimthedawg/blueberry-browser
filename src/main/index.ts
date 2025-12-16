import { app, BrowserWindow } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { Window } from "./Window";
import { AppMenu } from "./Menu";
import { EventManager } from "./EventManager";
import { FileLock } from "./utils/FileLock";

let mainWindow: Window | null = null;
let eventManager: EventManager | null = null;
let menu: AppMenu | null = null;

const createWindow = (): Window => {
  const window = new Window();
  menu = new AppMenu(window);
  eventManager = new EventManager(window);
  return window;
};

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");

  // Clean up stale file locks on startup
  await FileLock.cleanupStaleLocks();

  mainWindow = createWindow();

  // Auto-send test message after 3 seconds (for testing)
  if (process.env.AUTO_TEST_MESSAGE === "true") {
    setTimeout(() => {
      if (mainWindow) {
        const testMessage = "hi can you help me find an apartment wiht 4 rooms in stockholm that cost maximum 5milion sek, use hemnet.se you must actively press buttons and select options from dropdowns and search and submit to look.";
        const sidebar = mainWindow.sidebar;
        if (sidebar && sidebar.client) {
          sidebar.client.sendChatMessage({
            message: testMessage,
            messageId: `test-${Date.now()}`,
          });
          console.log("✅ Auto-sent test message:", testMessage);
        } else {
          console.error("❌ Sidebar not available yet, retrying in 2 seconds...");
          setTimeout(() => {
            if (mainWindow) {
              const sidebarRetry = mainWindow.sidebar;
              if (sidebarRetry && sidebarRetry.client) {
                sidebarRetry.client.sendChatMessage({
                  message: testMessage,
                  messageId: `test-${Date.now()}`,
                });
                console.log("✅ Auto-sent test message (retry):", testMessage);
              }
            }
          }, 2000);
        }
      }
    }, 3000);
  }

  app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (eventManager) {
    eventManager.cleanup();
    eventManager = null;
  }

  // Clean up references
  if (mainWindow) {
    mainWindow = null;
  }
  if (menu) {
    menu = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
