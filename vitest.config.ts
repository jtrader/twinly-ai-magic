import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Node 22+'s own experimental global `localStorage` (undefined unless
// --localstorage-file is passed) wins over jsdom's window.localStorage once
// jsdom's environment tries to define it on globalThis — set via
// NODE_OPTIONS (inherited by every worker regardless of pool type) rather
// than poolOptions.execArgv, since that only covers the "forks" pool.
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --no-experimental-webstorage`.trim();

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
    // jsdom's localStorage/sessionStorage require a real origin — the
    // default "about:blank" has none, so any test touching localStorage
    // (e.g. AgeGateDialog's acceptance persistence) fails with
    // "Cannot read properties of undefined" without this.
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
