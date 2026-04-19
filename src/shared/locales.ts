/**
 * Single source of truth for the set of locales that ship as
 * built-in bundles in this Pyanchor build.
 *
 * Why this lives here (rather than in `src/runtime/bootstrap.ts` or
 * `src/server.ts`):
 *
 * Codex round-11 caught a real production bug where `bootstrap.ts`
 * auto-injected `<script src="locales/{locale}.js">` for nine
 * locales but the Express server in `server.ts` only had a hardcoded
 * route for `bootstrap.js` + `overlay.js`. That mismatch produced a
 * silent fallback to English on any host using a built-in locale.
 *
 * v0.12.1 fixed the immediate bug by adding the route. Codex round-12
 * + round-13 follow-up flagged that the underlying duplication
 * remained — every new locale required hand-keeping THREE lists
 * (`bootstrap.ts`, `server.ts`, `build.mjs`) in sync, and an
 * auxiliary fourth in tests. Dropping any one is silent.
 *
 * v0.16.0 collapses the runtime two (`bootstrap.ts` + `server.ts`)
 * into this module. `build.mjs` doesn't need a list at all anymore
 * — it globs `src/runtime/overlay/locales/*.ts` directly, so dropping
 * a new locale module on disk is enough to build it.
 *
 * Adding a new locale checklist post-v0.16.0:
 *   1. `src/runtime/overlay/locales/{code}.ts` — the bundle.
 *   2. Append `{code}` to `BUILT_IN_LOCALES` below.
 *   3. (RTL only) add the code to `RTL_LOCALES` in
 *      `src/runtime/overlay/strings.ts`.
 *   4. Tests: extend the seed in `tests/runtime/overlay/strings.test.ts`
 *      and the e2e fixture in `tests/e2e/server.mjs`. The
 *      bootstrap.test.ts ordering test + server-locale-routes.test.ts
 *      smoke both parameterize over `BUILT_IN_LOCALES`, so they
 *      auto-cover the new code.
 */

export const BUILT_IN_LOCALES = [
  // CJK + Korean (v0.9.4 / v0.10.0 / v0.11.0)
  "ko",
  "ja",
  "zh-cn",
  // Latin Romance + Germanic (v0.12.0)
  "es",
  "de",
  "fr",
  "pt-br",
  // SE-Asian + Indonesian (v0.12.0)
  "vi",
  "id",
  // Slavic + Indic + Thai (v0.13.0)
  "ru",
  "hi",
  "th",
  // Turkish + Dutch + Polish + Swedish + Italian (v0.14.0)
  "tr",
  "nl",
  "pl",
  "sv",
  "it",
  // First RTL: Arabic (v0.15.0)
  "ar",
  // RTL expansion: Hebrew + Persian/Farsi + Urdu (v0.16.0)
  "he",
  "fa",
  "ur"
] as const;

export type BuiltInLocale = (typeof BUILT_IN_LOCALES)[number];

/**
 * Set version of `BUILT_IN_LOCALES`, primarily so callers can do
 * O(1) `.has(code)` lookups without rebuilding the set per request.
 */
export const BUILT_IN_LOCALE_SET = new Set<string>(BUILT_IN_LOCALES);
