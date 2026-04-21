// v0.32.1 regression — dist/cli.cjs must be a real executable when
// shipped via the npm bin shim. Pre-v0.32.1 builds had no shebang
// and were 0644, which made `npx pyanchor` / direct `pyanchor`
// invocation crash with shell errors like:
//
//   /node_modules/.bin/pyanchor: 1: use strict: not found
//   /node_modules/.bin/pyanchor: 8: Syntax error: "(" unexpected
//
// systemd users never noticed because their unit invokes
// `node dist/server.cjs` directly. But every npm-install user
// hit it on the first `pyanchor --help`.
//
// build.mjs now adds `banner: { js: "#!/usr/bin/env node" }` and
// `chmod 0o755` after the esbuild call. This test fails fast if
// either is dropped in a future refactor.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const distCli = resolve(__dirname, "../../dist/cli.cjs");

describe("dist/cli.cjs — npm-install executability", () => {
  it("starts with a node shebang line", () => {
    const head = readFileSync(distCli, "utf8").slice(0, 64);
    expect(head.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("is mode 0o755 (owner+group+other executable)", () => {
    const mode = statSync(distCli).mode & 0o777;
    // 0o755 = rwxr-xr-x. Anything that drops the executable bit
    // (e.g. 0o644) means npm bin shim breaks on direct invocation.
    expect(mode & 0o111).not.toBe(0);
  });

  it("can be invoked directly (no `node` prefix) and prints help", () => {
    // Pre-v0.32.1 this would throw because the shell tried to
    // interpret the JS as a shell script.
    const result = spawnSync(distCli, ["--help"], {
      encoding: "utf8",
      timeout: 5000
    });
    expect(result.status).toBe(0);
    // CLI dispatcher prints a usage banner that mentions at least
    // one of the documented subcommands. We don't assert on exact
    // wording so future copy edits don't break the test.
    const out = `${result.stdout}\n${result.stderr}`;
    expect(out).toMatch(/init|doctor|logs|agent/i);
  });

  it("is also invokable via `node dist/cli.cjs` (the systemd path)", () => {
    // Sanity — shebang shouldn't break the explicit-node path
    // either (systemd ExecStart=/usr/bin/node ... won't break
    // because node strips a leading `#!` line on parse).
    const out = execFileSync(process.execPath, [distCli, "--help"], {
      encoding: "utf8",
      timeout: 5000
    });
    expect(out).toMatch(/init|doctor|logs|agent/i);
  });
});
