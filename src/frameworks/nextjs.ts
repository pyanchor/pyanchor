import type { FrameworkProfile } from "./types";

const ROUTE_FILE_EXTS = ["tsx", "jsx", "ts", "js"] as const;
const ROOT_CANDIDATES = [
  "app/page.tsx",
  "app/page.jsx",
  "pages/index.tsx",
  "pages/index.jsx"
];

function normalizeRoute(targetPath: string): string {
  return targetPath.replace(/^\/+|\/+$/g, "");
}

function buildRouteCandidates(route: string): string[] {
  const candidates: string[] = [];
  for (const ext of ROUTE_FILE_EXTS) {
    candidates.push(`app/${route}/page.${ext}`);
    candidates.push(`app/(auth)/${route}/page.${ext}`);
    candidates.push(`app/(marketing)/${route}/page.${ext}`);
    candidates.push(`pages/${route}.${ext}`);
    candidates.push(`pages/${route}/index.${ext}`);
  }
  return candidates;
}

export const nextjsProfile: FrameworkProfile = {
  name: "nextjs",

  // corepack ships with Node ≥16.10. yarn install --frozen-lockfile keeps
  // node_modules deterministic across the persistent workspace.
  installCommand: "corepack yarn install --frozen-lockfile",

  // NEXT_TELEMETRY_DISABLED keeps the build silent and skips the prompt
  // on first run inside the agent user's HOME.
  buildCommand: "env NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next build",

  workspaceExcludes: [".next"],

  briefBuildHint:
    "Run a production build (`next build`) and fix any issues until it passes.",

  routeFileCandidates(targetPath: string): string[] {
    const route = normalizeRoute(targetPath);
    if (!route) return [...ROOT_CANDIDATES];
    return buildRouteCandidates(route);
  },

  routeHints(targetPath: string): string[] {
    if (targetPath === "/login" || targetPath === "/signup") {
      return [
        "- Start with auth files only: app/(auth)/login/page.tsx, app/(auth)/signup/page.tsx, components/auth/, app/(auth)/layout.tsx, app/globals.css.",
        "- Preserve the Korean UI copy and the existing login/signup behavior.",
        "- Prefer a shared auth component if the change affects both login and signup tabs.",
        "- For this route, animations should be subtle and product-like: short fade/slide transitions, tab indicator movement, no flashy motion."
      ];
    }

    return [
      "- Start with the target route file and the components that route imports.",
      "- Only touch app/globals.css if the visual change needs shared styling."
    ];
  }
};
