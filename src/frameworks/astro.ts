import type { FrameworkProfile } from "./types";

const ROUTE_FILE_EXTS = ["astro", "md", "mdx", "ts", "tsx", "jsx"] as const;
const ROOT_CANDIDATES = [
  "src/pages/index.astro",
  "src/pages/index.md",
  "src/pages/index.mdx"
];

function normalizeRoute(targetPath: string): string {
  return targetPath.replace(/^\/+|\/+$/g, "");
}

export const astroProfile: FrameworkProfile = {
  name: "astro",

  // Astro doesn't ship a packageManager preference. npm install is the
  // safe default; users on pnpm/yarn override via PYANCHOR_INSTALL_COMMAND.
  installCommand: "npm install",

  // `astro build` does the SSG / SSR build depending on the project's
  // adapter. We do NOT prepend `astro check` (that needs @astrojs/check
  // + typescript dev deps which not every Astro project installs).
  buildCommand: "npx astro build",

  // `dist` is Astro's default outDir. `.astro` is the resolver cache.
  workspaceExcludes: ["dist", ".astro"],

  briefBuildHint:
    "Run a production build (`npx astro build`) and fix any issues until it passes.",

  routeFileCandidates(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) return [...ROOT_CANDIDATES];

    // Astro's file-based routing under src/pages/. Both flat
    // (src/pages/about.astro) and folder (src/pages/about/index.astro)
    // are supported. .astro is the most common; .md / .mdx are content
    // routes.
    const candidates: string[] = [];
    for (const ext of ROUTE_FILE_EXTS) {
      candidates.push(`src/pages/${route}.${ext}`);
      candidates.push(`src/pages/${route}/index.${ext}`);
    }
    return candidates;
  },

  routeHints(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) {
      return [
        "- Start with src/pages/index.astro and the components it imports from src/components/ or src/layouts/.",
        "- Only touch src/styles/ or a global stylesheet if the visual change needs shared styling."
      ];
    }
    return [
      "- Astro routes live under src/pages/. .astro is the common case; .md / .mdx are content routes.",
      "- Page components usually wrap a layout from src/layouts/ — check that first if the change is structural.",
      "- Astro components have a frontmatter (between --- fences) and a template; only the template renders."
    ];
  }
};
