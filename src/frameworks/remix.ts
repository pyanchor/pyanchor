import type { FrameworkProfile } from "./types";

const ROUTE_FILE_EXTS = ["tsx", "jsx", "ts", "js"] as const;
const ROOT_CANDIDATES = [
  "app/routes/_index.tsx",
  "app/routes/_index.jsx",
  "app/root.tsx",
  "app/root.jsx"
];

function normalizeRoute(targetPath: string): string {
  return targetPath.replace(/^\/+|\/+$/g, "");
}

export const remixProfile: FrameworkProfile = {
  name: "remix",

  installCommand: "npm install",

  // Remix v2 ships a CLI that wraps vite (or its own bundler in classic
  // mode). `npm run build` runs whatever the project's package.json
  // wired up — usually `remix vite:build`.
  buildCommand: "npm run build",

  // `build` is Remix's default outDir (server + client). `.cache` is
  // the dev cache.
  workspaceExcludes: ["build", ".cache"],

  briefBuildHint:
    "Run a production build (`npm run build`, which invokes the Remix vite build) and fix any issues until it passes.",

  routeFileCandidates(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) return [...ROOT_CANDIDATES];

    // Remix v2 file-based routing. Two conventions both supported:
    //   - flat: app/routes/about.tsx, app/routes/blog.$slug.tsx
    //   - folder: app/routes/about/route.tsx
    // We try both.
    const flatRoute = route.replace(/\//g, ".");
    const candidates: string[] = [];
    for (const ext of ROUTE_FILE_EXTS) {
      candidates.push(`app/routes/${flatRoute}.${ext}`);
      candidates.push(`app/routes/${route}/route.${ext}`);
      candidates.push(`app/routes/${route}.${ext}`);
    }
    return candidates;
  },

  routeHints(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) {
      return [
        "- Start with app/routes/_index.tsx (the home route) and app/root.tsx (the document shell).",
        "- Only touch app/styles/ or a global tailwind config if the visual change needs shared styling."
      ];
    }
    return [
      "- Remix routes live under app/routes/. v2 uses dot-segmented flat files (app/routes/blog.$slug.tsx) by default; folders with a route.tsx inside are also supported.",
      "- For data-loading changes, edit the loader / action exports in the same route file, not a separate component.",
      "- Remix data flow is server-first: useLoaderData() reads from loader()."
    ];
  }
};
