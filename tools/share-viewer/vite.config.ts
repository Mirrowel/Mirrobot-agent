import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

// Client-only build of the upstream share page. Two data modes at runtime
// (see src/data-source.ts): live worker (polls /api/share/:id/data) and
// embedded (window.__MIRROBOT_SNAPSHOT__ set by the local server).
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  build: {
    target: "es2022",
    outDir: "dist",
    chunkSizeWarningLimit: 4000,
  },
  // pierre's diff worker must be ES (iife breaks under code-splitting;
  // ES workers are fine in every modern browser)
  worker: { format: "es" },
  // the vendored packages import CSS via their exports map; vite handles
  // ?worker&url natively (markdown + pierre diff workers)
  server: {
    fs: { allow: [path.resolve(__dirname), path.resolve(__dirname, "vendor")] },
  },
})
