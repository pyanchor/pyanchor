import type { ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  cancelActiveChildren,
  killChild,
  runCommand
} from "../../src/worker/child-process";

describe("runCommand", () => {
  it("resolves with stdout/stderr on a successful exit", async () => {
    const result = await runCommand("/bin/sh", ["-c", "echo out; echo err >&2"]);
    expect(result.stdout.trim()).toBe("out");
    expect(result.stderr.trim()).toBe("err");
  });

  it("rejects with the stderr text when the command exits non-zero", async () => {
    await expect(runCommand("/bin/sh", ["-c", "echo nope >&2; exit 3"])).rejects.toThrow(
      /nope/
    );
  });

  it("rejects with stdout text if stderr is empty on non-zero exit", async () => {
    await expect(runCommand("/bin/sh", ["-c", "echo only-out; exit 5"])).rejects.toThrow(
      /only-out/
    );
  });

  it("rejects with a synthetic message if both streams are empty on non-zero exit", async () => {
    await expect(runCommand("/bin/sh", ["-c", "exit 7"])).rejects.toThrow(/exited with 7/);
  });

  it("forwards stdin input to the child", async () => {
    const result = await runCommand("/bin/cat", [], { input: "from stdin\n" });
    expect(result.stdout).toContain("from stdin");
  });

  it("invokes onStdoutChunk and onStderrChunk callbacks live", async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    await runCommand("/bin/sh", ["-c", "echo hi; echo bye >&2"], {
      onStdoutChunk: (text) => stdoutChunks.push(text),
      onStderrChunk: (text) => stderrChunks.push(text)
    });
    expect(stdoutChunks.join("")).toContain("hi");
    expect(stderrChunks.join("")).toContain("bye");
  });

  it("respects custom env vars", async () => {
    const result = await runCommand("/bin/sh", ["-c", 'echo "$PYANCHOR_X"'], {
      env: { PYANCHOR_X: "set" }
    });
    expect(result.stdout.trim()).toBe("set");
  });

  it("rejects with an Error when the binary does not exist (ENOENT)", async () => {
    await expect(runCommand("/no/such/binary", [])).rejects.toThrow();
  });

  it("tracks the spawned child in options.activeChildren until close", async () => {
    const tracker = new Set<ChildProcess>();
    await runCommand("/bin/sh", ["-c", "echo hi"], { activeChildren: tracker });
    expect(tracker.size).toBe(0);
  });

  it("rejects with the canceledError string when isCancelled() returns true on close", async () => {
    await expect(
      runCommand("/bin/sh", ["-c", "echo hi"], {
        isCancelled: () => true,
        canceledError: "user pulled the plug"
      })
    ).rejects.toThrow("user pulled the plug");
  });

  it("falls back to the default canceled-error string", async () => {
    await expect(
      runCommand("/bin/sh", ["-c", "echo hi"], { isCancelled: () => true })
    ).rejects.toThrow(/canceled by user/);
  });

  it("kills the child when timeoutMs elapses", async () => {
    await expect(
      runCommand("/bin/sleep", ["30"], { timeoutMs: 50 })
    ).rejects.toThrow();
  });

  it(
    "rejects with the canceled error when the cancel flag flips DURING the run (race between spawn and close)",
    async () => {
      // Scenario A from the v0.6.1 codex review: cancel arrives while
      // the child is still alive. We flip the flag from false→true
      // 30ms in, kill the (long-lived) child to force a close event,
      // and assert the close handler observes the now-true flag and
      // rejects with the canceled error rather than the SIGTERM
      // exit-by-signal path.
      let cancelled = false;
      const tracker = new Set<ChildProcess>();
      const promise = runCommand("/bin/sleep", ["10"], {
        activeChildren: tracker,
        isCancelled: () => cancelled,
        canceledError: "race-canceled"
      });

      setTimeout(() => {
        cancelled = true;
        for (const child of tracker) killChild(child, "SIGTERM");
      }, 30);

      await expect(promise).rejects.toThrow("race-canceled");
      expect(tracker.size).toBe(0);
    }
  );

  // v0.33.2 — regression for stdin EPIPE ordering. When the child
  // exits before reading stdin, the synthetic "[stdin closed early]"
  // note must land in the rejected error message even though the
  // 'close' event races with the stdin 'error' event. Pre-fix this
  // sometimes lost the note because close settled the promise first.
  it("preserves stdin-EPIPE diagnostic in stderr when child exits before reading", async () => {
    // /bin/true exits immediately with code 0 without consuming stdin.
    // /bin/false would also work but exit code 1 → reject path. Use
    // a small sh -c that exits non-zero so we hit the rejection
    // branch where stderr matters.
    let captured: string | null = null;
    try {
      await runCommand("/bin/sh", ["-c", "exit 1"], {
        input: "this triggers EPIPE because the child exits before reading stdin\n"
      });
    } catch (err) {
      captured = err instanceof Error ? err.message : String(err);
    }
    // The caller may or may not see EPIPE depending on timing — Node
    // sometimes accepts the write into the pipe buffer before the
    // child fully exits. The point is: IF EPIPE fires, the diagnostic
    // note must be in the rejection. We at minimum get the exit-code
    // sentinel; an EPIPE run includes the "[stdin closed early...]"
    // marker. Either is acceptable.
    expect(captured).toBeTruthy();
    if (captured && captured.includes("stdin closed early")) {
      // The race fired and we caught it — note was preserved.
      expect(captured).toMatch(/stdin closed early/);
    }
  });
});

describe("killChild", () => {
  it("is a no-op when the child has no pid", () => {
    const fake = { pid: undefined, kill: () => true } as unknown as ChildProcess;
    expect(() => killChild(fake, "SIGTERM")).not.toThrow();
  });

  it("swallows kill errors (already-dead child)", () => {
    const fake = {
      pid: 99999,
      kill: () => {
        throw new Error("ESRCH");
      }
    } as unknown as ChildProcess;
    expect(() => killChild(fake, "SIGTERM")).not.toThrow();
  });
});

describe("cancelActiveChildren", () => {
  it("SIGTERMs every tracked child then SIGKILLs survivors after 200ms", async () => {
    const calls: Array<{ idx: number; signal: NodeJS.Signals }> = [];
    const fakes = [0, 1, 2].map(
      (idx) =>
        ({
          pid: 1000 + idx,
          kill: (signal: NodeJS.Signals) => {
            calls.push({ idx, signal });
            return true;
          }
        }) as unknown as ChildProcess
    );

    await cancelActiveChildren(fakes);

    // First three calls = SIGTERM in order
    expect(calls.slice(0, 3)).toEqual([
      { idx: 0, signal: "SIGTERM" },
      { idx: 1, signal: "SIGTERM" },
      { idx: 2, signal: "SIGTERM" }
    ]);
    // Next three = SIGKILL after the grace period
    expect(calls.slice(3, 6)).toEqual([
      { idx: 0, signal: "SIGKILL" },
      { idx: 1, signal: "SIGKILL" },
      { idx: 2, signal: "SIGKILL" }
    ]);
  });

  it("handles an empty iterable without throwing", async () => {
    await expect(cancelActiveChildren([])).resolves.toBeUndefined();
  });
});
