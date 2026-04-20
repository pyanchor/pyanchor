/**
 * E2E tests for `pyanchor logs` (v0.30.0+). Spawns dist/cli.cjs
 * against tmpdir audit.jsonl fixtures.
 *
 * --follow mode is intentionally NOT tested here — long-running
 * watcher with signal-based teardown is hard to get reliable in
 * vitest. The non-follow paths cover all the parsing/filtering/
 * rendering logic; --follow is just "do the same on every new
 * line" which is exercised by manual smoke + the non-follow tests
 * (parseJsonl + applyFilters + renderEvent are shared).
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";

const cliPath = path.resolve(process.cwd(), "dist", "cli.cjs");

if (!existsSync(cliPath)) {
  throw new Error(`[logs-e2e] ${cliPath} missing — run \`pnpm build\` first.`);
}

const SAMPLE_EVENTS = [
  {
    ts: "2026-04-20T10:00:00.000Z",
    run_id: "r1",
    actor: "alice@example.com",
    prompt_hash: "h1",
    target_path: "/dashboard",
    mode: "edit",
    output_mode: "apply",
    diff_hash: "d1",
    outcome: "success",
    duration_ms: 18500,
    agent: "openclaw"
  },
  {
    ts: "2026-04-20T10:05:00.000Z",
    run_id: "r2",
    actor: "bob@example.com",
    prompt_hash: "h2",
    target_path: "/about",
    mode: "edit",
    output_mode: "pr",
    outcome: "success",
    duration_ms: 42000,
    agent: "openclaw",
    pr_url: "https://github.com/x/y/pull/42"
  },
  {
    ts: "2026-04-20T10:10:00.000Z",
    run_id: "r3",
    actor: "alice@example.com",
    prompt_hash: "h3",
    mode: "chat",
    output_mode: "apply",
    outcome: "failed",
    duration_ms: 3200,
    agent: "codex",
    error: "rate limit exceeded"
  }
];

const setupAuditLog = (): string => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pyanchor-logs-"));
  const file = path.join(tmp, "audit.jsonl");
  writeFileSync(file, SAMPLE_EVENTS.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  return file;
};

const runLogs = (file: string, ...extra: string[]) =>
  spawnSync("node", [cliPath, "logs", "--file", file, ...extra], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" }
  });

describe("pyanchor logs (e2e via dist/cli.cjs)", () => {
  it("--help prints usage", () => {
    const out = execFileSync("node", [cliPath, "logs", "--help"], { encoding: "utf8" });
    expect(out).toContain("Usage: pyanchor logs");
    expect(out).toContain("--follow");
  });

  it("missing audit file: exit 1 + clear error", () => {
    const r = runLogs("/tmp/pyanchor-logs-no-such-file-xyz");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("audit log not found");
  });

  it("default: prints header + 3 events (last 20 fits all 3)", () => {
    const file = setupAuditLog();
    const r = runLogs(file);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("timestamp");
    expect(r.stdout).toContain("alice@example.com");
    expect(r.stdout).toContain("bob@example.com");
    expect(r.stdout).toContain("rate limit exceeded");
  });

  it("--tail 1 prints only the most recent event (r3)", () => {
    const file = setupAuditLog();
    const r = runLogs(file, "--tail", "1");
    // r3 is the most recent: failed, chat/apply, error="rate limit..."
    expect(r.stdout).toContain("rate limit exceeded");
    expect(r.stdout).not.toContain("/dashboard"); // r1 marker
    expect(r.stdout).not.toContain("/about"); // r2 marker
    expect(r.stdout).not.toContain("bob"); // r2's actor
  });

  it("--outcome failed filters to failed events only", () => {
    const file = setupAuditLog();
    const r = runLogs(file, "--outcome", "failed");
    expect(r.stdout).toContain("rate limit exceeded");
    expect(r.stdout).not.toContain("/dashboard"); // r1 success, filtered out
  });

  it("--actor substring filter", () => {
    const file = setupAuditLog();
    const r = runLogs(file, "--actor", "bob");
    expect(r.stdout).toContain("bob@example.com");
    expect(r.stdout).not.toContain("alice");
  });

  it("--mode pr filters to PR-output events", () => {
    const file = setupAuditLog();
    const r = runLogs(file, "--mode", "pr");
    expect(r.stdout).toContain("bob@example.com");
    expect(r.stdout).not.toContain("alice");
  });

  it("--since filter keeps r3 (10:10) and drops r1/r2", () => {
    const file = setupAuditLog();
    const r = runLogs(file, "--since", "2026-04-20T10:08:00Z");
    // r3 (10:10) passes; r1 (10:00) and r2 (10:05) filtered out
    expect(r.stdout).toContain("rate limit exceeded"); // r3 specific marker
    expect(r.stdout).not.toContain("/dashboard"); // r1 specific
    expect(r.stdout).not.toContain("/about"); // r2 specific
    expect(r.stdout).not.toContain("bob"); // r2 specific actor
  });

  it("--json emits one event per line, parseable as JSON", () => {
    const file = setupAuditLog();
    const r = runLogs(file, "--json");
    const lines = r.stdout.trim().split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("empty file: prints '(no matching events)' + exit 0", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "pyanchor-logs-empty-"));
    const file = path.join(tmp, "audit.jsonl");
    writeFileSync(file, "", "utf8");
    const r = runLogs(file);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("(no matching events");
  });

  it("malformed lines are skipped (no crash)", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "pyanchor-logs-bad-"));
    const file = path.join(tmp, "audit.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify(SAMPLE_EVENTS[0]),
        "{ this is not valid json",
        "",
        JSON.stringify(SAMPLE_EVENTS[2])
      ].join("\n") + "\n",
      "utf8"
    );
    const r = runLogs(file);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("alice@example.com");
    expect(r.stdout).toContain("rate limit exceeded");
  });

  it("unknown flag exits 2 with clear error", () => {
    const file = setupAuditLog();
    const r = runLogs(file, "--bogus");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Unknown argument");
  });
});
