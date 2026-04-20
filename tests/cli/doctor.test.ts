/**
 * E2E tests for `pyanchor doctor`. Spawns dist/cli.cjs as a child
 * with controlled env so the assertions don't depend on the test
 * runner's actual file system or PATH.
 *
 * The doctor module reads `pyanchorConfig` at import time, which
 * snapshots `process.env` once. That means we can't easily unit-
 * test `runDoctor()` with multiple env permutations in the same
 * process — each permutation needs a fresh subprocess. This file
 * does that.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";

const cliPath = path.resolve(process.cwd(), "dist", "cli.cjs");

if (!existsSync(cliPath)) {
  throw new Error(`[doctor-e2e] ${cliPath} missing — run \`pnpm build\` first.`);
}

interface DoctorRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Run doctor with a controlled env. Always sets NO_COLOR for output stability. */
function runDoctor(env: Record<string, string>): DoctorRun {
  const r = spawnSync("node", [cliPath, "doctor"], {
    encoding: "utf8",
    env: {
      // Strip the parent's PYANCHOR_* env so test fixtures are
      // isolated from whatever the dev shell happens to have set.
      ...Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith("PYANCHOR_"))
      ),
      NO_COLOR: "1",
      ...env
    }
  });
  return {
    exitCode: r.status ?? 0,
    stdout: r.stdout?.toString() ?? "",
    stderr: r.stderr?.toString() ?? ""
  };
}

const setupGoodEnv = () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pyanchor-doctor-"));
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
      // Use `sh` as a stand-in agent CLI — guaranteed to exist on
      // PATH in any Unix CI runner, validates that commandExists()
      // works without depending on openclaw being installed.
      PYANCHOR_AGENT: "openclaw",
      PYANCHOR_OPENCLAW_BIN: "sh"
    }
  };
};

describe("pyanchor doctor (e2e)", () => {
  it("exit 0 + 'all required checks passed' with healthy config", () => {
    const { env } = setupGoodEnv();
    const r = runDoctor(env);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("All required checks passed");
  });

  it("exit 1 + lists every missing required env when none are set", () => {
    const r = runDoctor({});
    expect(r.exitCode).toBe(1);
    for (const name of [
      "PYANCHOR_TOKEN",
      "PYANCHOR_APP_DIR",
      "PYANCHOR_WORKSPACE_DIR",
      "PYANCHOR_RESTART_SCRIPT",
      "PYANCHOR_HEALTHCHECK_URL"
    ]) {
      expect(r.stdout).toMatch(new RegExp(`✗ ${name}`));
    }
  });

  it("exit 1 + flags missing workspace dir specifically", () => {
    const { env } = setupGoodEnv();
    const r = runDoctor({
      ...env,
      PYANCHOR_WORKSPACE_DIR: "/tmp/pyanchor-doctor-no-such-workspace-xyz"
    });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/✗ workspace exists/);
  });

  it("exit 1 + flags non-executable restart script", () => {
    const { tmp, env } = setupGoodEnv();
    const nonExec = path.join(tmp, "non-exec.sh");
    writeFileSync(nonExec, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    chmodSync(nonExec, 0o644);
    const r = runDoctor({ ...env, PYANCHOR_RESTART_SCRIPT: nonExec });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/✗ restart script executable/);
  });

  it("exit 1 + suggests PATH install for missing agent CLI", () => {
    const { env } = setupGoodEnv();
    const r = runDoctor({
      ...env,
      PYANCHOR_AGENT: "openclaw",
      PYANCHOR_OPENCLAW_BIN: "definitely-not-a-real-binary-xyz123"
    });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/✗ openclaw CLI resolves/);
    expect(r.stdout).toContain("not found on PATH");
  });

  it("PR mode adds git + gh checks", () => {
    const { tmp, env } = setupGoodEnv();
    const r = runDoctor({
      ...env,
      PYANCHOR_OUTPUT_MODE: "pr"
    });
    // git is on PATH in CI; gh may not be. We only assert that the
    // PR-specific check section ran.
    expect(r.stdout).toContain("Output mode: pr");
    expect(r.stdout).toMatch(/git on PATH/);
    expect(r.stdout).toMatch(/gh.*on PATH/);
    // workspace is not a git repo in our fixture
    expect(r.stdout).toMatch(/workspace is a git repo/);
  });

  it("dryrun mode skips apply-mode prerequisites", () => {
    const { env } = setupGoodEnv();
    const r = runDoctor({ ...env, PYANCHOR_OUTPUT_MODE: "dryrun" });
    expect(r.stdout).toContain("Output mode: dryrun");
    expect(r.stdout).toContain("agent edits stay in workspace");
  });

  it("masks PYANCHOR_TOKEN value (length only, not raw bytes)", () => {
    const { env } = setupGoodEnv();
    const r = runDoctor(env);
    expect(r.stdout).toContain("set (");
    // The literal token value must NOT appear in stdout.
    expect(r.stdout).not.toContain(env.PYANCHOR_TOKEN);
  });

  it("warns (not fails) on optional knobs being off", () => {
    const { env } = setupGoodEnv();
    const r = runDoctor(env);
    // Even though warnings are present, exit code is 0
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/! PYANCHOR_AUDIT_LOG/);
    expect(r.stdout).toMatch(/! PYANCHOR_REQUIRE_GATE_COOKIE/);
  });

  it("doctor is callable via `pyanchor doctor` subcommand (dispatcher round-trip)", () => {
    // Confirm main.ts dispatcher routes to doctor + propagates exit
    // code. The other tests use spawnSync; this one uses execFileSync
    // and asserts its catch-block exit code.
    let exitCode = 0;
    try {
      execFileSync("node", [cliPath, "doctor"], {
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1", PYANCHOR_TOKEN: "" }, // missing required env -> exit 1
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (err) {
      exitCode = (err as { status?: number }).status ?? 1;
    }
    expect(exitCode).toBe(1);
  });
});
