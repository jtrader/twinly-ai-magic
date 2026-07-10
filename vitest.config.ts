import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Standalone from vite.config.ts on purpose — that file's plugin stack
// (tanstackStart, nitro, the Lovable dev-server bridge, etc.) is for the
// app server, not needed for component tests, and its own comment warns
// against layering extra plugins onto it.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
