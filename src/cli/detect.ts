/**
 * Auto-detection for `pyanchor init`. Sniffs the host project for
 * which framework + agent CLI is available so the prompt flow can
 * default sensibly. All detection is best-effort and side-effect free.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type Framework = "nextjs" | "vite" | "astro" | "remix" | "sveltekit" | "nuxt" | "unknown";
export type RouterKind = "app" | "pages" | "n/a";
export type AgentBin = "openclaw" | "claude-code" | "codex" | "aider" | "gemini";

export interface Detection {
  /** Resolved cwd the detection ran in. */
  cwd: string;
  /** Whether a package.json was found at all. */
  hasPackageJson: boolean;
  /** Detected framework (best guess from package.json deps + file layout). */
  framework: Framework;
  /** For Next.js, which router style. "n/a" for non-Next frameworks. */
  routerKind: RouterKind;
  /** Best guess at the dev script command (from package.json `scripts.dev`). */
  devCommand: string;
  /**
   * Default port the dev server binds to. Best guess per framework.
   * Used to seed PYANCHOR_HEALTHCHECK_URL.
   */
  defaultDevPort: number;
  /** Which agent CLIs are findable on PATH. */
  agentBins: Record<AgentBin, boolean>;
}

const FRAMEWORK_DEV_PORT: Record<Framework, number> = {
  nextjs: 3000,
  vite: 5173,
  astro: 4321,
  remix: 3000,
  sveltekit: 5173,
  nuxt: 3000,
  unknown: 3000
};

/**
 * `which`-equivalent that doesn't throw on missing binaries. Cross
 * platform: tries `command -v` on POSIX, `where` on Windows. Returns
 * the resolved path or null.
 */
function whichBin(name: string): string | null {
  try {
    const cmd = process.platform === "win32" ? `where ${name}` : `command -v ${name}`;
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim();
    // `where` may return multiple lines; take the first
    return out.split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

/**
 * Inspect the cwd and return a best-effort fingerprint. Never throws
 * — missing package.json just sets `hasPackageJson: false` so the
 * caller can decide whether to bail.
 */
export function detect(cwd: string): Detection {
  const pkgPath = path.join(cwd, "package.json");
  const hasPackageJson = existsSync(pkgPath);

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> } = {};
  if (hasPackageJson) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    } catch {
      // Malformed package.json — treat as unknown framework.
    }
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  let framework: Framework;
  if (deps.next) framework = "nextjs";
  else if (deps.astro) framework = "astro";
  else if (deps["@remix-run/react"] || deps["@remix-run/dev"]) framework = "remix";
  else if (deps["@sveltejs/kit"]) framework = "sveltekit";
  else if (deps.nuxt || deps["nuxt3"]) framework = "nuxt";
  else if (deps.vite) framework = "vite";
  else framework = "unknown";

  let routerKind: RouterKind = "n/a";
  if (framework === "nextjs") {
    const hasAppLayout = ["app/layout.tsx", "app/layout.jsx", "src/app/layout.tsx", "src/app/layout.jsx"]
      .some((p) => existsSync(path.join(cwd, p)));
    const hasPagesApp = ["pages/_app.tsx", "pages/_app.jsx", "src/pages/_app.tsx", "src/pages/_app.jsx"]
      .some((p) => existsSync(path.join(cwd, p)));
    if (hasAppLayout) routerKind = "app";
    else if (hasPagesApp) routerKind = "pages";
  }

  const agentBins: Record<AgentBin, boolean> = {
    openclaw: !!whichBin("openclaw"),
    // claude-code adapter uses an npm package, not a binary on PATH.
    // We instead probe for the dep in the host's package.json.
    "claude-code": !!deps["@anthropic-ai/claude-agent-sdk"],
    codex: !!whichBin("codex"),
    aider: !!whichBin("aider"),
    gemini: !!whichBin("gemini")
  };

  return {
    cwd,
    hasPackageJson,
    framework,
    routerKind,
    devCommand: pkg.scripts?.dev?.trim() || "npm run dev",
    defaultDevPort: FRAMEWORK_DEV_PORT[framework],
    agentBins
  };
}

/**
 * For UI: a one-line summary of the detection result. Used in the
 * init flow's banner.
 */
export function summarize(d: Detection): string {
  if (!d.hasPackageJson) {
    return `no package.json found in ${d.cwd} — run \`pyanchor init\` from your app's root`;
  }
  const fw = d.framework === "nextjs" ? `nextjs (${d.routerKind === "n/a" ? "router unknown" : `${d.routerKind} router`})` : d.framework;
  const agents = Object.entries(d.agentBins)
    .filter(([, ok]) => ok)
    .map(([name]) => name);
  const agentSummary = agents.length > 0 ? `agents available: ${agents.join(", ")}` : "no agent CLIs detected on PATH";
  return `${fw} · ${agentSummary}`;
}
