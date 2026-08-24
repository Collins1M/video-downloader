import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.spec.tsx", "**/*.spec.ts"],
    exclude: ["node_modules", ".next", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@video-downloader/types": path.resolve(__dirname, "../../packages/types/src"),
    },
  },
});
