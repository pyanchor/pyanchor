/**
 * Pyanchor CLI dispatcher.
 *
 * Entry point for the `pyanchor` bin (since v0.28.0). Routes
 * subcommands and falls through to the legacy server bootstrap when
 * no subcommand is given. Pre-v0.28 the bin pointed straight at
 * dist/server.cjs; that file still exists and still works for
 * legacy callers (e.g. systemd units that hardcode the path), so
 * this dispatcher is purely additive.
 *
 * Subcommands (intentionally tiny — pyanchor is a daemon, not a
 * Swiss-army CLI):
 *
 *   pyanchor                  — start the sidecar (legacy default)
 *   pyanchor init [--yes]     — interactive scaffolder
 *   pyanchor --version        — print package version + exit
 *   pyanchor --help           — short help + link to docs
 *
 * Anything else is passed through to the server entry, so unknown
 * arguments don't break (the server itself logs and exits if the
 * env is misconfigured).
 */

import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import { loadCwdDotenv } from "./load-env.js";
import { setLocale } from "./i18n.js";

// CJS bundle output — esbuild keeps __dirname / __filename as
// native CJS globals. We declare them here so TypeScript is happy
// while the runtime actually sees Node's CJS injection.
declare const __dirname: string;
declare const __filename: string;

const here = __dirname;

// v0.32.2 — auto-load cwd `.env.local` / `.env` before any subcommand
// runs. Vite / Next.js / Astro all do this; not doing it broke the
// onboarding flow because reviewers ran `pyanchor init` (which writes
// .env) and then `pyanchor doctor` and got "every required var unset"
// — they assumed init was broken. Existing process.env always wins,
// so systemd EnvironmentFile= and shell exports still take precedence.
//
// Skipped for `init` (init *creates* .env — it doesn't read one) and
// for `--version` / `--help` (no env touched). For all other paths we
// load early so doctor / sidecar / agent test / logs all see the file.
const sub = process.argv[2];
if (sub !== "init" && sub !== "--version" && sub !== "-v" && sub !== "--help" && sub !== "-h") {
  loadCwdDotenv();
}

// v0.35.0 — `--lang <code>` global flag overrides PYANCHOR_LOCALE
// / LANG. Parsed before the subcommand dispatcher so doctor /
// init / logs / agent test all see the resolved locale via
// `t()` from i18n.ts. The flag is consumed (filtered out of
// argv) so subcommand parsers don't have to know about it.
const langIdx = process.argv.findIndex((a) => a === "--lang");
if (langIdx !== -1 && process.argv[langIdx + 1]) {
  setLocale(process.argv[langIdx + 1]);
  process.argv.splice(langIdx, 2);
}

async function main(): Promise<number> {
  // (sub already captured at module top so loadCwdDotenv could
  // gate on it; re-using the same value here.)
  if (sub === "--version" || sub === "-v") {
    // Read version from sibling package.json. esbuild bundles cli.cjs
    // into dist/, so package.json is two dirs up.
    const req = createRequire(__filename);
    try {
      const pkg = req("../package.json") as { version?: string };
      console.log(pkg.version ?? "unknown");
      return 0;
    } catch {
      console.log("unknown");
      return 0;
    }
  }

  if (sub === "--help" || sub === "-h") {
    process.stdout.write(
      `pyanchor — agent-agnostic AI live-edit sidecar for your web app\n` +
        `\n` +
        `Usage:\n` +
        `  pyanchor                  Start the sidecar (reads PYANCHOR_* env vars).\n` +
        `  pyanchor init [--yes]     Interactive scaffolder (run from your app root).\n` +
        `  pyanchor doctor [--json]  Diagnose the local config (env / fs / agent / output mode).\n` +
        `  pyanchor logs [-f]        Tail the audit log (last N events; --follow streams).\n` +
        `  pyanchor agent test       Fire a one-shot prompt at the configured agent.\n` +
        `  pyanchor --version        Print version.\n` +
        `  pyanchor --help           This message.\n` +
        `\n` +
        `Docs: https://github.com/pyanchor/pyanchor#readme\n` +
        `Examples: https://github.com/pyanchor/pyanchor/tree/main/examples\n`
    );
    return 0;
  }

  if (sub === "init") {
    const { runInit } = await import("./init.js");
    return runInit(process.argv.slice(3));
  }

  if (sub === "doctor") {
    const { runDoctor } = await import("./doctor.js");
    const report = runDoctor(process.argv.slice(3));
    return report.exitCode;
  }

  if (sub === "logs") {
    const { runLogs } = await import("./logs.js");
    return runLogs(process.argv.slice(3));
  }

  // `pyanchor agent test ...` — namespaced command. Currently only
  // `agent test` is implemented; `agent` alone prints usage.
  if (sub === "agent") {
    const subSub = process.argv[3];
    if (subSub === "test") {
      const { runAgentTest } = await import("./agent-test.js");
      return runAgentTest(process.argv.slice(4));
    }
    process.stdout.write(
      `pyanchor agent — agent diagnostics\n` +
        `\n` +
        `Usage:\n` +
        `  pyanchor agent test [agent] [prompt]   One-shot adapter ping.\n` +
        `\n` +
        `Run \`pyanchor agent test --help\` for full options.\n`
    );
    return subSub ? 1 : 0;
  }

  // Default: launch the sidecar. Spawn dist/server.cjs as a child so
  // (a) we don't double-bundle the server into cli.cjs and (b) signal
  // forwarding + stdio inheritance Just Work.
  const serverPath = path.join(here, "server.cjs");
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [serverPath, ...process.argv.slice(2)], {
      stdio: "inherit",
      env: process.env
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        // Re-raise the signal so callers see the same exit semantics
        // as if they'd run server.cjs directly.
        process.kill(process.pid, signal);
        resolve(0);
      } else {
        resolve(code ?? 0);
      }
    });
    child.on("error", (err) => {
      console.error(`pyanchor: failed to spawn sidecar: ${err.message}`);
      resolve(1);
    });
  });
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
