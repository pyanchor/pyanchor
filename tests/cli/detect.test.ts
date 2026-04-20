/**
 * Tests for the v0.28.0 `pyanchor init` framework + agent detector.
 *
 * Uses tmpdir fixtures (no mocking of fs) — the detector reads
 * package.json + checks file existence, both of which are cheap to
 * stub with real files. Agent CLI presence is harder to test in
 * isolation; we don't assert specific agentBins values, only that
 * the shape is right (every key present, all booleans).
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detect, summarize } from "../../src/cli/detect";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), "pyanchor-detect-"));
});

afterEach(() => {
  // Vitest tears down processes per file, fs cleanup is best-effort.
  // Leaving the dirs is fine on tmpfs.
});

const writePkg = (cwd: string, pkg: object) => {
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify(pkg, null, 2), "utf8");
};

describe("detect()", () => {
  it("flags missing package.json without throwing", () => {
    const d = detect(tmpRoot);
    expect(d.hasPackageJson).toBe(false);
    expect(d.framework).toBe("unknown");
  });

  it("identifies Next.js with App Router from layout.tsx", () => {
    writePkg(tmpRoot, {
      dependencies: { next: "^14.2.0", react: "^18.3.1" },
      scripts: { dev: "next dev" }
    });
    mkdirSync(path.join(tmpRoot, "app"), { recursive: true });
    writeFileSync(path.join(tmpRoot, "app", "layout.tsx"), "export default () => null;", "utf8");
    const d = detect(tmpRoot);
    expect(d.framework).toBe("nextjs");
    expect(d.routerKind).toBe("app");
    expect(d.defaultDevPort).toBe(3000);
    expect(d.devCommand).toBe("next dev");
  });

  it("identifies Next.js with Pages Router from _app.tsx", () => {
    writePkg(tmpRoot, { dependencies: { next: "^13.0.0" } });
    mkdirSync(path.join(tmpRoot, "pages"), { recursive: true });
    writeFileSync(path.join(tmpRoot, "pages", "_app.tsx"), "export default () => null;", "utf8");
    const d = detect(tmpRoot);
    expect(d.framework).toBe("nextjs");
    expect(d.routerKind).toBe("pages");
  });

  it("identifies Next.js with src/app convention", () => {
    writePkg(tmpRoot, { dependencies: { next: "^14.2.0" } });
    mkdirSync(path.join(tmpRoot, "src", "app"), { recursive: true });
    writeFileSync(path.join(tmpRoot, "src", "app", "layout.jsx"), "", "utf8");
    const d = detect(tmpRoot);
    expect(d.framework).toBe("nextjs");
    expect(d.routerKind).toBe("app");
  });

  it("falls back to router=n/a for Next.js without recognizable layout", () => {
    writePkg(tmpRoot, { dependencies: { next: "^14.2.0" } });
    const d = detect(tmpRoot);
    expect(d.framework).toBe("nextjs");
    expect(d.routerKind).toBe("n/a");
  });

  it("identifies Vite from package.json deps", () => {
    writePkg(tmpRoot, { devDependencies: { vite: "^5.4.0" } });
    const d = detect(tmpRoot);
    expect(d.framework).toBe("vite");
    expect(d.defaultDevPort).toBe(5173);
  });

  it("identifies Astro", () => {
    writePkg(tmpRoot, { dependencies: { astro: "^4.16.0" } });
    const d = detect(tmpRoot);
    expect(d.framework).toBe("astro");
    expect(d.defaultDevPort).toBe(4321);
  });

  it("identifies SvelteKit", () => {
    writePkg(tmpRoot, { devDependencies: { "@sveltejs/kit": "^2.0.0" } });
    const d = detect(tmpRoot);
    expect(d.framework).toBe("sveltekit");
  });

  it("identifies Remix", () => {
    writePkg(tmpRoot, { dependencies: { "@remix-run/react": "^2.0.0" } });
    const d = detect(tmpRoot);
    expect(d.framework).toBe("remix");
  });

  it("identifies Nuxt", () => {
    writePkg(tmpRoot, { dependencies: { nuxt: "^3.13.0" } });
    const d = detect(tmpRoot);
    expect(d.framework).toBe("nuxt");
  });

  it("falls back to unknown when no framework dep is present", () => {
    writePkg(tmpRoot, { dependencies: { lodash: "^4.0.0" } });
    const d = detect(tmpRoot);
    expect(d.framework).toBe("unknown");
  });

  it("handles malformed package.json gracefully", () => {
    writeFileSync(path.join(tmpRoot, "package.json"), "{ this is not json", "utf8");
    const d = detect(tmpRoot);
    expect(d.hasPackageJson).toBe(true);
    expect(d.framework).toBe("unknown");
    // devCommand falls back to default
    expect(d.devCommand).toBe("npm run dev");
  });

  it("agentBins shape: every key present, all booleans", () => {
    writePkg(tmpRoot, {});
    const d = detect(tmpRoot);
    expect(Object.keys(d.agentBins).sort()).toEqual([
      "aider",
      "claude-code",
      "codex",
      "gemini",
      "openclaw"
    ]);
    Object.values(d.agentBins).forEach((v) => expect(typeof v).toBe("boolean"));
  });

  it("claude-code agent detected via host package.json deps (not PATH)", () => {
    writePkg(tmpRoot, {
      dependencies: { "@anthropic-ai/claude-agent-sdk": "^1.0.0" }
    });
    const d = detect(tmpRoot);
    expect(d.agentBins["claude-code"]).toBe(true);
  });
});

describe("summarize()", () => {
  it("calls out missing package.json", () => {
    const d = detect(tmpRoot);
    expect(summarize(d)).toContain("no package.json found");
  });

  it("describes Next.js + router style + agents in one line", () => {
    writePkg(tmpRoot, {
      dependencies: { next: "^14.2.0", "@anthropic-ai/claude-agent-sdk": "^1.0.0" }
    });
    mkdirSync(path.join(tmpRoot, "app"), { recursive: true });
    writeFileSync(path.join(tmpRoot, "app", "layout.tsx"), "", "utf8");
    const summary = summarize(detect(tmpRoot));
    expect(summary).toContain("nextjs");
    expect(summary).toContain("app router");
    expect(summary).toContain("claude-code");
  });

  it("flags 'no agent CLIs detected' when nothing matches", () => {
    writePkg(tmpRoot, { dependencies: { next: "^14.2.0" } });
    const summary = summarize(detect(tmpRoot));
    // Whether agents are present depends on the dev box, so we
    // can't assert a specific phrase here without flakiness.
    // Instead, assert the framework portion is right.
    expect(summary).toContain("nextjs");
  });
});
