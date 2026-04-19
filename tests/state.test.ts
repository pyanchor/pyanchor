import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const originalEnv = { ...process.env };

let stateDir = "";
const spawnedChildren: ChildProcess[] = [];

const setEnv = (overrides: Record<string, string> = {}) => {
  process.env.PYANCHOR_TOKEN = "test-token-32-chars-1234567890ab";
  process.env.PYANCHOR_APP_DIR = "/tmp";
  process.env.PYANCHOR_RESTART_SCRIPT = "/usr/bin/true";
  process.env.PYANCHOR_HEALTHCHECK_URL = "http://localhost:3000";
  process.env.PYANCHOR_WORKSPACE_DIR = "/tmp";
  process.env.PYANCHOR_OPENCLAW_BIN = "/usr/bin/true";
  process.env.PYANCHOR_STATE_DIR = stateDir;
  for (const [k, v] of Object.entries(overrides)) {
    process.env[k] = v;
  }
};

beforeEach(() => {
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v as string;
  }
  stateDir = mkdtempSync(path.join(tmpdir(), "pyanchor-state-test-"));
  setEnv();
});

afterEach(() => {
  if (stateDir && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  for (const child of spawnedChildren) {
    if (child.pid && !child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
  }
  spawnedChildren.length = 0;
  vi.unstubAllGlobals();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v as string;
  }
});

describe("writeAiEditState + readAiEditState", () => {
  it("creates an initial state file when missing", async () => {
    const { readAiEditState } = await import("../src/state");
    const state = await readAiEditState();
    expect(state.status).toBe("idle");
    expect(state.messages).toEqual([]);
    expect(state.queue).toEqual([]);
    expect(existsSync(path.join(stateDir, "state.json"))).toBe(true);
  });

  it("round-trips a written state through read", async () => {
    const { readAiEditState, writeAiEditState } = await import("../src/state");
    const initial = await readAiEditState();
    await writeAiEditState({
      ...initial,
      status: "done",
      currentStep: "All done.",
      messages: [
        {
          id: "msg-1",
          jobId: "job-1",
          role: "user",
          mode: "edit",
          text: "hello",
          createdAt: new Date(0).toISOString(),
          status: "done"
        }
      ]
    });
    const reread = await readAiEditState();
    expect(reread.status).toBe("done");
    expect(reread.currentStep).toBe("All done.");
    expect(reread.messages).toHaveLength(1);
    expect(reread.messages[0]?.text).toBe("hello");
  });

  it("uses an atomic tmp+rename write (no .tmp left behind)", async () => {
    const { readAiEditState, writeAiEditState } = await import("../src/state");
    const initial = await readAiEditState();
    await writeAiEditState({ ...initial, currentStep: "atomic" });
    expect(existsSync(path.join(stateDir, "state.json"))).toBe(true);
    expect(existsSync(path.join(stateDir, "state.json.tmp"))).toBe(false);
  });

  it("refreshes updatedAt on each write", async () => {
    const { readAiEditState, writeAiEditState } = await import("../src/state");
    const a = await readAiEditState();
    await new Promise((r) => setTimeout(r, 10));
    const b = await writeAiEditState({ ...a, currentStep: "tick" });
    expect(new Date(b.updatedAt).getTime()).toBeGreaterThan(new Date(a.updatedAt).getTime());
  });
});

describe("normalizeState (via read of corrupt file)", () => {
  it("rejects non-string activity-log entries", async () => {
    const { readAiEditState, writeAiEditState } = await import("../src/state");
    const state = await readAiEditState();
    const tampered = {
      ...state,
      activityLog: ["good", 123, null, "also good"] as unknown as string[]
    };
    // bypass writeAiEditState's normalization so we can test read normalization
    const stateFile = path.join(stateDir, "state.json");
    require("node:fs").writeFileSync(stateFile, JSON.stringify(tampered));

    const reread = await readAiEditState();
    expect(reread.activityLog).toEqual(["good", "also good"]);

    // re-touch through write to verify it stays clean
    await writeAiEditState(reread);
    const final = JSON.parse(readFileSync(stateFile, "utf8"));
    expect(final.activityLog.every((line: unknown) => typeof line === "string")).toBe(true);
  });

  it("normalizes a junk mode field to null", async () => {
    const { readAiEditState } = await import("../src/state");
    const stateFile = path.join(stateDir, "state.json");
    require("node:fs").writeFileSync(
      stateFile,
      JSON.stringify({ status: "idle", mode: "lol", queue: [], messages: [], activityLog: [] })
    );
    const state = await readAiEditState();
    expect(state.mode).toBeNull();
  });

  it("repairs queue items missing a jobId by minting a new uuid", async () => {
    const { readAiEditState } = await import("../src/state");
    const stateFile = path.join(stateDir, "state.json");
    // Use status:"running" + our own pid so the queue auto-promote
    // condition (idle/done/failed/canceled) doesn't fire and consume
    // the queue we're trying to inspect.
    require("node:fs").writeFileSync(
      stateFile,
      JSON.stringify({
        status: "running",
        pid: process.pid,
        jobId: "active",
        queue: [{ prompt: "p", targetPath: "no-slash", mode: "chat" }]
      })
    );
    const state = await readAiEditState();
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0]?.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.queue[0]?.targetPath).toBe("/no-slash");
    expect(state.queue[0]?.mode).toBe("chat");
  });

  it("caps messages at MAX_MESSAGES (24 by default)", async () => {
    const { readAiEditState, writeAiEditState } = await import("../src/state");
    const initial = await readAiEditState();
    const messages = Array.from({ length: 50 }, (_, i) => ({
      id: `m-${i}`,
      jobId: `j-${i}`,
      role: "user" as const,
      mode: "edit" as const,
      text: `msg ${i}`,
      createdAt: new Date().toISOString(),
      status: null
    }));
    await writeAiEditState({ ...initial, messages });
    const reread = await readAiEditState();
    expect(reread.messages).toHaveLength(24);
    expect(reread.messages[0]?.text).toBe("msg 26"); // last 24 = msg 26..49
  });
});

describe("startAiEdit", () => {
  beforeEach(() => {
    // Stub spawn so we don't fork a real worker.
    vi.doMock("node:child_process", async () => {
      const real = await vi.importActual<typeof import("node:child_process")>("node:child_process");
      // Spawn a real (cheap) subprocess for each "worker" so that the
      // pid we hand to state.ts is alive but killing it never harms
      // the vitest runner.
      return {
        ...real,
        spawn: () => {
          const child = real.spawn("/bin/sh", ["-c", "sleep 30"], { stdio: "ignore" });
          spawnedChildren.push(child);
          return child as never;
        }
      };
    });
  });

  it("rejects an empty prompt", async () => {
    const { startAiEdit } = await import("../src/state");
    await expect(startAiEdit({ prompt: "   ", mode: "edit" })).rejects.toThrow(/Prompt is required/);
  });

  it("rejects prompts above PYANCHOR_PROMPT_MAX_LENGTH", async () => {
    process.env.PYANCHOR_PROMPT_MAX_LENGTH = "10";
    vi.resetModules();
    const { startAiEdit } = await import("../src/state");
    await expect(startAiEdit({ prompt: "way too long", mode: "edit" })).rejects.toThrow(/too long/);
  });

  it("refuses to start when the sidecar is not configured", async () => {
    process.env.PYANCHOR_OPENCLAW_BIN = "/no/such/binary";
    vi.resetModules();
    const { startAiEdit } = await import("../src/state");
    await expect(startAiEdit({ prompt: "hi", mode: "edit" })).rejects.toThrow(
      /not fully configured/
    );
  });

  it("starts a fresh job when nothing is running, recording a user message", async () => {
    const { startAiEdit, readAiEditState } = await import("../src/state");
    const state = await startAiEdit({ prompt: "first edit", targetPath: "dashboard", mode: "edit" });
    expect(state.status).toBe("running");
    expect(state.targetPath).toBe("/dashboard");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.text).toBe("first edit");
    expect(state.messages[0]?.status).toBe("running");

    const reread = await readAiEditState();
    expect(reread.jobId).toBe(state.jobId);
  });

  it("queues a second request while the first is running", async () => {
    const { startAiEdit } = await import("../src/state");
    await startAiEdit({ prompt: "first", mode: "edit" });
    const after = await startAiEdit({ prompt: "second", mode: "edit" });
    expect(after.queue).toHaveLength(1);
    expect(after.queue[0]?.prompt).toBe("second");
    expect(after.messages.find((m) => m.text === "second")?.status).toBe("queued");
  });

  it("threads actor onto queued items (v0.19.0 passthrough)", async () => {
    const { startAiEdit } = await import("../src/state");
    await startAiEdit({ prompt: "first", mode: "edit", actor: "alice@example.com" });
    const after = await startAiEdit({
      prompt: "second",
      mode: "edit",
      actor: "bob@example.com"
    });
    // Second one queued. Its queue entry should remember bob's actor
    // so when the worker pops it, the audit log records bob, not alice.
    expect(after.queue).toHaveLength(1);
    expect(after.queue[0]?.actor).toBe("bob@example.com");
  });

  it("omits actor field on queue items when no actor was supplied", async () => {
    const { startAiEdit } = await import("../src/state");
    await startAiEdit({ prompt: "first", mode: "edit" });
    const after = await startAiEdit({ prompt: "second", mode: "edit" });
    expect(after.queue[0]?.actor).toBeUndefined();
  });
});

describe("cancelAiEdit", () => {
  it("throws when there is nothing to cancel", async () => {
    const { cancelAiEdit } = await import("../src/state");
    await expect(cancelAiEdit({})).rejects.toThrow(/No job to cancel/);
  });

  it("cancels a queued item by jobId and emits a system message", async () => {
    vi.doMock("node:child_process", async () => {
      const real = await vi.importActual<typeof import("node:child_process")>("node:child_process");
      // Spawn a real (cheap) subprocess for each "worker" so that the
      // pid we hand to state.ts is alive but killing it never harms
      // the vitest runner.
      return {
        ...real,
        spawn: () => {
          const child = real.spawn("/bin/sh", ["-c", "sleep 30"], { stdio: "ignore" });
          spawnedChildren.push(child);
          return child as never;
        }
      };
    });
    const { startAiEdit, cancelAiEdit, readAiEditState } = await import("../src/state");
    await startAiEdit({ prompt: "running", mode: "edit" });
    const queued = await startAiEdit({ prompt: "queued", mode: "edit" });
    const queuedJobId = queued.queue[0]?.jobId as string;

    await cancelAiEdit({ jobId: queuedJobId });
    const after = await readAiEditState();
    expect(after.queue.find((q) => q.jobId === queuedJobId)).toBeUndefined();
    const systemMsg = after.messages.find(
      (m) => m.role === "system" && m.text === "Queued request canceled."
    );
    expect(systemMsg).toBeDefined();
    const userMsg = after.messages.find((m) => m.jobId === queuedJobId && m.role === "user");
    expect(userMsg?.status).toBe("canceled");
  });

  it("cancels the running job (not the queue) when no jobId is supplied", async () => {
    vi.doMock("node:child_process", async () => {
      const real = await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...real,
        spawn: () => {
          const child = real.spawn("/bin/sh", ["-c", "sleep 30"], { stdio: "ignore" });
          spawnedChildren.push(child);
          return child as never;
        }
      };
    });
    const { startAiEdit, cancelAiEdit, readAiEditState } = await import("../src/state");
    const running = await startAiEdit({ prompt: "running", mode: "edit" });
    await startAiEdit({ prompt: "first queued", mode: "edit" });

    const after = await cancelAiEdit({});
    expect(after.status).toBe("canceling");
    expect(after.heartbeatLabel).toBe("Canceling");
    expect(after.jobId).toBe(running.jobId);

    // Queue is untouched — only the running job got the SIGTERM.
    const reread = await readAiEditState();
    expect(reread.queue.map((q) => q.prompt)).toEqual(["first queued"]);
  });
});

describe("getAdminHealth", () => {
  it("returns a snapshot of the running config", async () => {
    process.env.PYANCHOR_PORT = "4242";
    process.env.PYANCHOR_AGENT = "codex";
    process.env.PYANCHOR_CODEX_BIN = "/usr/bin/true";
    vi.resetModules();
    const { getAdminHealth } = await import("../src/state");
    const health = await getAdminHealth();
    expect(health.port).toBe(4242);
    expect(health.agent).toBe("codex");
    expect(health.appDir).toBe("/tmp");
    expect(health.workspaceDir).toBe("/tmp");
    expect(health.fastReload).toBe(false);
  });
});
