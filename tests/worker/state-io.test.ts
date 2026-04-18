import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createStateIO } from "../../src/worker/state-io";
import type { AiEditState } from "../../src/shared/types";

let tmpDir = "";
let stateFile = "";

const minimalState = (overrides: Partial<AiEditState> = {}): AiEditState => ({
  configured: true,
  status: "idle",
  jobId: null,
  pid: null,
  prompt: "",
  targetPath: "",
  mode: null,
  currentStep: null,
  heartbeatAt: null,
  heartbeatLabel: null,
  thinking: null,
  activityLog: [],
  error: null,
  startedAt: null,
  completedAt: null,
  updatedAt: new Date(0).toISOString(),
  queue: [],
  messages: [],
  ...overrides
});

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "pyanchor-state-io-"));
  stateFile = path.join(tmpDir, "state.json");
});

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe("createStateIO", () => {
  it("returns independent instances per call (separate lock chains)", () => {
    const a = createStateIO({ stateFile });
    const b = createStateIO({ stateFile });
    expect(a).not.toBe(b);
    expect(a.readState).not.toBe(b.readState);
  });
});

describe("readState / writeState", () => {
  it("round-trips a state through the file system", async () => {
    const io = createStateIO({ stateFile });
    writeFileSync(stateFile, JSON.stringify(minimalState({ currentStep: "go" })));
    const state = await io.readState();
    expect(state.currentStep).toBe("go");
  });

  it("writes atomically (no .tmp file remains after rename)", async () => {
    const io = createStateIO({ stateFile });
    writeFileSync(stateFile, JSON.stringify(minimalState()));
    await io.writeState(minimalState({ currentStep: "atomic" }));
    expect(existsSync(stateFile)).toBe(true);
    expect(existsSync(`${stateFile}.tmp`)).toBe(false);
    const persisted = JSON.parse(readFileSync(stateFile, "utf8"));
    expect(persisted.currentStep).toBe("atomic");
  });

  it("refreshes updatedAt on each writeState call", async () => {
    const io = createStateIO({ stateFile });
    writeFileSync(stateFile, JSON.stringify(minimalState()));
    const first = await io.writeState(minimalState({ currentStep: "first" }));
    await new Promise((r) => setTimeout(r, 5));
    const second = await io.writeState(minimalState({ currentStep: "second" }));
    expect(new Date(second.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.updatedAt).getTime()
    );
  });

  it("repairs missing array fields on read (queue, messages, activityLog)", async () => {
    const io = createStateIO({ stateFile });
    writeFileSync(stateFile, JSON.stringify({ status: "idle" }));
    const state = await io.readState();
    expect(state.queue).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.activityLog).toEqual([]);
  });
});

describe("updateState (mutator + lock chain)", () => {
  it("clones state before passing to the mutator (no mutation of disk on throw)", async () => {
    const io = createStateIO({ stateFile });
    writeFileSync(stateFile, JSON.stringify(minimalState({ currentStep: "before" })));
    await expect(
      io.updateState((draft) => {
        // mutate the clone but throw — disk should stay "before"
        draft.currentStep = "boom";
        throw new Error("nope");
      })
    ).rejects.toThrow("nope");
    const persisted = JSON.parse(readFileSync(stateFile, "utf8"));
    expect(persisted.currentStep).toBe("before");
  });

  it("serializes concurrent updateState calls (no torn writes)", async () => {
    const io = createStateIO({ stateFile });
    writeFileSync(stateFile, JSON.stringify(minimalState({ activityLog: [] })));
    const tasks = Array.from({ length: 20 }, (_, i) =>
      io.updateState((state) => ({
        ...state,
        activityLog: [...state.activityLog, `line-${i}`]
      }))
    );
    await Promise.all(tasks);
    const final = await io.readState();
    expect(final.activityLog.length).toBe(20);
    expect(new Set(final.activityLog).size).toBe(20);
  });

  it("returns the final written state from the mutator", async () => {
    const io = createStateIO({ stateFile });
    writeFileSync(stateFile, JSON.stringify(minimalState()));
    const result = await io.updateState((state) => ({ ...state, currentStep: "done" }));
    expect(result.currentStep).toBe("done");
  });

  it("supports an async mutator", async () => {
    const io = createStateIO({ stateFile });
    writeFileSync(stateFile, JSON.stringify(minimalState()));
    const result = await io.updateState(async (state) => {
      await new Promise((r) => setTimeout(r, 5));
      return { ...state, currentStep: "async-done" };
    });
    expect(result.currentStep).toBe("async-done");
  });

});
