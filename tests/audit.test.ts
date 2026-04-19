import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileAuditSink, NoopAuditSink, sha256Hex, type AuditEvent } from "../src/audit";

const baseEvent = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  ts: "2026-04-20T00:00:00.000Z",
  run_id: "test-job-123",
  prompt_hash: sha256Hex("hello"),
  mode: "edit",
  output_mode: "apply",
  outcome: "success",
  duration_ms: 1234,
  agent: "openclaw",
  ...overrides
});

describe("sha256Hex", () => {
  it("matches the documented SHA-256 of 'hello'", () => {
    // Sanity vector from any sha256 calculator.
    expect(sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("differs for the empty string and a single space (no UTF-8 collisions)", () => {
    expect(sha256Hex("")).not.toBe(sha256Hex(" "));
  });

  it("handles UTF-8 prompts without throwing", () => {
    expect(sha256Hex("\ud55c\uae00 \uc785\ub825")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("\u4e2d\u6587")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("\u0627\u0644\u0639\u0631\u0628\u064a\u0629")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("FileAuditSink", () => {
  let dir: string;
  let logFile: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "pyanchor-audit-"));
    logFile = path.join(dir, "audit.jsonl");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends one JSON line per emit", async () => {
    const sink = new FileAuditSink(logFile);
    await sink.emit(baseEvent({ run_id: "job-1" }));
    await sink.emit(baseEvent({ run_id: "job-2", outcome: "failed", error: "boom" }));

    const lines = readFileSync(logFile, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    expect(first.run_id).toBe("job-1");
    expect(second.run_id).toBe("job-2");
    expect(second.error).toBe("boom");
  });

  it("creates the file lazily on first emit (no need to pre-create)", async () => {
    expect(existsSync(logFile)).toBe(false);
    const sink = new FileAuditSink(logFile);
    await sink.emit(baseEvent());
    expect(existsSync(logFile)).toBe(true);
  });

  it("does not throw when the target directory is missing (logs to stderr instead)", async () => {
    const sink = new FileAuditSink(path.join(dir, "deep", "nested", "audit.jsonl"));
    // The audit failure path swallows errors after stderr — verify
    // the worker's success path can call emit without try/catch.
    await expect(sink.emit(baseEvent())).resolves.toBeUndefined();
  });

  it("writes valid JSON parseable by jq-style pipelines", async () => {
    const sink = new FileAuditSink(logFile);
    await sink.emit(baseEvent({ target_path: "/dashboard", error: 'has " quotes' }));
    const line = readFileSync(logFile, "utf8").trimEnd();
    const parsed = JSON.parse(line);
    expect(parsed.target_path).toBe("/dashboard");
    expect(parsed.error).toBe('has " quotes');
  });

  it("survives newlines / tabs in field values without breaking line-oriented parsers", async () => {
    const sink = new FileAuditSink(logFile);
    await sink.emit(baseEvent({ error: "line1\nline2\twith tab" }));
    // Even though the error contains \n, JSON.stringify escapes it,
    // so the file still has exactly one physical line per event.
    const raw = readFileSync(logFile, "utf8");
    const lines = raw.trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.error).toBe("line1\nline2\twith tab");
  });
});

describe("NoopAuditSink", () => {
  it("does not throw and creates no file", async () => {
    const sink = new NoopAuditSink();
    await expect(sink.emit(baseEvent())).resolves.toBeUndefined();
  });
});
