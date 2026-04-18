import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Forward /_pyanchor/* to the sidecar so you don't need nginx in dev.
// Replace with a real reverse proxy in production.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/_pyanchor": {
        target: "http://127.0.0.1:3010",
        changeOrigin: true,
        ws: true
      }
    }
  }
});
