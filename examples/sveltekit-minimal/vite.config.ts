import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],

  // SvelteKit uses Vite under the hood, so the dev proxy for
  // /_pyanchor/* lives in the same place it would for a plain
  // Vite app — Vite forwards /_pyanchor/* to the sidecar on 3010.
  // In production you'd terminate this at nginx instead.
  server: {
    proxy: {
      "/_pyanchor": {
        target: "http://127.0.0.1:3010",
        changeOrigin: false,
        ws: false
      }
    }
  }
});
