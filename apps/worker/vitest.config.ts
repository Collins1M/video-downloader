import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@video-downloader/types": path.resolve(__dirname, "../../packages/types/src"),
      "@video-downloader/config": path.resolve(__dirname, "../../packages/config/src"),
      "@video-downloader/database": path.resolve(__dirname, "../../packages/database/src"),
      "@video-downloader/security": path.resolve(__dirname, "../../packages/security/src"),
      "@video-downloader/media-extractor": path.resolve(__dirname, "../../packages/media-extractor/src"),
    },
  },
  test: {
    environment: "node",
    pool: "threads",
    include: ["src/**/*.spec.ts"],
  },
});
