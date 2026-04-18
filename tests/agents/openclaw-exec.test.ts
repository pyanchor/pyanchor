import { describe, expect, it } from "vitest";

import { execBuffered, streamSpawn } from "../../src/agents/openclaw/exec";

describe("streamSpawn", () => {
  it("yields stdout chunks then a close event with code 0", async () => {
    const events: Array<{ kind: string; code?: number; text?: string }> = [];
    for await (const event of streamSpawn("/bin/sh", ["-c", "echo hello"])) {
      events.push(event);
    }
    const close = events[events.length - 1];
    expect(close.kind).toBe("close");
    expect(close.code).toBe(0);
    const stdoutText = events
      .filter((e) => e.kind === "stdout")
      .map((e) => e.text)
      .join("");
    expect(stdoutText.trim()).toBe("hello");
  });

  it("yields stderr chunks separately from stdout", async () => {
    const events: Array<{ kind: string; text?: string }> = [];
    for await (const event of streamSpawn("/bin/sh", ["-c", "echo out; echo err >&2"])) {
      events.push(event);
    }
    const stderrText = events
      .filter((e) => e.kind === "stderr")
      .map((e) => e.text)
      .join("");
    expect(stderrText.trim()).toBe("err");
  });

  it("surfaces a non-zero exit code in the close event", async () => {
    const events: Array<{ kind: string; code?: number }> = [];
    for await (const event of streamSpawn("/bin/sh", ["-c", "exit 42"])) {
      events.push(event);
    }
    const close = events[events.length - 1];
    expect(close.kind).toBe("close");
    expect(close.code).toBe(42);
  });

  it("emits a synthetic close event when spawn fails (ENOENT)", async () => {
    const events: Array<{ kind: string }> = [];
    for await (const event of streamSpawn("/no/such/binary", [])) {
      events.push(event);
    }
    expect(events[events.length - 1].kind).toBe("close");
  });

  it("forwards stdin input to the child", async () => {
    let stdoutText = "";
    for await (const event of streamSpawn("/bin/cat", [], { input: "piped through cat\n" })) {
      if (event.kind === "stdout") stdoutText += event.text;
    }
    expect(stdoutText).toContain("piped through cat");
  });

  it("aborts the child when the AbortSignal fires", async () => {
    const controller = new AbortController();
    const events: Array<{ kind: string; code?: number; signal?: NodeJS.Signals | null }> = [];
    setTimeout(() => controller.abort(), 50);
    // Spawn sleep directly (not via sh -c) so SIGTERM reaches the
    // process holding the stdio pipes; otherwise dash forks sleep as
    // a grandchild and the pipes stay open until SIGKILL fallback.
    for await (const event of streamSpawn("/bin/sleep", ["30"], {
      signal: controller.signal
    })) {
      events.push(event);
    }
    const close = events[events.length - 1];
    expect(close.kind).toBe("close");
    expect(close.signal === "SIGTERM" || close.code !== 0).toBe(true);
  });

  it("kills the child when the timeout elapses", async () => {
    const events: Array<{ kind: string; code?: number; signal?: NodeJS.Signals | null }> = [];
    for await (const event of streamSpawn("/bin/sleep", ["30"], { timeoutMs: 50 })) {
      events.push(event);
    }
    const close = events[events.length - 1];
    expect(close.kind).toBe("close");
    expect(close.signal === "SIGTERM" || close.code !== 0).toBe(true);
  });

  it("respects custom env vars", async () => {
    let stdoutText = "";
    for await (const event of streamSpawn("/bin/sh", ["-c", 'echo "$PYANCHOR_TEST_FLAG"'], {
      env: { PYANCHOR_TEST_FLAG: "yes" }
    })) {
      if (event.kind === "stdout") stdoutText += event.text;
    }
    expect(stdoutText.trim()).toBe("yes");
  });
});

describe("execBuffered", () => {
  it("returns stdout, stderr, and code 0 for a successful command", async () => {
    const result = await execBuffered("/bin/sh", ["-c", "echo out; echo err >&2"]);
    expect(result.stdout.trim()).toBe("out");
    expect(result.stderr.trim()).toBe("err");
    expect(result.code).toBe(0);
  });

  it("throws with the stderr text when the command exits non-zero", async () => {
    await expect(execBuffered("/bin/sh", ["-c", "echo nope >&2; exit 1"])).rejects.toThrow(
      /nope/
    );
  });

  it("falls back to stdout when stderr is empty on a non-zero exit", async () => {
    await expect(execBuffered("/bin/sh", ["-c", "echo only-out; exit 7"])).rejects.toThrow(
      /only-out/
    );
  });

  it("falls back to a generic message when both stdout and stderr are empty", async () => {
    await expect(execBuffered("/bin/sh", ["-c", "exit 9"])).rejects.toThrow(/exited with 9/);
  });

  it("forwards input to the child and returns its echoed stdout", async () => {
    const result = await execBuffered("/bin/cat", [], { input: "round-trip" });
    expect(result.stdout).toBe("round-trip");
  });
});
