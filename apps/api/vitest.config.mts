import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    // SWC plugin is required to support NestJS decorators and metadata in Vitest
    swc.vite({
      module: { type: "es6" },
      jsc: {
        keepClassNames: true,
        target: "es2022",
        parser: {
          syntax: "typescript",
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    pool: "threads",
    include: ["src/**/*.spec.ts", "src/**/*.e2e-spec.ts"],
    server: {
      deps: {
        inline: [/@nestjs/, /@video-downloader/],
      },
    },
    alias: {
      "@video-downloader/types": "../../packages/types/src",
      "@video-downloader/database": "../../packages/database/src",
      "@video-downloader/security": "../../packages/security/src",
      "@video-downloader/media-extractor": "../../packages/media-extractor/src",
    },
  },
});
