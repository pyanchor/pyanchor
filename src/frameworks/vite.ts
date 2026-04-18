import type { FrameworkProfile } from "./types";

const ROUTE_FILE_EXTS = ["tsx", "jsx", "ts", "js"] as const;
const ROOT_CANDIDATES = ["src/App.tsx", "src/App.jsx", "src/main.tsx", "src/main.jsx"];

function normalizeRoute(targetPath: string): string {
  return targetPath.replace(/^\/+|\/+$/g, "");
}

export const viteProfile: FrameworkProfile = {
  name: "vite",

  // Vite users run a wide mix of pms (npm, pnpm, yarn). Ship the npm
  // default that works in any package.json without a lockfile-aware flag,
  // and let users override via PYANCHOR_INSTALL_COMMAND for stricter
  // installs (e.g. `pnpm install --frozen-lockfile`).
  installCommand: "npm install",

  buildCommand: "npm run build",

  // `dist` is Vite's default outDir. `.vite` is the dependency cache
  // (~/.vite is global, but project-local `node_modules/.vite` and a
  // few plugins drop into a top-level `.vite` too).
  workspaceExcludes: ["dist", ".vite"],

  briefBuildHint:
    "Run a production build (`npm run build`, which invokes `vite build`) and fix any issues until it passes.",

  routeFileCandidates(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) return [...ROOT_CANDIDATES];

    // No file-system router by default in Vite. Best heuristics:
    // - src/pages/<Route>.tsx (TanStack Router / hand-rolled convention)
    // - src/routes/<route>.tsx (TanStack Router file-based)
    // - src/components/<Route>.tsx (component-named-as-route)
    const candidates: string[] = [];
    const Pascal = route
      .split(/[\/\-_]/)
      .filter(Boolean)
      .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
      .join("");

    for (const ext of ROUTE_FILE_EXTS) {
      candidates.push(`src/routes/${route}.${ext}`);
      candidates.push(`src/routes/${route}/index.${ext}`);
      candidates.push(`src/pages/${route}.${ext}`);
      candidates.push(`src/pages/${route}/index.${ext}`);
      if (Pascal) {
        candidates.push(`src/pages/${Pascal}.${ext}`);
        candidates.push(`src/components/${Pascal}.${ext}`);
      }
    }
    return candidates;
  },

  routeHints(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) {
      return [
        "- Start with src/App.tsx (or src/main.tsx) and the components it imports.",
        "- Only touch src/index.css or src/App.css if the visual change needs shared styling."
      ];
    }
    return [
      "- Vite has no file-system router by default; check for src/routes/, src/pages/, or a router config (e.g. react-router) before guessing the file.",
      "- Once the route file is identified, also read the components it imports."
    ];
  }
};
