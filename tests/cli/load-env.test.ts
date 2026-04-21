// v0.32.2 — cwd dotenv autoload regression test.
//
// Pre-v0.32.2: pyanchor init wrote .env, then `pyanchor doctor`
// showed every required env var unset because users (a) forgot
// to source the file or (b) sourced without `set -a` (so child
// processes didn't inherit). v0.32.2 makes the CLI auto-load
// the cwd .env*, matching what Vite / Next / Astro do.
//
// These tests exercise the parser + loader directly. The
// integration that wires it into main.ts is tested separately
// via tests/cli/init-e2e.test.ts (which spawns the real CLI).

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadCwdDotenv, parseDotenv } from "../../src/cli/load-env";

describe("parseDotenv", () => {
  it("parses simple KEY=VALUE pairs", () => {
    expect(parseDotenv("FOO=1\nBAR=hello\n")).toEqual({ FOO: "1", BAR: "hello" });
  });

  it("ignores comments and blank lines", () => {
    expect(parseDotenv("# comment\n\nFOO=1\n# another\nBAR=2\n")).toEqual({
      FOO: "1",
      BAR: "2"
    });
  });

  it("strips surrounding double quotes", () => {
    expect(parseDotenv('FOO="hello world"\n')).toEqual({ FOO: "hello world" });
  });

  it("strips surrounding single quotes", () => {
    expect(parseDotenv("FOO='hello world'\n")).toEqual({ FOO: "hello world" });
  });

  it("preserves unquoted spaces (after trim)", () => {
    expect(parseDotenv("FOO=hello world\n")).toEqual({ FOO: "hello world" });
  });

  it("tolerates `export KEY=VALUE` (bash-friendly form)", () => {
    expect(parseDotenv("export FOO=1\nexport BAR=hi\n")).toEqual({ FOO: "1", BAR: "hi" });
  });

  it("strips trailing inline comments after whitespace", () => {
    expect(parseDotenv("FOO=1  # trailing note\n")).toEqual({ FOO: "1" });
  });

  it("preserves URL fragments (no `\\s+#` so they're not stripped)", () => {
    expect(parseDotenv("URL=https://example.com/page#anchor\n")).toEqual({
      URL: "https://example.com/page#anchor"
    });
  });

  it("rejects lines with invalid keys", () => {
    expect(parseDotenv("1FOO=1\n=novalue\nFOO BAR=1\n")).toEqual({});
  });

  it("handles values containing equals signs", () => {
    expect(parseDotenv("DSN=postgres://u:p@h/db?sslmode=require\n")).toEqual({
      DSN: "postgres://u:p@h/db?sslmode=require"
    });
  });

  it("handles 64-char hex tokens (the pyanchor common case)", () => {
    const tok = "8c870b403310ccbd9bcd9cc418f883dd8ccfc31c946e6709d8c9e56cc336f7d5";
    expect(parseDotenv(`PYANCHOR_TOKEN=${tok}\n`)).toEqual({ PYANCHOR_TOKEN: tok });
  });
});

describe("loadCwdDotenv", () => {
  let tmp: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "pyanchor-loadenv-"));
    // Snapshot env so we can restore — these tests mutate process.env.
    savedEnv = { ...process.env };
    // Wipe any pyanchor-related vars so each test starts clean.
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("PYANCHOR_LOADENV_TEST_")) delete process.env[k];
    }
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    // Restore process.env wholesale — easier than diffing.
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  });

  it("loads .env from cwd into process.env", () => {
    writeFileSync(path.join(tmp, ".env"), "PYANCHOR_LOADENV_TEST_A=alpha\n");
    const r = loadCwdDotenv(tmp);
    expect(r.loaded).toHaveLength(1);
    expect(r.setKeys).toContain("PYANCHOR_LOADENV_TEST_A");
    expect(process.env.PYANCHOR_LOADENV_TEST_A).toBe("alpha");
  });

  it("does NOT override existing process.env entries (shell wins)", () => {
    process.env.PYANCHOR_LOADENV_TEST_B = "from-shell";
    writeFileSync(path.join(tmp, ".env"), "PYANCHOR_LOADENV_TEST_B=from-file\n");
    const r = loadCwdDotenv(tmp);
    expect(process.env.PYANCHOR_LOADENV_TEST_B).toBe("from-shell");
    expect(r.setKeys).not.toContain("PYANCHOR_LOADENV_TEST_B");
  });

  it("prefers .env.local over .env when both exist", () => {
    writeFileSync(path.join(tmp, ".env"), "PYANCHOR_LOADENV_TEST_C=from-env\n");
    writeFileSync(path.join(tmp, ".env.local"), "PYANCHOR_LOADENV_TEST_C=from-local\n");
    loadCwdDotenv(tmp);
    expect(process.env.PYANCHOR_LOADENV_TEST_C).toBe("from-local");
  });

  it("returns the absolute paths of files actually loaded", () => {
    writeFileSync(path.join(tmp, ".env"), "PYANCHOR_LOADENV_TEST_D=1\n");
    const r = loadCwdDotenv(tmp);
    expect(r.loaded).toEqual([path.join(tmp, ".env")]);
  });

  it("is a no-op when no dotenv files exist", () => {
    const r = loadCwdDotenv(tmp);
    expect(r.loaded).toEqual([]);
    expect(r.setKeys).toEqual([]);
  });

  it("is idempotent — calling twice doesn't double-set or error", () => {
    writeFileSync(path.join(tmp, ".env"), "PYANCHOR_LOADENV_TEST_E=once\n");
    loadCwdDotenv(tmp);
    expect(process.env.PYANCHOR_LOADENV_TEST_E).toBe("once");
    // Second call: file's value already in process.env, so setKeys is empty.
    const r2 = loadCwdDotenv(tmp);
    expect(r2.setKeys).toEqual([]);
    expect(process.env.PYANCHOR_LOADENV_TEST_E).toBe("once");
  });

  it("merges keys from .env that aren't in .env.local (and vice versa)", () => {
    writeFileSync(path.join(tmp, ".env"), "PYANCHOR_LOADENV_TEST_F=base\nPYANCHOR_LOADENV_TEST_G=base-only\n");
    writeFileSync(path.join(tmp, ".env.local"), "PYANCHOR_LOADENV_TEST_F=local\nPYANCHOR_LOADENV_TEST_H=local-only\n");
    loadCwdDotenv(tmp);
    expect(process.env.PYANCHOR_LOADENV_TEST_F).toBe("local"); // .env.local wins
    expect(process.env.PYANCHOR_LOADENV_TEST_G).toBe("base-only");
    expect(process.env.PYANCHOR_LOADENV_TEST_H).toBe("local-only");
  });
});
