/**
 * Tests for `pyanchor doctor --json` (v0.30.0+). Locks the JSON
 * shape so any future doctor refactor doesn't silently break the
 * scripts/Datadog/k8s probes that consume the structured output.
 *
 * Pairs with tests/cli/doctor.test.ts (which covers the human path).
 * Same fixture pattern: spawn dist/cli.cjs, controlled env.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";

const cliPath = path.resolve(process.cwd(), "dist", "cli.cjs");

if (!existsSync(cliPath)) {
  throw new Error(`[doctor-json-e2e] ${cliPath} missing — run \`pnpm build\` first.`);
}

const setupGoodEnv = () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pyanchor-doctor-json-"));
  mkdirSync(path.join(tmp, "app"), { recursive: true });
  mkdirSync(path.join(tmp, "workspace"), { recursive: true });
  const restartScript = path.join(tmp, "restart.sh");
  writeFileSync(restartScript, "#!/usr/bin/env bash\nexit 0\n", "utf8");
  chmodSync(restartScript, 0o755);
  return {
    tmp,
    env: {
      PYANCHOR_TOKEN: "test-token-32-bytes-long-1234567890ab",
      PYANCHOR_APP_DIR: path.join(tmp, "app"),
      PYANCHOR_WORKSPACE_DIR: path.join(tmp, "workspace"),
      PYANCHOR_RESTART_SCRIPT: restartScript,
      PYANCHOR_HEALTHCHECK_URL: "http://127.0.0.1:3000/",
      PYANCHOR_AGENT: "openclaw",
      PYANCHOR_OPENCLAW_BIN: "sh"
    }
  };
};

interface DoctorJsonRun {
  exitCode: number;
  body: {
    schemaVersion: 1;
    ts: string;
    summary: { passed: number; failed: number; warned: number; total: number; exitCode: 0 | 1 };
    groups: Array<{ title: string; checks: Array<{ name: string; status: string; detail?: string; fix?: string }> }>;
  };
  raw: string;
}

function runDoctorJson(env: Record<string, string>): DoctorJsonRun {
  const r = spawnSync("node", [cliPath, "doctor", "--json"], {
    encoding: "utf8",
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith("PYANCHOR_"))
      ),
      NO_COLOR: "1",
      ...env
    }
  });
  return {
    exitCode: r.status ?? 0,
    body: JSON.parse(r.stdout || "{}"),
    raw: r.stdout || ""
  };
}

describe("pyanchor doctor --json (v0.30.0+)", () => {
  it("emits a valid JSON object on stdout (no extra noise)", () => {
    const { env } = setupGoodEnv();
    const r = runDoctorJson(env);
    expect(r.exitCode).toBe(0);
    // The entire stdout must parse. No leading/trailing console.log noise.
    expect(() => JSON.parse(r.raw)).not.toThrow();
  });

  it("top-level shape: schemaVersion + ts + summary + groups (Stable @ 1.0)", () => {
    const { env } = setupGoodEnv();
    const r = runDoctorJson(env);
    // v0.31.1 — added schemaVersion. Renaming/removing keys is a
    // major bump; adding (like this one) is non-breaking — old
    // consumers ignore unknown fields.
    expect(Object.keys(r.body).sort()).toEqual(["groups", "schemaVersion", "summary", "ts"]);
    expect(r.body.schemaVersion).toBe(1);
    expect(r.body.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("summary shape: passed/failed/warned/total/exitCode", () => {
    const { env } = setupGoodEnv();
    const r = runDoctorJson(env);
    const s = r.body.summary;
    expect(Object.keys(s).sort()).toEqual(["exitCode", "failed", "passed", "total", "warned"]);
    expect(typeof s.passed).toBe("number");
    expect(typeof s.failed).toBe("number");
    expect(typeof s.warned).toBe("number");
    expect(s.total).toBe(s.passed + s.failed + s.warned);
    expect([0, 1]).toContain(s.exitCode);
  });

  it("happy path: exitCode 0 + failed 0", () => {
    const { env } = setupGoodEnv();
    const r = runDoctorJson(env);
    expect(r.body.summary.exitCode).toBe(0);
    expect(r.body.summary.failed).toBe(0);
    expect(r.body.summary.passed).toBeGreaterThan(0);
  });

  it("misconfigured: exitCode 1 + failed > 0", () => {
    const { env } = setupGoodEnv();
    const r = runDoctorJson({
      ...env,
      PYANCHOR_WORKSPACE_DIR: "/tmp/pyanchor-doctor-json-no-workspace-xyz"
    });
    expect(r.body.summary.exitCode).toBe(1);
    expect(r.body.summary.failed).toBeGreaterThan(0);
    expect(r.exitCode).toBe(1);
  });

  it("groups have stable titles (5 sections)", () => {
    const { env } = setupGoodEnv();
    const r = runDoctorJson(env);
    const titles = r.body.groups.map((g) => g.title);
    // Output mode includes the mode in the title so we use a prefix match
    expect(titles[0]).toBe("Required environment variables");
    expect(titles[1]).toBe("Filesystem");
    expect(titles[2]).toBe("Agent");
    expect(titles[3]).toMatch(/^Output mode: /);
    expect(titles[4]).toBe("Optional knobs");
  });

  it("each check has name + status + optional detail/fix (no extras)", () => {
    const { env } = setupGoodEnv();
    const r = runDoctorJson(env);
    for (const g of r.body.groups) {
      for (const c of g.checks) {
        expect(typeof c.name).toBe("string");
        expect(["ok", "fail", "warn"]).toContain(c.status);
        for (const k of Object.keys(c)) {
          expect(["name", "status", "detail", "fix"]).toContain(k);
        }
      }
    }
  });

  it("PYANCHOR_TOKEN value never appears in JSON output (still masked)", () => {
    const { env } = setupGoodEnv();
    const r = runDoctorJson(env);
    expect(r.raw).not.toContain(env.PYANCHOR_TOKEN);
  });

  it("--json + --help: --help wins (prints help, not JSON)", () => {
    const r = spawnSync("node", [cliPath, "doctor", "--json", "--help"], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" }
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Usage:");
    expect(r.stdout).toContain("--json");
  });
});
