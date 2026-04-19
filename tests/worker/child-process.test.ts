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
