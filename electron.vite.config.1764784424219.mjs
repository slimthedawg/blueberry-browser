// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "C:\\Users\\Slim\\Documents\\Strawberry_AI\\peach-browser";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          topbar: resolve(__electron_vite_injected_dirname, "src/preload/topbar.ts"),
          sidebar: resolve(__electron_vite_injected_dirname, "src/preload/sidebar.ts")
        }
      }
    }
  },
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: {
        input: {
          topbar: resolve(__electron_vite_injected_dirname, "src/renderer/topbar/index.html"),
          sidebar: resolve(__electron_vite_injected_dirname, "src/renderer/sidebar/index.html")
        }
      }
    },
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@common": resolve("src/renderer/common")
      }
    },
    plugins: [react()],
    server: {
      fs: {
        allow: [".."]
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
