import type { FrameworkProfile } from "./types";

const ROUTE_FILE_EXTS = ["vue", "ts", "tsx", "jsx", "js"] as const;
const ROOT_CANDIDATES = ["pages/index.vue", "app.vue"];

function normalizeRoute(targetPath: string): string {
  return targetPath.replace(/^\/+|\/+$/g, "");
}

/**
 * v0.34.0 — Nuxt 3+ profile (sixth built-in framework).
 *
 * Nuxt's project layout is similar to Next.js conceptually but
 * uses Vue + a different file convention:
 *   - File-based routing under `pages/` (auto-collected by Nuxt)
 *   - `app.vue` is the root layout when no router is present
 *   - `components/` is auto-imported (no explicit import needed)
 *   - `layouts/default.vue` wraps every page by default
 *   - `nuxt.config.ts` is the main config
 *
 * `.nuxt/` is the build cache (analogous to Next's `.next/`).
 * `.output/` is the production build (`nuxt build` writes here).
 * `dist/` is the static export when using `nuxt generate`.
 */
export const nuxtProfile: FrameworkProfile = {
  name: "nuxt",

  installCommand: "npm install",
  buildCommand: "npx nuxt build",

  // .nuxt = dev/build cache, .output = nuxt build output,
  // dist = nuxt generate (static) output. node_modules is
  // already excluded by the global rsync rule.
  workspaceExcludes: [".nuxt", ".output", "dist"],

  briefBuildHint:
    "Run a production build (`npx nuxt build`) and fix any issues until it passes.",

  routeFileCandidates(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) return [...ROOT_CANDIDATES];

    // Nuxt's file-based routing under pages/. Both flat
    // (pages/about.vue) and folder (pages/about/index.vue)
    // are supported. .vue is the common case; the others
    // cover edge configs (Pages module with TS-only files).
    const candidates: string[] = [];
    for (const ext of ROUTE_FILE_EXTS) {
      candidates.push(`pages/${route}.${ext}`);
      candidates.push(`pages/${route}/index.${ext}`);
    }
    // Component-shaped target (e.g. /Header → components/Header.vue)
    // — Nuxt auto-imports anything in components/.
    const segments = route.split("/");
    const last = segments[segments.length - 1];
    if (last) {
      // Pascal-cased component file (typical Vue convention).
      const pascal = last
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("");
      for (const ext of ROUTE_FILE_EXTS) {
        candidates.push(`components/${pascal}.${ext}`);
        candidates.push(`components/${last}.${ext}`);
      }
    }
    return candidates;
  },

  routeHints(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) {
      return [
        "- Start with pages/index.vue (or app.vue if there are no pages/) and the components it imports.",
        "- Nuxt auto-imports everything in components/ — no explicit import needed for those."
      ];
    }
    return [
      "- Nuxt routes live under pages/. .vue is the common case.",
      "- Page components usually wrap layouts/default.vue — check that first if the change is structural (header, nav, footer).",
      "- components/ is auto-imported, so referencing <MyComponent /> in a page Just Works without an import line.",
      "- Vue 3 single-file components have <script setup>, <template>, <style> blocks. Edit only what the request needs."
    ];
  }
};
