import type { FrameworkProfile } from "./types";

const ROOT_CANDIDATES = [
  "src/routes/+page.svelte",
  "src/routes/+page.ts",
  "src/routes/+page.js"
];

function normalizeRoute(targetPath: string): string {
  return targetPath.replace(/^\/+|\/+$/g, "");
}

export const sveltekitProfile: FrameworkProfile = {
  name: "sveltekit",

  installCommand: "npm install",

  // SvelteKit's build runs vite under the hood and applies the configured
  // adapter (node / static / vercel / etc).
  buildCommand: "npm run build",

  // `.svelte-kit` is the dev/build cache. `build` is the default
  // adapter-node output; `dist` covers other adapters that emit there.
  // `.vite` for the underlying Vite dep cache.
  workspaceExcludes: [".svelte-kit", "build", "dist", ".vite"],

  briefBuildHint:
    "Run a production build (`npm run build`, which invokes `vite build` + the configured SvelteKit adapter) and fix any issues until it passes.",

  routeFileCandidates(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) return [...ROOT_CANDIDATES];

    // SvelteKit's file-based routing: src/routes/<segment>/+page.svelte
    // is the most common. Layouts (+layout.svelte) and server endpoints
    // (+page.server.ts) live alongside.
    return [
      `src/routes/${route}/+page.svelte`,
      `src/routes/${route}/+page.ts`,
      `src/routes/${route}/+page.js`,
      `src/routes/${route}/+page.server.ts`,
      `src/routes/${route}/+page.server.js`
    ];
  },

  routeHints(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) {
      return [
        "- Start with src/routes/+page.svelte and the layout above it (src/routes/+layout.svelte).",
        "- Only touch src/app.css or src/lib/styles/ if the visual change needs shared styling."
      ];
    }
    return [
      "- SvelteKit routes live at src/routes/<segment>/+page.svelte. The +layout.svelte at the same or parent level is the wrapper.",
      "- For data-loading changes, edit +page.server.ts or +page.ts (the load function), not the .svelte file.",
      "- Svelte 5 uses runes ($state, $derived, $effect) — preserve the existing reactivity style if you see them."
    ];
  }
};
