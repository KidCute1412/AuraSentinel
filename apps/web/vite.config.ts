/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Bundle the shared Zod contracts from source: the web build (Vercel included) never
      // depends on packages/shared/dist being built first. Mirrored in tsconfig "paths".
      "@agentshield/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // allow access through a quick tunnel (cloudflared) when testing from a phone
    allowedHosts: [".trycloudflare.com"],
    // API + SSE go through the proxy so the browser sees one origin (no CORS in dev).
    // Paths pass through unchanged: the server owns the /api/v1 prefix (api.md §1).
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    // Tests run against the in-browser simulation whatever a developer's local .env says (live needs a backend).
    env: { VITE_DATA_SOURCE: "mock" },
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
