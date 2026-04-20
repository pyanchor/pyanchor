import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite + production gate cookie pattern.
//
// Vite has no built-in middleware concept like Next.js, so we run a
// tiny separate Express-ish server (server/gate.mjs) on a different
// port that handles two things:
//   1. The magic-word URL: `?_pyanchor=<secret>` → set HttpOnly
//      `pyanchor_dev` cookie + redirect.
//   2. Reverse-proxies `/_pyanchor/*` to the pyanchor sidecar.
//
// In development, vite serves your app on 5173 and the gate server
// runs on 5174 — point your browser at the gate server. In
// production, replace the gate server with nginx + the same cookie
// + proxy rules (see server/gate.mjs comments).
//
// Bootstrap script reads the cookie via
// `data-pyanchor-require-gate-cookie="pyanchor_dev"` (the v0.17.0
// fail-safe), so even if a developer forgets to gate the script tag,
// the overlay refuses to mount without the cookie.

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/_pyanchor": {
        target: "http://127.0.0.1:3010",
        changeOrigin: true,
        ws: true
      }
    }
  }
});
