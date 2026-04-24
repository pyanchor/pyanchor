/**
 * CLI i18n (v0.35.0).
 *
 * Resolves the operator's preferred locale and exposes a single
 * `t()` accessor over the per-locale strings table. Mirrors the
 * overlay's `strings.ts` pattern but lives at the CLI layer
 * (separate target — overlay strings are bundled into the
 * browser bundle, CLI strings stay in the Node-only cli.cjs).
 *
 * Locale resolution priority (first match wins):
 *   1. `--lang <code>` CLI flag (parsed by individual subcommands
 *      and forwarded as an explicit override)
 *   2. `PYANCHOR_LOCALE` env var (e.g. `ko`, `ja`, `zh`)
 *   3. POSIX `LANG` / `LC_ALL` / `LC_MESSAGES` (parses `ko_KR.UTF-8`
 *      → `ko`, `zh_CN.UTF-8` → `zh`)
 *   4. fallback: `en`
 *
 * Unknown locales fall back to `en` silently — pyanchor would
 * rather print English than crash on a missing translation.
 *
 * Coverage policy: every key MUST exist in `en`. Other locales
 * may have partial coverage; missing keys silently fall back to
 * the English string. This keeps localisation contributors
 * unblocked — they ship what they have, English fills gaps.
 */

import { strings as enStrings } from "./strings/en";
import { strings as koStrings } from "./strings/ko";

export type CliLocale = "en" | "ko";

const TABLES: Record<CliLocale, Record<string, string>> = {
  en: enStrings,
  ko: koStrings
};

const SUPPORTED: CliLocale[] = ["en", "ko"];

/**
 * Resolve the active locale once at startup and cache the result.
 * Call `setLocale()` from a subcommand if `--lang` was passed
 * (the CLI dispatcher reads it before running the subcommand).
 */
let activeLocale: CliLocale = resolveLocaleFromEnv();

function resolveLocaleFromEnv(): CliLocale {
  const fromExplicit = (process.env.PYANCHOR_LOCALE ?? "").trim().toLowerCase();
  if (fromExplicit && isSupported(fromExplicit)) return fromExplicit;
  // POSIX LANG / LC_*: parse `ko_KR.UTF-8` → `ko`.
  for (const envName of ["LC_ALL", "LC_MESSAGES", "LANG"]) {
    const raw = process.env[envName];
    if (!raw) continue;
    const code = raw.trim().toLowerCase().split(/[._@]/)[0];
    if (code && isSupported(code)) return code;
  }
  return "en";
}

function isSupported(code: string): code is CliLocale {
  return (SUPPORTED as readonly string[]).includes(code);
}

/** Override the auto-detected locale (called from `--lang` parser). */
export function setLocale(code: string): void {
  const normalized = code.trim().toLowerCase();
  if (isSupported(normalized)) activeLocale = normalized;
}

export function getLocale(): CliLocale {
  return activeLocale;
}

/**
 * Look up a translation by key with English fallback.
 *
 * `t("doctor.title")` returns:
 *   - the active locale's value if present
 *   - else the en table's value
 *   - else the literal key (so missing-translation bugs surface
 *     as readable text instead of `undefined`)
 *
 * Optional `params` interpolates `{name}` style placeholders.
 * Use sparingly — most CLI strings don't need interpolation.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const localeTable = TABLES[activeLocale];
  const fallback = TABLES.en;
  let value = localeTable[key] ?? fallback[key] ?? key;
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, "g"), String(replacement));
    }
  }
  return value;
}

/** Used by `--lang --help` style introspection. */
export function listSupportedLocales(): CliLocale[] {
  return [...SUPPORTED];
}
