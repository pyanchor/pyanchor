import { defineConfig } from "astro/config";

// Astro is *not* a built-in framework profile (only nextjs/vite are
// in v0.26.0). pyanchor falls back to nextjs defaults and prints a
// one-line warning — that's why we set PYANCHOR_INSTALL_COMMAND and
// PYANCHOR_BUILD_COMMAND on the sidecar (see README).
//
// The proxy below forwards /_pyanchor/* from astro's dev server
// (default :4321) to the sidecar (default :3010). In production
// you'd terminate this at nginx instead.
export default defineConfig({
  server: {
    port: 4321,
    host: "127.0.0.1"
  },
  vite: {
    server: {
      proxy: {
        "/_pyanchor": {
          target: "http://127.0.0.1:3010",
          changeOrigin: false,
          ws: false
        }
      }
    }
  }
});
