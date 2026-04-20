/**
 * `pyanchor logs` — human-friendly tail of the audit log
 * (v0.30.0+). Sister to `init` + `doctor`.
 *
 * The audit log (`audit.jsonl`) is a great machine-readable source
 * (one event per line, documented `AuditEvent` schema) but `cat
 * audit.jsonl | jq .` is the wrong UI for "what happened in the
 * last hour on this server". This command:
 *   - Reads PYANCHOR_AUDIT_LOG_FILE (or auto-detects via
 *     pyanchorConfig.auditLogFile).
 *   - Renders the last N events (default 20) as a compact table.
 *   - Optional --follow for tail -f behavior.
 *   - Optional --since <ISO> / --until <ISO> for time filtering.
 *   - Optional --json for raw lines (so the human path doesn't
 *     fight scripts that need JSON — they just keep using
 *     `tail -f audit.jsonl`).
 *   - Optional --outcome success|failed|canceled filter.
 *
 * Stays read-only: never writes the file, never holds a long lock.
 * Safe to run while the sidecar is appending.
 */

import { existsSync, readFileSync, statSync, watchFile, unwatchFile } from "node:fs";

import { pyanchorConfig } from "../config";
import type { AuditEvent } from "../audit";

interface LogsArgs {
  file: string;
  tail: number;
  follow: boolean;
  since?: Date;
  until?: Date;
  outcome?: AuditEvent["outcome"];
  actorFilter?: string;
  modeFilter?: AuditEvent["output_mode"];
  json: boolean;
  printHelp: boolean;
}

function parseArgs(argv: string[]): LogsArgs {
  const out: LogsArgs = {
    file: pyanchorConfig.auditLogFile,
    tail: 20,
    follow: false,
    json: false,
    printHelp: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.printHelp = true;
    else if (arg === "--follow" || arg === "-f") out.follow = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--tail" || arg === "-n") {
      const v = argv[++i];
      if (!v) throw new Error("--tail requires a number");
      const parsed = Number.parseInt(v, 10);
      if (!Number.isFinite(parsed) || parsed < 0)
        throw new Error(`--tail must be a non-negative integer (got "${v}")`);
      out.tail = parsed;
    } else if (arg === "--file") {
      const v = argv[++i];
      if (!v) throw new Error("--file requires a path");
      out.file = v;
    } else if (arg === "--since") {
      const v = argv[++i];
      if (!v) throw new Error("--since requires an ISO timestamp");
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new Error(`--since: not a valid ISO date: ${v}`);
      out.since = d;
    } else if (arg === "--until") {
      const v = argv[++i];
      if (!v) throw new Error("--until requires an ISO timestamp");
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new Error(`--until: not a valid ISO date: ${v}`);
      out.until = d;
    } else if (arg === "--outcome") {
      const v = argv[++i];
      if (v !== "success" && v !== "failed" && v !== "canceled")
        throw new Error(`--outcome must be one of success|failed|canceled (got "${v}")`);
      out.outcome = v;
    } else if (arg === "--actor") {
      const v = argv[++i];
      if (!v) throw new Error("--actor requires a substring");
      out.actorFilter = v;
    } else if (arg === "--mode") {
      const v = argv[++i];
      if (v !== "apply" && v !== "pr" && v !== "dryrun")
        throw new Error(`--mode must be one of apply|pr|dryrun (got "${v}")`);
      out.modeFilter = v;
    } else {
      throw new Error(`Unknown argument: ${arg}. Try --help.`);
    }
  }
  return out;
}

function logsHelp(): string {
  return `Usage: pyanchor logs [options]

Read the audit log (audit.jsonl) and render recent events. Read-only.

Options:
  --file <path>      Audit log path (default: PYANCHOR_AUDIT_LOG_FILE
                     env or <stateDir>/audit.jsonl).
  -n, --tail <N>     Show the last N events (default: 20). Use 0
                     with --follow to stream new events only.
  -f, --follow       Stream new events as they're appended (Ctrl-C to exit).
  --since <ISO>      Only show events at or after this timestamp
                     (e.g. 2026-04-20T00:00:00Z, or just 2026-04-20).
  --until <ISO>      Only show events before this timestamp.
  --outcome <kind>   Filter by outcome: success | failed | canceled.
  --actor <substr>   Substring match against actor field.
  --mode <kind>      Filter by output mode: apply | pr | dryrun.
  --json             Emit raw JSON lines instead of the table.
  -h, --help         This message.

Examples:
  pyanchor logs                              # last 20 events
  pyanchor logs -n 100 --outcome failed       # last 100 failures
  pyanchor logs -f                            # tail -f
  pyanchor logs --since 2026-04-20 --json     # JSON, today only
`;
}

/** Parse JSONL — skip blank/malformed lines, return AuditEvent array. */
function parseJsonl(content: string): AuditEvent[] {
  const out: AuditEvent[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as AuditEvent);
    } catch {
      // Tolerate the rare half-written line at end-of-file
      // (sidecar appends + flushes per event, but a crash mid-write
      // could leave a partial). Skipping is safer than throwing.
    }
  }
  return out;
}

function applyFilters(events: AuditEvent[], a: LogsArgs): AuditEvent[] {
  return events.filter((e) => {
    if (a.since && new Date(e.ts) < a.since) return false;
    if (a.until && new Date(e.ts) >= a.until) return false;
    if (a.outcome && e.outcome !== a.outcome) return false;
    if (a.modeFilter && e.output_mode !== a.modeFilter) return false;
    if (a.actorFilter && (!e.actor || !e.actor.includes(a.actorFilter))) return false;
    return true;
  });
}

const NO_COLOR = !!process.env.NO_COLOR || !process.stdout.isTTY;
const colorize = (color: "green" | "red" | "yellow" | "dim" | "cyan", text: string): string => {
  if (NO_COLOR) return text;
  const code =
    color === "green"
      ? 32
      : color === "red"
        ? 31
        : color === "yellow"
          ? 33
          : color === "cyan"
            ? 36
            : 90;
  return `\x1b[${code}m${text}\x1b[0m`;
};

function outcomeColor(outcome: AuditEvent["outcome"]): "green" | "red" | "yellow" {
  return outcome === "success" ? "green" : outcome === "failed" ? "red" : "yellow";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function renderEvent(e: AuditEvent): string {
  const ts = e.ts.replace("T", " ").replace(/\.\d+Z$/, "Z");
  const outcome = colorize(outcomeColor(e.outcome), e.outcome.padEnd(8));
  const mode = colorize("cyan", `${e.mode}/${e.output_mode}`.padEnd(14));
  const dur = formatDuration(e.duration_ms).padStart(7);
  const actor = (e.actor ?? "-").padEnd(24).slice(0, 24);
  const target = (e.target_path ?? "-").padEnd(20).slice(0, 20);
  const extra = e.pr_url
    ? colorize("dim", `pr=${e.pr_url}`)
    : e.error
      ? colorize("dim", `err=${e.error.slice(0, 60)}`)
      : "";
  return `${ts}  ${outcome}  ${mode}  ${dur}  ${actor}  ${target}  ${extra}`;
}

function renderHeader(): string {
  return colorize(
    "dim",
    `${"timestamp".padEnd(24)}  ${"outcome".padEnd(8)}  ${"mode/output".padEnd(14)}  ${"dur".padStart(7)}  ${"actor".padEnd(24)}  ${"target".padEnd(20)}  extra`
  );
}

export function runLogs(argv: string[] = []): number {
  let args: LogsArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`pyanchor logs: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  if (args.printHelp) {
    process.stdout.write(logsHelp());
    return 0;
  }

  if (!existsSync(args.file)) {
    console.error(`pyanchor logs: audit log not found at ${args.file}`);
    console.error(
      `  Set PYANCHOR_AUDIT_LOG=true on the sidecar (and optionally`
    );
    console.error(
      `  PYANCHOR_AUDIT_LOG_FILE=...) before any edits would land here.`
    );
    return 1;
  }

  const initialContent = readFileSync(args.file, "utf8");
  const allEvents = parseJsonl(initialContent);
  const filtered = applyFilters(allEvents, args);
  const sliced = args.tail > 0 ? filtered.slice(-args.tail) : [];

  if (args.json) {
    for (const e of sliced) process.stdout.write(JSON.stringify(e) + "\n");
  } else {
    if (sliced.length === 0 && !args.follow) {
      console.log(colorize("dim", `(no matching events in ${args.file})`));
    } else if (sliced.length > 0) {
      console.log(renderHeader());
      for (const e of sliced) console.log(renderEvent(e));
    }
  }

  if (!args.follow) return 0;

  // tail -f mode: poll the file for size changes (cheap + works on
  // every fs that supports stat). watchFile returns prev/curr stat
  // on change; we read only the appended bytes, parse, filter,
  // render. The 250ms interval is the tail -f default vibe.
  //
  // v0.31.1 — round 19 P2: detect log rotation in two ways and
  // resync the read offset so we don't drop / duplicate lines:
  //   1. inode change (dev/ino differ) — `mv` + new file or
  //      `rm` + recreate (logrotate's create mode)
  //   2. file shrunk (curr.size < lastSize) — copy-truncate mode
  // Both reset the read offset to 0 so the next poll reads from
  // the start of the new content. Pre-v0.31.1 jumped lastSize
  // to curr.size on shrink, which dropped any content already in
  // the new file at the time of detection.
  let lastStat = statSync(args.file);
  let lastSize = lastStat.size;
  console.log(colorize("dim", `(following ${args.file} — Ctrl-C to exit)`));
  watchFile(args.file, { interval: 250 }, (curr, _prev) => {
    const rotated = curr.dev !== lastStat.dev || curr.ino !== lastStat.ino;
    const truncated = curr.size < lastSize;
    const startFrom = rotated || truncated ? 0 : lastSize;

    if (curr.size === startFrom) {
      // No new bytes (or rotation to an identically-sized empty file).
      lastStat = curr;
      lastSize = curr.size;
      return;
    }

    try {
      const buf = Buffer.alloc(curr.size - startFrom);
      const fd = require("node:fs").openSync(args.file, "r");
      try {
        require("node:fs").readSync(fd, buf, 0, buf.length, startFrom);
      } finally {
        require("node:fs").closeSync(fd);
      }
      lastStat = curr;
      lastSize = curr.size;
      const newEvents = applyFilters(parseJsonl(buf.toString("utf8")), args);
      for (const e of newEvents) {
        if (args.json) process.stdout.write(JSON.stringify(e) + "\n");
        else console.log(renderEvent(e));
      }
    } catch (err) {
      console.error(
        colorize("red", `[pyanchor logs] follow error: ${err instanceof Error ? err.message : String(err)}`)
      );
    }
  });

  // Cleanup on signals.
  const cleanup = () => {
    unwatchFile(args.file);
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Block forever while watching.
  return new Promise<number>(() => {}) as unknown as number;
}
