/**
 * E2E smoke for `pyanchor agent test` (v0.30.0+). Doesn't run an
 * actual agent — that requires CLI install + auth + API credits.
 * Tests the dispatcher + arg parsing + error handling only.
 *
 * The actual agent invocation path is exercised by the existing
 * adapter unit tests (tests/agents/*) and by manual operator runs.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cliPath = path.resolve(process.cwd(), "dist", "cli.cjs");

if (!existsSync(cliPath)) {
  throw new Error(`[agent-test-e2e] ${cliPath} missing — run \`pnpm build\` first.`);
}

describe("pyanchor agent (e2e via dist/cli.cjs)", () => {
  it("`pyanchor agent` (no subcommand) prints usage + exits 0", () => {
    const out = execFileSync("node", [cliPath, "agent"], { encoding: "utf8" });
    expect(out).toContain("agent test");
  });

  it("`pyanchor agent unknown` prints usage + exits 1", () => {
    const r = spawnSync("node", [cliPath, "agent", "unknownsubcommand"], {
      encoding: "utf8"
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("agent test");
  });

  it("`pyanchor agent test --help` prints argument reference", () => {
    const out = execFileSync("node", [cliPath, "agent", "test", "--help"], {
      encoding: "utf8"
    });
    expect(out).toContain("Usage: pyanchor agent test");
    expect(out).toContain("--prompt");
    expect(out).toContain("--mode");
    expect(out).toContain("--timeout");
  });

  it("--bogus exits 2 with parser error", () => {
    const r = spawnSync("node", [cliPath, "agent", "test", "--bogus"], {
      encoding: "utf8"
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Unknown argument");
  });

  it("--mode invalid exits 2 with clear error", () => {
    const r = spawnSync("node", [cliPath, "agent", "test", "--mode", "writeAll"], {
      encoding: "utf8"
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--mode must be chat or edit");
  });

  it("--timeout non-numeric exits 2", () => {
    const r = spawnSync("node", [cliPath, "agent", "test", "--timeout", "soon"], {
      encoding: "utf8"
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--timeout");
  });
});
