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

import { strings as arStrings } from "./strings/ar";
import { strings as deStrings } from "./strings/de";
import { strings as enStrings } from "./strings/en";
import { strings as esStrings } from "./strings/es";
import { strings as faStrings } from "./strings/fa";
import { strings as frStrings } from "./strings/fr";
import { strings as heStrings } from "./strings/he";
import { strings as hiStrings } from "./strings/hi";
import { strings as idStrings } from "./strings/id";
import { strings as itStrings } from "./strings/it";
import { strings as jaStrings } from "./strings/ja";
import { strings as koStrings } from "./strings/ko";
import { strings as nlStrings } from "./strings/nl";
import { strings as plStrings } from "./strings/pl";
import { strings as ptBrStrings } from "./strings/pt-br";
import { strings as ruStrings } from "./strings/ru";
import { strings as svStrings } from "./strings/sv";
import { strings as thStrings } from "./strings/th";
import { strings as trStrings } from "./strings/tr";
import { strings as urStrings } from "./strings/ur";
import { strings as viStrings } from "./strings/vi";
import { strings as zhCnStrings } from "./strings/zh-cn";

/**
 * v0.35.1 — match the overlay's 22-locale set exactly. Adding a
 * locale = create `strings/<code>.ts` (start by copying en.ts +
 * translating in place; missing keys silently fall back to
 * English) + add the import + push the code into TABLES + SUPPORTED.
 */
export type CliLocale =
  | "en" | "ko" | "ja" | "zh-cn" | "fr" | "es" | "de"
  | "pt-br" | "ru" | "it" | "nl" | "sv" | "pl"
  | "tr" | "hi" | "id" | "vi" | "th"
  | "ar" | "he" | "fa" | "ur";

const TABLES: Record<CliLocale, Record<string, string>> = {
  en: enStrings,
  ko: koStrings,
  ja: jaStrings,
  "zh-cn": zhCnStrings,
  fr: frStrings,
  es: esStrings,
  de: deStrings,
  "pt-br": ptBrStrings,
  ru: ruStrings,
  it: itStrings,
  nl: nlStrings,
  sv: svStrings,
  pl: plStrings,
  tr: trStrings,
  hi: hiStrings,
  id: idStrings,
  vi: viStrings,
  th: thStrings,
  ar: arStrings,
  he: heStrings,
  fa: faStrings,
  ur: urStrings
};

const SUPPORTED: CliLocale[] = [
  "en", "ko", "ja", "zh-cn", "fr", "es", "de",
  "pt-br", "ru", "it", "nl", "sv", "pl",
  "tr", "hi", "id", "vi", "th",
  "ar", "he", "fa", "ur"
];

/**
 * Resolve the active locale once at startup and cache the result.
 * Call `setLocale()` from a subcommand if `--lang` was passed
 * (the CLI dispatcher reads it before running the subcommand).
 */
let activeLocale: CliLocale = resolveLocaleFromEnv();

function resolveLocaleFromEnv(): CliLocale {
  const fromExplicit = (process.env.PYANCHOR_LOCALE ?? "").trim().toLowerCase();
  if (fromExplicit && isSupported(fromExplicit)) return fromExplicit;
  // POSIX LANG / LC_*: try `lang-region` first (so zh_CN.UTF-8 →
  // zh-cn, pt_BR → pt-br), then fall back to the language-only
  // form (so ko_KR → ko).
  for (const envName of ["LC_ALL", "LC_MESSAGES", "LANG"]) {
    const raw = process.env[envName];
    if (!raw) continue;
    const lower = raw.trim().toLowerCase();
    const langRegion = lower.split(/[._@]/)[0]; // "ko_kr" / "ko" / "zh_cn"
    if (!langRegion) continue;
    const dashed = langRegion.replace("_", "-"); // "ko-kr" / "zh-cn"
    if (isSupported(dashed)) return dashed;
    const base = dashed.split("-")[0]; // "ko" / "zh"
    if (isSupported(base)) return base;
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
