import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  resolve: {
    alias: {
      "@features": path.resolve("./src/features"),
      "@core":     path.resolve("./src/core"),
      "@shared":   path.resolve("./src/shared"),
      "@api":      path.resolve("./src/api"),
      "@store":    path.resolve("./src/store"),
      "@types":    path.resolve("./src/types"),
      "@design":   path.resolve("./src/design"),
      "@assets":   path.resolve("./src/assets"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG ? "oxc" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});