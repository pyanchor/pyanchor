/**
 * Cwd `.env` / `.env.local` auto-loader for the pyanchor CLI.
 *
 * Why this exists (v0.32.2):
 *   `pyanchor init` writes an `.env` (or `.env.local` on Next.js)
 *   into the current directory. The "next steps" message used to say
 *   `source .env; pyanchor`, but that's a *bash quirk* — `source`
 *   creates shell variables that are NOT inherited by child
 *   processes unless `export` is used or `set -a` wraps the source.
 *   Running `pyanchor doctor` after `source .env` therefore showed
 *   every required var as unset, making reviewers think init was
 *   broken when it actually wasn't.
 *
 *   Vite, Next.js, and Astro all auto-load `.env*` from the project
 *   root in dev. Pyanchor not doing the same was an inconsistency
 *   that broke the "30-second quickstart" promise on the very first
 *   command after init.
 *
 * What it does:
 *   - Looks for `.env.local` first (Next.js convention), then `.env`.
 *   - Parses `KEY=VALUE` lines, skipping comments and blanks.
 *   - Strips matching surrounding double or single quotes from
 *     values.
 *   - Tolerates `export KEY=VALUE` (the bash-friendly form).
 *   - Merges into `process.env` only for keys NOT already set —
 *     shell environment + systemd EnvironmentFile= win, so prod
 *     deployments are unaffected.
 *
 * What it deliberately does NOT do:
 *   - No interpolation (`${OTHER_VAR}`). Confusing semantics across
 *     dotenv loaders; pyanchor doesn't need it.
 *   - No multi-line values. Tokens, paths, and URLs fit on one line.
 *   - No `dotenv` npm dep. Adding a runtime dep just to skip 50 lines
 *     of parsing isn't worth the supply-chain surface area.
 *
 * Returns: list of files actually loaded (for diagnostic surfacing,
 * e.g. doctor prints "loaded from .env"). Empty array if nothing
 * applied.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const FILES_IN_PRIORITY_ORDER = [".env.local", ".env"];

/** Single-line `KEY=VALUE` parser. Returns null for blank/comment lines. */
function parseLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  // Tolerate `export KEY=VALUE` so users who manually add `export`
  // (the bash-friendly form) still get loaded.
  const stripped = trimmed.startsWith("export ") ? trimmed.slice(7).trimStart() : trimmed;
  const eq = stripped.indexOf("=");
  if (eq <= 0) return null; // no key, or starts with `=`
  const key = stripped.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = stripped.slice(eq + 1);
  // Strip an inline `# ...` comment but only if it follows whitespace
  // (so URLs with `#fragment` survive).
  const commentMatch = value.match(/\s+#.*$/);
  if (commentMatch) value = value.slice(0, value.length - commentMatch[0].length);
  value = value.trim();
  // Strip matching outer quotes.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

export function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (parsed) out[parsed.key] = parsed.value;
  }
  return out;
}

interface LoadResult {
  loaded: string[]; // absolute paths of files merged in
  setKeys: string[]; // keys actually pushed into process.env (didn't pre-exist)
}

/**
 * Auto-load cwd dotenv files into process.env.
 *
 * - Reads `.env.local` then `.env` (in that order, so .env.local wins).
 * - Existing process.env keys are NEVER overridden (shell env wins).
 *
 * Safe to call multiple times; idempotent.
 */
export function loadCwdDotenv(cwd: string = process.cwd()): LoadResult {
  const result: LoadResult = { loaded: [], setKeys: [] };
  // .env.local first so its keys take precedence over .env when both
  // exist. We achieve that by NOT overriding keys we've already set
  // from a prior file in this same call.
  const setThisCall = new Set<string>();
  for (const name of FILES_IN_PRIORITY_ORDER) {
    const full = path.join(cwd, name);
    if (!existsSync(full)) continue;
    let content: string;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const parsed = parseDotenv(content);
    let pushedAny = false;
    for (const [k, v] of Object.entries(parsed)) {
      // Shell env always wins. .env.local wins over .env (within the
      // same call) because .env.local is processed first.
      if (process.env[k] !== undefined) continue;
      if (setThisCall.has(k)) continue;
      process.env[k] = v;
      setThisCall.add(k);
      result.setKeys.push(k);
      pushedAny = true;
    }
    if (pushedAny || Object.keys(parsed).length > 0) {
      result.loaded.push(full);
    }
  }
  return result;
}
