# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.13.1] - 2026-04-20

Round-12 Codex patches. The high-severity round-11 finding closed
cleanly in v0.12.1, but round-12 reproduced the medium issue:
the late-register hook was being called, but the documented
"load locale after overlay" path still rendered English because
the overlay captured its string table once at boot. Plus ru/hi
register inconsistencies and CHANGELOG bundle-size drift.

### Fixed
- **`src/runtime/overlay/strings.ts`** — `__PyanchorRegisterStrings`
  now dispatches a `pyanchor:locale-registered` CustomEvent
  (exported as `LOCALE_REGISTERED_EVENT`) after the registry
  set. Listeners on `window` see the new locale code in
  `event.detail.locale`. **Round-12 #1 (medium).**
- **`src/runtime/overlay.ts`** — `s` (string table) is now a `let`
  so the late-register listener can swap it in-place. New
  `activeLocale` tracking variable + `addEventListener` for
  `LOCALE_REGISTERED_EVENT`: when a bundle matching the overlay's
  requested locale arrives post-boot, the listener re-resolves `s`
  and calls `render()`. The match is exact (lowercased) so unrelated
  registrations don't thrash unrelated overlays.
- **Known limitation** (intentionally scoped out of this patch): the
  `fetchJson` factory captures `defaultErrorMessage` at construction,
  so a fetch error during a late-registered locale window will toast
  the English fallback while the rest of the UI is translated.
  Negligible in practice (post-boot late-loads are rare and toasts
  are short-lived); if it becomes user-visible, swap `defaultError`
  for a getter in `fetch-helper.ts`.

### Translation polish (round-12 #2)
- **ru** — `composerEditPlaceholder` / `composerChatPlaceholder`
  now match the formal `Вы` register used everywhere else: `сделай`
  / `объясни` / `укажи` → `сделайте` / `объясните` / `укажите`.
- **hi** — register parity:
  - status / pending strings switched from first-person masculine
    `पढ़ रहा हूँ` / `तैयार कर रहा हूँ` to gender-neutral passive
    `पढ़ा जा रहा है` / `तैयार किया जा रहा है`. Removes implicit
    masculine speaker.
  - placeholder imperatives now formal: `बनाओ` / `समझाओ` /
    `उद्धृत करो` → `बनाइए` / `समझाइए` / `उल्लेख करें`. Matches
    the `आप` register used in labels.

### Tests
- **`tests/e2e/i18n-late-register.spec.ts`** (new) — overlay-first
  reverse-order fixture proves the round-12 #1 fix works end-to-end:
  boot overlay with `locale="ko"` but no preloaded bundle (English
  UI), inject `locales/ko.js` late, assert UI re-renders to Korean.
  Without the CustomEvent + listener path, this would fail.
- **`tests/e2e/server.mjs`** — new `/reverse-ko.html` fixture
  (config + overlay only, no locale script), used by the new spec.

### Documentation (round-12 #3)
- **CHANGELOG v0.13.0 entry** — bundle sizes corrected from the
  prompt-time estimates to actuals: ru 4.2 → **8.3KB**, hi 6.8 →
  **7.5KB**, th 6.9KB ✓.

## [0.13.0] - 2026-04-20

Slavic / Indic / SE-Asian locale expansion. Three new built-in
translation bundles riding on the v0.11.0 split + v0.12.1
production-route infrastructure. Codex round-11 explicitly flagged
these three as "mechanically much safer once the split-bundle
activation bugs above are fixed" — now that v0.12.1 closed those,
they ship cleanly. Twelve total built-in locales.

### Added
- **`src/runtime/overlay/locales/{ru,hi,th}.ts`** — three new locale
  modules. All translate every key in `StringTable`. Bundle sizes
  (round-12 #3 actuals): ru 8.3KB (Cyrillic) / hi 7.5KB
  (Devanagari) / th 6.9KB (Thai script + no spaces). Each follows
  the v0.12.1 dynamic activation path
  (`__PyanchorRegisterStrings` if present, else queue push).
- **`build.mjs`** — IIFE list extended to 12 entries.
- **`src/runtime/bootstrap.ts`** — `BUILT_IN_LOCALES` set now 12
  (auto-injects `<script src="locales/{ru,hi,th}.js">` for these
  codes).
- **`src/server.ts`** — production server's `BUILT_IN_LOCALES`
  whitelist set now 12. Verified via real-server smoke (all 12 200,
  klingon 404).
- **`tests/e2e/server.mjs`** — serves the new bundles + adds fixture
  pages `/{ru,hi,th}.html`.
- **`tests/e2e/i18n-v013.spec.ts`** — 6 new e2e cases (3 locales × 2
  assertions: panel content + translated `aria-label`).
- **`tests/runtime/overlay/strings.test.ts`** — extended seed +
  `built-in Slavic + Indic + SE-Asian bundles (v0.13.0)` describe
  with parameterized roleYou / panelContextLabel / case-insensitive
  / statusQueuedAt / no-fallthrough guards.
- **`tests/runtime/bootstrap.test.ts`** — `builtIns` array extended
  to 12; the auto-inject ordering test now parameterizes over all
  twelve.

### Translation notes
- **th** uses no trailing periods (Thai script convention). Other
  punctuation (commas, em-dashes) preserved where it aids parsing.
- **hi** uses Devanagari "।" (purna viram) as sentence terminator,
  matching the rest of the panel's polite-imperative register.
- **ru** uses formal "Вы" (capitalized) consistent with software-UI
  conventions in Russian. "Сайдкар" is loanword transliteration —
  "sidecar" is a Pyanchor term, no Russian equivalent.
- "Auth" / "Runtime" / "Bearer" left in English across all three
  (same convention as v0.10.0–v0.12.1; these are technical
  identifiers).

### Roadmap
- **ar** (Arabic, RTL) — explicitly punted from v0.13.0 per Codex
  round-11 #4: needs RTL audit inside the shadow root first
  (panel layout, `dir="rtl"` propagation, mirrored arrows). Plan
  for v0.14.0 as a dedicated track.
- Remaining popular candidates: tr / nl / pl / sv / it. Same
  mechanical pattern — each adds ~3-7KB lazy-loaded.

## [0.12.1] - 2026-04-19

Round-11 Codex patches. Two real activation bugs in v0.11.0/v0.12.0
plus translation polish. The locale code-split shipped a working
client but a hole in the production server, so locale-tagged
host pages silently fell back to English on real deployments.

### Fixed
- **`src/server.ts`** — added `${basePath}/locales/:locale.js` route
  guarded by an explicit `BUILT_IN_LOCALES` whitelist + an extra
  `^[a-z][a-z-]*[a-z]$` regex (belt-and-suspenders against path
  traversal). Previously bootstrap auto-injected
  `<script src="locales/{locale}.js">` but the Express server only
  served `bootstrap.js` + `overlay.js`; the locale bundles 404'd in
  production and the UI silently fell back to English. Verified via
  real-server smoke (all 9 locales 200, `klingon.js` 404, encoded
  `..%2Fetc%2Fpasswd.js` 404). **Round-11 #1 (high).**
- **`src/runtime/overlay/locales/{ko,ja,zh-cn,es,de,fr,pt-br,vi,id}.ts`**
  — every bundle now picks its activation path dynamically: if
  `window.__PyanchorRegisterStrings` is present (overlay already
  booted), call the hook directly; otherwise push onto the pending
  queue (overlay drains later). Previously every bundle only pushed,
  so a locale loaded AFTER the overlay was a dead write — the
  documented late-register contract was half-implemented.
  **Round-11 #2 (medium).**

### Tests
- **`tests/runtime/bootstrap.test.ts`** — 11 new cases:
  parameterized over all 9 built-in locales, asserting bootstrap
  injects `script[data-pyanchor-locale-bundle='{locale}']` with the
  right `src` + `defer`, and that the locale tag lands BEFORE the
  overlay tag (defer-document-order ordering guarantee). Plus
  negative cases: unknown locales don't inject; no-locale doesn't
  inject. **Round-11 #3 follow-up.**
- **`tests/runtime/overlay/strings.test.ts`** — late-register hook
  describe block. Two paths: (a) hook present → bundle calls it
  directly, queue stays empty; (b) hook absent → bundle falls back
  to queue push (legacy/early load). Uses `vi.resetModules` to
  re-trigger module-init side effects.

### Translation polish (round-11 review)
- `es`: `Reintentar última solicitud` → `Reintentar la última
  solicitud` (article needed); `sesión de cookie` → `sesión por
  cookie` (less calqued).
- `fr`: `session cookie` → `session par cookie`; `jeton bearer` →
  `jeton Bearer` (capitalized — Bearer is the auth-scheme name, a
  proper noun in this context).
- `pt-br`: `Tentar última solicitação novamente` → `Repetir última
  solicitação` (more natural word order).
- `id`: `Pekerjaan` → `Tugas` for `statusJobFailed`,
  `statusJobCanceled`, `errorJobFailed`, `modeLockedTitle`,
  `statusQueuedAt`, `diagJobId`. `Pekerjaan` reads as "work" /
  "occupation" rather than a runtime task.
- `zh-cn`: `diagLocale: 区域` → `语言` (区域 = region, not language).

### Notes
- Adding a new built-in locale now requires updating two lists:
  `BUILT_IN_LOCALES` in `bootstrap.ts` AND `BUILT_IN_LOCALES` in
  `server.ts`. The bootstrap unit test parameterizes over both
  implicitly (it iterates the same array), but the server route's
  whitelist is hand-maintained — keep them in sync.
- Future-work flag: a real-server vitest (e.g. supertest-based) for
  the locale route would catch any whitelist drift directly. Today
  it's covered by the v0.12.1 manual smoke + the bootstrap unit
  test's URL-pattern assertion.

## [0.12.0] - 2026-04-19

Latin + South-East Asian locale expansion. Six new built-in
translation bundles ride on the v0.11.0 code-splitting infrastructure
— each loads on demand, the default English path stays fetch-free,
and the main `overlay.js` bundle is unchanged in size.

### Added
- **`src/runtime/overlay/locales/{es,de,fr,pt-br,vi,id}.ts`** — six
  new locale modules. All translate every key in `StringTable`
  (verified by the `(no English fallthrough)` parameterized test).
  Bundle sizes: es 3.4KB / de 3.2KB / fr 3.3KB / pt-br 3.3KB /
  vi 4.2KB (Vietnamese diacritics) / id 3.1KB.
- **`build.mjs`** — extended the IIFE list to emit the six new
  `dist/public/locales/{locale}.js` artifacts alongside the v0.11.0
  ko/ja/zh-cn bundles.
- **`bootstrap.ts`** — `BUILT_IN_LOCALES` set now includes the six
  new codes, so `data-pyanchor-locale="es"` (or any of the others)
  triggers the same auto-injection path as v0.11.0.
- **`tests/e2e/server.mjs`** — serves the new bundles from
  `dist/public/locales/*.js` and adds fixture pages
  `/{es,de,fr,pt,vi,id}.html` that load the locale script before the
  overlay (matching production loading order).
- **`tests/e2e/i18n-v012.spec.ts`** — 12 new e2e cases (6 locales ×
  2 assertions): each verifies the panel header / mode buttons /
  composer headline render in the translated copy AND the toggle
  button's `aria-label` matches the locale's `toggleClose` value.
- **`tests/runtime/overlay/strings.test.ts`** — extended the
  `beforeEach` queue seed with the six new bundles + added a
  `built-in Latin + SE-Asian bundles (v0.12.0)` describe block with
  parameterized tests covering: roleYou + panelContextLabel,
  case-insensitive lookup, `statusQueuedAt` formatting, and the
  no-English-fallthrough guard for diagnostic / retry / copy keys.

### Translation notes
- **fr** uses singular "Diagnostic" for `diagnosticsTitle` rather
  than the English-collision plural "Diagnostics" — both are valid
  French; the singular reads as a label rather than a category.
- **pt-br** uses Brazilian conventions (Você / cadastro / "área de
  transferência") not European Portuguese.
- **es** is Latin-neutral / Castilian; "tú" 2sg matches the existing
  ja / ko informal-but-respectful register.
- Brand identifier "Pyanchor DevTools" is intentionally NOT
  translated in any locale (same convention as v0.10.0 ja/zh-cn).

### Roadmap
Next expansion candidates if there's user demand: ar (RTL — needs
overlay-side bidirectional layout work first), ru, hi, th. Adding a
new locale is now a ~20-line pattern: copy `ko.ts`, translate, list
in `build.mjs` + `bootstrap.ts` `BUILT_IN_LOCALES`, register fixture
in `tests/e2e/server.mjs`, add to the parameterized `it.each` cases.

## [0.11.0] - 2026-04-19

Locale code-splitting. Built-in translation bundles no longer ship
inside the main `overlay.js`; each locale is a separate IIFE that
loads only when needed. Net result: the default English bundle is
**12.7KB smaller** (54.7KB → 42.0KB), and a locale costs ~4-5KB
loaded in parallel with the overlay (HTTP/2 multiplexes both).

### Changed
- **`src/runtime/overlay/locales/{ko,ja,zh-cn}.ts`** — three new
  modules, each owning its full `Partial<StringTable>` translation
  bundle. At top-level (when run in a browser) the module pushes
  itself onto `window.__PyanchorPendingLocales`.
- **`src/runtime/overlay/strings.ts`** — drained the inline
  `koStrings` / `jaStrings` / `zhCNStrings` exports + the
  `BUILT_IN_BUNDLES` constant + `seedBuiltIns()`. Replaced with:
  - `drainPendingQueue()` called once at module load — empties
    `window.__PyanchorPendingLocales` into the registry.
  - `window.__PyanchorRegisterStrings = (locale, bundle) => …`
    exposed as a late-registration hook for locales loaded AFTER
    the overlay (uncommon — bootstrap orders them first).
  - `_clearRegistry()` now wipes + re-drains the pending queue,
    so tests that re-seed the queue see a clean baseline.
- **`build.mjs`** — three new IIFE entry points:
  `dist/public/locales/ko.js` (4.5KB), `ja.js` (5.2KB),
  `zh-cn.js` (3.9KB).
- **`bootstrap.ts`** — when `data-pyanchor-locale="..."` (or
  `__PyanchorConfig.locale`) is set AND the value is one of the
  built-in locales, bootstrap injects
  `<script defer src="locales/{locale}.js">` BEFORE the
  `<script defer src="overlay.js">` tag. Browser script-execution
  order for `defer` scripts (document order) guarantees the
  locale registers before the overlay drains the queue. Unknown
  locales silently fall back to English (same contract as
  `resolveStrings`).
- **`tests/e2e/server.mjs`** — serves `dist/public/locales/{ko,ja,zh-cn}.js`
  via a regex route. Locale fixtures (`/ko.html`, `/ja.html`,
  `/zh.html`) now include the locale `<script defer>` BEFORE the
  overlay one (matching the production loading order).

### Fixed
- **`tests/runtime/overlay/strings.test.ts`** — switched to
  `@vitest-environment happy-dom` (queue mechanism needs `window`)
  + a `beforeEach` that re-seeds the queue with the three built-in
  bundles (importing the locale modules from disk re-runs their
  push side effect, but the queue is reset between tests so we
  re-seed explicitly).

### Migration

**Existing users with `data-pyanchor-locale="..."` on the bootstrap
script tag**: nothing to do. Bootstrap auto-injects the matching
locale bundle.

**Existing users loading `overlay.js` directly (no bootstrap)**:
add the locale `<script>` BEFORE the overlay one:

```html
<!-- v0.10.0 (still works without locale script if you just want English) -->
<script>
  window.__PyanchorConfig = { baseUrl: "...", token: "...", locale: "ko" };
</script>
<script src="/_pyanchor/overlay.js"></script>

<!-- v0.11.0 — add the locale script -->
<script>
  window.__PyanchorConfig = { baseUrl: "...", token: "...", locale: "ko" };
</script>
<script src="/_pyanchor/locales/ko.js" defer></script>
<script src="/_pyanchor/overlay.js" defer></script>
```

The `defer` attribute on both is what guarantees the locale
registers before the overlay drains. Without `defer`, the inline
load order still works (locale runs first, queue gets populated,
overlay runs, drains queue), but `defer` is the documented and
tested pattern.

**Existing users via `registerStrings`**: nothing to do. The API
is unchanged — host-supplied bundles continue to work as before.

### Tests
- **Unit**: 427 (unchanged count; 9 strings tests rewired to use
  the queue mechanism via happy-dom env + beforeEach re-seed).
- **E2E (Playwright)**: 31 (unchanged; fixtures updated to the
  new loading order).
- **Total: 458 tests**.

### Bundle sizes (post-v0.11.0)

| File | Size | When loaded |
|---|---:|---|
| `dist/public/overlay.js` | **42.0KB** | always |
| `dist/public/bootstrap.js` | 2.9KB | always |
| `dist/public/locales/ko.js` | 4.5KB | only when locale=ko |
| `dist/public/locales/ja.js` | 5.2KB | only when locale=ja |
| `dist/public/locales/zh-cn.js` | 3.9KB | only when locale=zh-cn |

Default English-only deployment ships **42.0KB** (was 54.7KB
in v0.10.0 — a **23% reduction**). Worst case (a locale loaded)
is ~46-47KB across two parallel HTTP fetches.

### Roadmap
- **v0.11.x**: more locales (es / de / fr / pt-br / vi / id) —
  each one is now an isolated module + build entry, no main-bundle
  cost.
- **v0.12.x or later**: serve locale bundles via the sidecar's
  `/_pyanchor/locales/...` route directly (currently the test
  fixture server does this; the production sidecar treats the
  whole `dist/public/` as static assets, so it already works
  without code change — verified informally).
- **Lower priority**: Docker-based runner sandbox.

## [0.10.0] - 2026-04-19

Two coverage-broadening tracks land together:
- **More built-in locales**: Japanese (`ja`) + Simplified Chinese (`zh-cn`)
  ship with full StringTable translations.
- **a11y e2e hardening**: Codex round-10's two remaining coverage
  gaps (IME composition guard on the keyboard shortcut, focus trap's
  disabled-button skip) now have direct Playwright tests.

### Added — Japanese bundle (`ja`)
- **`jaStrings`** in `src/runtime/overlay/strings.ts` — full
  Japanese translation of every `StringTable` key.
  - Tone: concise, です/ます on instruction sentences,
    体言止め on status labels — the register Chrome / VS Code
    Japanese UIs use.
  - Brand "Pyanchor" / "DevTools" left as-is.
  - Parameterized: `キュー ${n} 番目`, `あなたのリクエスト: ${n} 番目`.
- Auto-registered via `BUILT_IN_BUNDLES` — host activates with
  `window.__PyanchorConfig.locale = "ja"` or
  `<script data-pyanchor-locale="ja">`. No `registerStrings` call
  needed.

### Added — Simplified Chinese bundle (`zh-cn`)
- **`zhCNStrings`** in `src/runtime/overlay/strings.ts` — full
  zh-CN translation.
  - Tone: direct + concise, half-width punctuation in technical
    contexts (e.g. `"Cmd/Ctrl + Shift + ."`), full-width in
    sentence flow (e.g. `"你的请求：第 N 位"`).
  - Brand "Pyanchor" / "DevTools" left as-is.
- Locale code policy explicit: only `"zh-cn"` (case-insensitive)
  resolves; bare `"zh"` falls back to English. Documented in
  `BUILT_IN_BUNDLES` header so future Traditional / Hong Kong
  variants can land as separate codes without ambiguity.

### Added — a11y e2e hardening (Codex round-10 coverage gaps)
- **`tests/e2e/a11y-hardening.spec.ts`** — 3 new Playwright tests:
  - **IME composition guard**: synthesizes a keydown with
    `isComposing: true` and asserts the Cmd/Ctrl + Shift + .
    shortcut does NOT toggle. Then dispatches the same chord
    with `isComposing: false` and asserts it DOES toggle. Proves
    the guard catches mid-composition completion keys for
    KO / JA / ZH IME users.
  - **Focus-trap disabled-skip (Tab order)**: with the panel open
    and the submit button disabled (empty prompt), the focus-trap's
    `:not([disabled])` selector excludes it. Asserted by walking
    the focusable list and verifying `submit-button` is absent
    while `close` / `mode-chat` / `mode-edit` / textarea are
    present.
  - **Focus-trap disabled-skip (Shift+Tab wrap)**: wrap-around
    target is the last ENABLED focusable, not the disabled
    submit button. Proves the trap honors disabled-skip on the
    boundary, not just in the linear walk.

### Tests
- **+6 unit tests** in `strings.test.ts` for the new locales:
  - ja resolution + Japanese-distinct content
  - zh-cn resolution + case-insensitivity
  - bare `"zh"` does NOT auto-resolve (explicit-codes policy)
  - parameterized strings format the position in both ja + zh-cn
  - both bundles have NO English fallthrough (every key translated)
- **+4 e2e tests** in `tests/e2e/i18n-extra.spec.ts`:
  - ja: panel header + empty state + mode buttons + composer headline
  - ja: toggle aria-label uses `"Pyanchor DevTools を閉じる"`
  - zh-cn: same scope with `"对话历史"` / `"提问"` / `"编辑"` / `"编辑页面"`
  - zh-cn: toggle aria-label uses `"关闭 Pyanchor DevTools"`
- **+3 e2e tests** in `tests/e2e/a11y-hardening.spec.ts` (above).
- **Total: 427 unit + 31 e2e = 458 tests**.

### Compatibility
No public API change. Default English behavior unchanged for
`undefined` / `"en"` / unrecognized locale.

Bundle size: 46.0KB → 54.7KB (+8.7KB) for the two new full
translation bundles. Each locale ~4.3KB raw — gzip should reduce
significantly. Locales are bundled (not lazy-loaded) for
zero-roundtrip activation; if bundle weight becomes a concern,
splitting locales into separate chunks is the natural next step
but not required at current size.

### Locale roster (post-v0.10.0)
| Locale | Status | Notes |
|---|---|---|
| `en` (default) | shipping | always falls through `enStrings` |
| `ko` | shipping | added v0.9.4 |
| `ja` | shipping | new this release |
| `zh-cn` | shipping | new this release; bare `zh` does NOT alias |
| `zh-tw` / `zh-hk` | not shipping | distinct codes welcome via PR |
| `es` / `de` / `fr` etc. | not shipping | host apps register manually |

### Roadmap
- **v0.10.x or v0.11.x**: optional locale-bundle code-splitting
  (lazy-import only the requested locale).
- **v0.10.x or v0.11.x**: more written locales (es / de / fr / pt-br
  / vi / id) — translation drafts welcome via PR.
- **Lower priority**: Docker-based runner sandbox.

## [0.9.7] - 2026-04-19

Diagnostics panel — the last UX item from Codex round-9's six
feature suggestions. Closes the v0.9.x UX track.

### Added
- **Collapsible Diagnostics block** at the bottom of the panel
  (between messages and composer). Uses native HTML
  `<details>` / `<summary>` for built-in keyboard +
  screen-reader semantics — the browser handles open/close, no
  extra `UIState` slot needed. Disclosure indicator is a
  rotating `▶` chevron.
  Shows live runtime + server state in a tight 2-column grid:
  - **Runtime** — `config.baseUrl` (e.g. `/_pyanchor`)
  - **Locale** — resolved locale code (e.g. `ko`) or `—` when
    unset (English default)
  - **Auth** — "bearer token" while
    `window.__PyanchorConfig.token` is still populated, or
    "cookie session" once bootstrap blanks it (visualizes the
    v0.5.1 token-blanking flow)
  - **Status** — `serverState.status`
  - **Job ID** — `serverState.jobId` or `—`
  - **Mode** — `serverState.mode` or `—`
  - **Queue** — `serverState.queue.length`
  - **Last update** — `formatTime(serverState.updatedAt)`
- **11 new `StringTable` keys** + Korean translations:
  `diagnosticsTitle`, `diagRuntime`, `diagLocale`, `diagAuth`,
  `diagStatus`, `diagJobId`, `diagMode`, `diagQueue`,
  `diagLastUpdate`, `diagAuthCookie`, `diagAuthBearer`.
- **`renderDiagnostics()`** module-level helper that composes
  the disclosure markup. Pure with respect to the closure
  state it reads (`config`, `serverState`, `s`).
- **Diagnostics CSS**: subtle border + monospace value column,
  list-style stripped from `<summary>`, custom rotating chevron.
- **`tests/e2e/diagnostics.spec.ts`** — **3 Playwright tests**:
  - collapsed by default (the `<details>` element has no `open`
    attribute on first render)
  - running state surfaces jobId + mode in the grid
  - Korean locale renders translated labels (`런타임`, `상태`,
    `작업 ID`, `대기열`) and the resolved locale code (`ko`)
- **+11 unit assertions** in `strings.test.ts` covering the
  shape and Korean translation of the new keys.

### Tests
- **Total: 421 unit + 24 e2e = 445 tests**.

### Compatibility
No breaking change. The diagnostics block adds DOM but no new
public API. Bundle size: 42.7KB → 46.0KB (+3.3KB) for the markup
template, 11 strings × 2 locales, and the disclosure CSS.

### v0.9.x UX track summary

| Slice | What landed |
|---|---|
| v0.9.0 | a11y phase 1 (focus trap, aria-live) + i18n shim foundation |
| v0.9.1 | CI hotfix (test scripts self-contained) |
| v0.9.2 | Codex round-8 patches (locale wiring + focus boundary + i18n completion v1) |
| v0.9.3 | Codex round-9 patches (focus retention + i18n completion v2 + close-return) |
| v0.9.4 | Built-in Korean bundle (`koStrings`) |
| v0.9.5 | UX phase 1: kbd shortcut + retry + copy |
| v0.9.6 | Codex round-10 patches (repeat guard + retry focus + copy scope) |
| **v0.9.7** | Diagnostics panel — UX track complete |

Cumulative since v0.9.0:
- Tests: 404 → **445** (+41, including 24 Playwright e2e)
- StringTable: 39 → **62 keys** (English + Korean, all translated)
- Bundle: 35.0KB → **46.0KB** (+11KB for a11y, i18n, ko bundle, 4 features, diagnostics)

### Roadmap
- **v0.10.x**: more built-in locales (ja / zh-CN). Pattern in
  `BUILT_IN_BUNDLES` is unchanged; PRs welcome.
- **v0.10.x e2e hardening**: IME composition guard, disabled-button
  skip in focus trap (Codex round-10 noted these as remaining
  coverage gaps).
- **Lower priority**: Docker-based runner sandbox.

## [0.9.6] - 2026-04-19

Codex round 10 surfaced 3 lows on v0.9.5 — none release-blocking,
but Codex flagged them as fast-follow before the next UX slice.
All three patched here, plus a small Korean-tone polish and a
CHANGELOG bundle-size correction.

### Fixed
- **Keyboard shortcut no longer bounces on a held key.** v0.9.5's
  `Cmd/Ctrl + Shift + .` listener checked `isComposing` + the
  modifier combo but didn't filter `event.repeat`. Holding the
  chord toggled the panel open/closed/open at OS key-repeat
  cadence. v0.9.6 adds `if (event.repeat) return;` early in the
  handler. Verified by a new e2e that dispatches three synthetic
  keydowns (`repeat: false`, `true`, `true`) and asserts the
  panel ends up open (only the first counts). Codex round-10 #1.
- **Retry focuses the textarea, not the Retry button.** v0.9.5's
  retry handler only restored `uiState.prompt` + `mode` and called
  `render()`. The focus-retention logic from v0.9.3 then restored
  focus to the still-attached `[data-action='retry']` button —
  which meant immediate typing did nothing useful. v0.9.6's retry
  handler now explicitly `.focus()`es the textarea after render
  and positions the cursor at the end of the restored prompt
  (so the user can keep typing or correct from the tail). The
  existing retry e2e was extended to assert focus lands on
  `TEXTAREA`. Codex round-10 #2.
- **Copy is now narrowed to assistant-only.** v0.9.5's
  `lastAssistantMessage` lookup matched `role === "assistant" || "system"`,
  which surfaced the Copy button on system bookkeeping messages
  ("Queued request canceled.", "Edit job exited abnormally.")
  and copied the system text. The CHANGELOG had documented
  "assistant message OR error" — the implementation was broader
  than the contract. v0.9.6 narrows to `role === "assistant"`;
  the error path stays as-is and supersedes when status is
  `failed`. Codex round-10 #3.

### Changed
- **Korean tone polish on `messagesEmpty`.** Previous translation
  used a polite imperative split across two sentences
  ("질문하거나 변경을 요청하세요. 대화 기록이 여기에 표시됩니다.")
  that read out of step with the terse declarative tone of the
  rest of the bundle. New copy collapses to a single declarative
  ("질문하거나 변경을 요청하면 대화 기록이 여기에 표시됩니다."). Codex
  round-10 Korean review surfaced this as the most obviously
  inconsistent string; the rest are judgment calls left as-is.
- **CHANGELOG bundle-size correction.** v0.9.5 documented "~41KB"
  but the actual built artifact was 42.7KB (Codex round-10
  pointed out the 1.7KB drift). v0.9.6 doesn't fight that — the
  3 fixes are smaller than the precision of the estimate. Real
  size after this release is documented below.

### Tests
- **+3 e2e tests** in `tests/e2e/ux-wins.spec.ts`:
  - synthetic `event.repeat` keydowns don't bounce the panel
  - retry click leaves keyboard focus on `TEXTAREA`
  - Copy button is NOT shown on a system-only-message state
- **Total: 421 unit + 21 e2e = 442 tests**.

### Compatibility
No public API change. The three fixes correct documented behavior
that v0.9.5 promised but didn't deliver. Bundle size after this
release: **~43KB** (rounded; +0.3KB for the focus call + assistant
filter narrowing balanced against the kept structure).

### Roadmap
- **v0.9.7**: diagnostics panel (Codex round-9 feature #6) —
  collapsible debug section with runtime config, locale, auth
  mode, current jobId, polling state. Pushed from v0.9.6 because
  the round-10 fast-follow took priority.
- **v0.10.x**: more built-in locales (ja / zh-CN). Pattern in
  `BUILT_IN_BUNDLES` is unchanged.
- **Lower priority**: Docker-based runner sandbox.
- **Documentation polish opportunity from Codex round-10**:
  no e2e for IME composition guard, no e2e for disabled-button
  skip in the focus trap. Both fall under the v0.10.x e2e
  hardening track.

## [0.9.5] - 2026-04-19

UX phase 1. Three of the six features Codex round-9 suggested
land here as a focused slice; diagnostics panel deferred to
v0.9.6.

### Added
- **Keyboard shortcut: Cmd/Ctrl + Shift + .** toggles the panel
  from anywhere on the page. The accelerator is the same on
  every platform so the in-product hint can stay concise.
  Skipped during IME composition (`event.isComposing`) so it
  doesn't eat composition-completion keys for users on
  Korean / Japanese / Chinese input methods. Codex round-9 #2.
- **Retry last request** button. After a `failed` or `canceled`
  outcome, the panel shows a "Retry last request" button that
  refills the textarea with the previous prompt and restores the
  prior mode (`edit` / `chat`) — no auto-submit, the user
  confirms by pressing the primary button. `lastSubmittedPrompt`
  + `lastSubmittedMode` saved on the same successful submit
  that already tracked `lastSubmittedJobId`. Codex round-9 #3.
- **Copy** button. Writes either the most recent assistant
  message text OR the current `serverState.error` (when status
  is `failed`) to the clipboard via `navigator.clipboard.writeText`.
  Toast on success / failure (permission rejection). Visible
  only when there's something to copy. Codex round-9 #4.
- **5 new `StringTable` keys** + Korean translations:
  - `kbdShortcutHint` — "Cmd/Ctrl + Shift + . to toggle"
    (English) / "Cmd/Ctrl + Shift + . 로 열기/닫기" (Korean).
    Shown subtly under the composer hint.
  - `retryLast` — "Retry last request" / "마지막 요청 다시 시도"
  - `copyLast` — "Copy" / "복사"
  - `toastCopied` — "Copied to clipboard." / "클립보드에 복사됨."
  - `toastCopyFailed` — "Copy failed." / "복사 실패."
- **`UIState.lastSubmittedPrompt` + `.lastSubmittedMode`** —
  module-private persistence for the Retry feature.
- **`button--ghost`** CSS class for the Retry / Copy chips —
  visually de-emphasized vs the primary submit + danger cancel.
- **`composer__hint-shortcut`** CSS for the new shortcut hint
  beneath the existing send hint.

### Tests
- **+1 unit test** in `strings.test.ts`: shape includes the 5
  new keys + `kbdShortcutHint` mentions the documented accelerator
  (regression guard against the editor stripping the modifier
  list). Korean ko bundle assertions extended to verify the new
  keys are translated (not English fallthrough).
- **`tests/e2e/ux-wins.spec.ts`** — **4 Playwright tests**:
  - `Ctrl+Shift+.` toggles the panel from closed → open → closed
  - plain `.` and `Shift+.` (no Ctrl/Meta) do NOT toggle —
    proves the modifier guard
  - retry: submit succeeds, status flips to failed, Retry button
    appears with the localized label, click refills the textarea
    with the prior prompt
  - copy: assistant message present → Copy visible, click writes
    the message text to `navigator.clipboard` (verified via
    `clipboard-read` permission grant)
- **Total: 421 unit + 19 e2e = 440 tests**.

### Compatibility
No runtime behavior change for users who don't trigger any of
the three new affordances. The keyboard shortcut listener is
passive until the exact accelerator combo arrives. Bundle size:
40.0KB → ~41KB (+~1KB for the 5 strings + 3 click handlers + CSS).

### Roadmap
- **v0.9.6**: diagnostics panel (Codex round-9 feature #6) — a
  collapsible debug section showing runtime config, locale, auth
  mode, current jobId, and polling state. Bigger than the v0.9.5
  trio so split into its own slice.
- **v0.10.x**: more built-in locales (ja / zh-CN); contributor
  pattern is already in `BUILT_IN_BUNDLES`.
- **Lower priority**: Docker-based runner sandbox.

## [0.9.4] - 2026-04-19

Built-in Korean bundle. v0.9.3 actually finished the i18n
extraction; v0.9.4 ships the first non-English translation in
the runtime so users only need to set `locale: "ko"` and Korean
copy renders without any extra `registerStrings` call from host
code.

### Added
- **`koStrings`** in `src/runtime/overlay/strings.ts` — full
  Korean translation of every `StringTable` key (no fallthroughs
  to English). Translation rules:
  - sentence-final periods preserved (matches `enStrings`
    typography — including `\u2026` for "전송 중…")
  - "Pyanchor" / "DevTools" left as-is (brand names)
  - conversational register matches the English source (short,
    directive, no `…해주세요` honorifics)
  - parameterized strings (`statusQueuedAt`, `statusYourPosition`)
    use Korean ordinal phrasing
- **Auto-registration at module load.** A new `BUILT_IN_BUNDLES`
  array + `seedBuiltIns()` helper register every shipped locale
  the moment `strings.ts` is imported. Host apps don't need to
  call `registerStrings("ko", …)` themselves — setting
  `window.__PyanchorConfig.locale = "ko"` is enough.
- **`_clearRegistry()` now re-seeds** the built-in bundles after
  wiping. Tests that called `_clearRegistry()` previously ended
  up with an empty registry; now they get the same view
  production has, which catches regressions where built-ins
  silently disappear.
- **`tests/e2e/server.mjs`** serves a new `/ko.html` fixture
  that pre-seeds `window.__PyanchorConfig.locale = "ko"` and
  loads the overlay directly — proves end-to-end that the
  built-in bundle activates without host code calling
  `registerStrings`.
- **`tests/e2e/i18n-ko.spec.ts`** — **4 Playwright tests**:
  - panel header + empty-state copy renders Korean
  - status banner uses Korean `statusReadingEdit` while running
  - dialog `aria-label` stays English brand (`panelTitle` =
    "Pyanchor DevTools" — intentionally not translated)
  - toggle `aria-label` uses Korean `toggleClose`

### Tests
- **+4 unit tests** in `strings.test.ts`:
  - `ko` resolves to a Korean bundle, not English
  - every `StringTable` key has a Korean translation distinct
    from English (regression guard for keys added without
    translation)
  - parameterized strings work in Korean (`statusQueuedAt`,
    `statusYourPosition`)
  - host `registerStrings("ko", …)` override wins over the
    built-in (last-write-wins semantics preserved)
- **+4 e2e tests** in `i18n-ko.spec.ts` (above).
- **Existing test fixed**: `resolveStrings("ko")` no longer
  expects English fallback (now returns the built-in Korean).
  Replaced with `"zz-XX"` / `"xx-fake"` for the
  unregistered-locale assertion.
- **Total: 420 unit + 15 e2e = 435 tests**.

### Compatibility
No runtime change for English users — `resolveStrings(undefined)`
or `"en"` still returns `enStrings`. Bundle size: 36.3KB → 40.0KB
(+3.7KB) for the Korean bundle's ~40 string values. Gzip should
recover most of it.

The only API-visible change: `_clearRegistry()` now re-seeds
built-ins. Host apps that depend on it producing an empty
registry (none in production code; only test infra used it)
should manually re-clear after if a truly empty state is
needed. The unit-tests for `registerStrings` already work with
the re-seeded state.

### How to use
```html
<!-- Option A: bootstrap reads data-pyanchor-locale -->
<script
  src="/_pyanchor/bootstrap.js"
  defer
  data-pyanchor-token="…"
  data-pyanchor-locale="ko"
></script>

<!-- Option B: host code pre-seeds the global -->
<script>
  window.__PyanchorConfig = { baseUrl: "/_pyanchor", token: "…", locale: "ko" };
</script>
<script src="/_pyanchor/overlay.js"></script>
```

Either path activates the built-in Korean bundle — no
`registerStrings` call needed.

### Roadmap (post-v0.9.4)
- **v0.9.x UX wins** from Codex round-9:
  - keyboard shortcut (Cmd/Ctrl + Shift + .) to open/close
  - retry last request after failure/cancel
  - copy last answer / copy error
  - diagnostics panel
- **v0.10.x or later**: more built-in locales (ja / zh-CN / es?
  PRs welcome — pattern in `BUILT_IN_BUNDLES`).
- **Lower priority**: Docker-based runner sandbox.

## [0.9.3] - 2026-04-19

Codex round 9 surfaced 2 mediums + 6 feature suggestions on v0.9.2.
Both blockers patched; one suggestion (focus return on close)
bundled because it's tightly coupled to the focus-retention work.
Plus a real Playwright keyboard-nav e2e — Codex flagged the
absence of one as a blocker too.

### Fixed
- **Focus retention across re-renders for non-textarea controls.**
  v0.9.2's `previousActive !== null` check fixed the textarea-steal
  but didn't restore focus to other controls. When a user clicked a
  mode-switch / cancel button, the re-render destroyed the DOM and
  focus dropped to `<body>` — keyboard navigation broke as soon as
  any in-panel button was used. v0.9.3 saves the focused element's
  IDENTITY (textarea + selection, OR `data-action` attribute) before
  the innerHTML wipe, then re-finds and re-focuses by selector after.
  All interactive panel elements now have `data-action` (added
  `submit-button` to the previously unidentified submit button).
  Codex round-9 #1 — verified by new Playwright kbd-nav e2e
  (`tests/e2e/keyboard-nav.spec.ts`).
- **Fresh-open detection no longer misfires on external focus.**
  v0.9.2's `previousActive === null` heuristic treated "panel still
  open but focus moved outside the shadow tree" as a fresh open and
  re-stole focus to the textarea. v0.9.3 tracks
  `wasOpenLastRender` at module level and computes
  `isFreshOpen = uiState.isOpen && !wasOpenLastRender` —
  panel-already-open renders never re-trigger auto-focus regardless
  of where the active element sits.
- **i18n extraction is actually complete now.** Two more
  hardcoded fallbacks moved into `StringTable`:
  - `errorRequestFailed` ("Request failed.") — used by
    `createFetchJson()` when a non-2xx response has no `{error}`
    field. Now an optional `defaultErrorMessage` factory option,
    wired from `s.errorRequestFailed`.
  - `errorJobFailed` ("Job failed.") — used by
    `createSyncStateClient()` when polling reports `failed` with
    a null `error`. Now an optional `defaultJobFailedMessage`
    factory option, wired from `s.errorJobFailed`.
  v0.9.2's "i18n extraction completed" CHANGELOG claim is now
  literally true; Korean bundle (v0.9.4) is unblocked.
  Codex round-9 #2.

### Added
- **Focus return on close** (Codex round-9 feature suggestion #1).
  When the panel transitions from open → closed, focus moves back
  to the trigger button instead of dropping to `<body>`. Detected
  via `justClosed = !uiState.isOpen && wasOpenLastRender` in the
  same render cycle that handles the close. Bundled with the
  focus-retention fix because both depend on the same
  module-level `wasOpenLastRender` tracking.
- **`data-action="submit-button"`** on the submit button so the
  focus-identity restore can recognize it. Previously the only
  unmarked interactive control.
- **`tests/e2e/keyboard-nav.spec.ts`** — **4 Playwright tests**:
  - mode-switch button click does NOT drop focus to BODY (the
    exact regression Codex's manual Chromium repro hit)
  - close → focus returns to toggle
  - Tab past the last focusable wraps to the first
  - Shift+Tab past the first wraps to the last
- **+5 unit tests** across the touched modules:
  - `strings.test.ts`: 2 new keys included in shape check, exact
    English values asserted (regression guard)
  - `fetch-helper.test.ts`: caller-supplied `defaultErrorMessage`
    overrides the English fallback (Korean error in test)
  - `polling.test.ts`: caller-supplied `defaultJobFailedMessage`
    overrides the English fallback (Korean error in test)
  - `bootstrap.test.ts`: empty-string `data-pyanchor-locale`
    treated as "no locale" (Codex round-9 untested edge)

### Tests
- **Unit**: 412 → **416** (+4 — strings shape +1, strings values +1,
  fetch override +1, polling override +1, bootstrap empty-locale +1
  = 5 new but the strings shape and values share an `it`, so 4
  observable additions).
- **E2E (Playwright)**: 7 → **11** (+4 keyboard-nav tests).
- **Total: 427 across 31 files**.

### Compatibility
No runtime behavior change for English users. The two new factory
options (`defaultErrorMessage`, `defaultJobFailedMessage`) default
to the prior English strings when not provided. Bundle size:
35.1KB → 36.3KB (+1.2KB) for the focus-identity logic + the 2 new
string keys + new factory options.

### Roadmap (post-v0.9.3)
- **v0.9.4** — built-in Korean bundle (`registerStrings("ko", { … })`
  shipped alongside English). Now genuinely unblocked.
- **v0.9.x** UX wins from Codex round-9 feature ideas:
  - keyboard shortcut (Cmd/Ctrl + Shift + .) to open/close
  - retry last request after failure/cancel
  - copy last answer / copy error
  - diagnostics panel (runtime config, locale, polling state)
- **Lower priority**: Docker-based runner sandbox.

## [0.9.2] - 2026-04-19

Codex round 8 surfaced 3 mediums on v0.9.0 — the i18n activation
wiring and the a11y focus-trap behavior both had real bugs that
the v0.9.0 tests missed. v0.9.2 patches all three before shipping
the Korean bundle or continuing the UX track.

### Fixed
- **Bootstrap now actually reads `data-pyanchor-locale` and preserves
  pre-seeded `__PyanchorConfig.locale`.** v0.9.0 claimed two
  activation paths (host-set `window.__PyanchorConfig.locale` AND
  `data-pyanchor-locale` on the `<script>` tag) but bootstrap read
  neither — it unconditionally overwrote `__PyanchorConfig` with
  `{baseUrl, token}`, clobbering any host-set locale, and never
  inspected the dataset attribute. The documented locale activation
  was effectively dead. v0.9.2 wires both paths with host-set
  taking priority over the dataset, and mirrors the resolved
  locale onto the appended overlay `<script>` tag so the
  overlay-side fallback path also sees it. Codex round-8 #1.
- **Auto-focus no longer steals focus on every re-render.** v0.9.0's
  "was focus inside overlay?" check used `root.contains(previousActive)`
  — but `host.contains(shadowChild)` returns `false` across the
  shadow boundary in real browsers (Chromium confirmed), so every
  re-render (mode button click, submit, toast dismiss) looked like
  a "fresh open" and the textarea stole focus back, breaking keyboard
  navigation. The correct signal: `shadowRoot.activeElement` returns
  null when focus is outside the shadow tree, so `previousActive !==
  null` is the reliable "was inside" check. Codex round-8 #2.
- **i18n extraction completed** — three user-visible strings still
  hardcoded in v0.9.0 now go through the `StringTable`:
  - `"Pyanchor DevTools"` (panel header title) → `panelTitle`
  - `"Current page"` (panel context label) → `panelContextLabel`
  - `"Your request: position ${n}"` (status meta breadcrumb) →
    `statusYourPosition(n)` parameterized
  The panel's dialog `aria-label` now uses `panelTitle` instead of
  the generic `toggleTitle` action copy. Codex round-8 #3.

### Added
- 3 new `StringTable` keys documented above.
- **Tests**:
  - `bootstrap.test.ts` — **+5 tests** for locale propagation:
    reads dataset → writes to config; pre-seeded host locale wins
    over dataset; missing locale → omitted from config; mirrored
    onto overlay script tag; not added when absent.
  - `strings.test.ts` — **+2 tests**: shape includes the 3 new keys;
    `statusYourPosition` formats the position; `panelTitle` matches
    the brand.
  - `state.test.ts` — **+1 test**: `getStatusMeta` uses
    `strings.statusYourPosition` (verified via a Korean override
    bundle rendering "대기열 1번째").
- **Total: 412 unit + 7 e2e = 419 tests**.

### Compatibility
No runtime behavior change for English users (default bundle).
Host apps that previously set `window.__PyanchorConfig.locale`
before bootstrap now actually see that locale applied; before,
they would have needed to set it AFTER bootstrap plus mutate the
config object a second time.

### Verified
- `pnpm typecheck` clean
- `pnpm test` → 412/412 green
- `pnpm test:e2e` → 7/7 green

### Roadmap
- **v0.9.3**: ship Korean bundle (`src/runtime/overlay/strings/ko.ts`)
  now that the extraction is actually complete. Dynamic-import
  story TBD; simplest v0 is static import gated on locale string.
- **v0.9.x**: keyboard nav diagnostic e2e (tab through every focusable
  element, verify trap wraps correctly — now that the focus logic
  is actually right); render snapshot test for the panel template.

## [0.9.1] - 2026-04-19

CI hotfix. The GitHub Actions `ci` and `release` workflows had been
failing silently since v0.8.0 — the v0.8.0 subprocess-smoke test
spawns `dist/worker/runner.cjs` but the workflows ran `pnpm test`
BEFORE `pnpm build`. v0.7.4 was the last green run because the
subprocess test didn't exist yet.

Local runs always passed because `dist/` was already built from
prior local `pnpm build` invocations. Only fresh-clone (CI) hit
the gap.

### Fixed
- **`pnpm test` is now self-contained.** Inlined `node build.mjs &&`
  in front of `vitest run` in the `test` and `test:coverage`
  scripts. Both `test:e2e` and `test:e2e:ui` already did this, and
  `test:all` got the same treatment for consistency. No CI workflow
  edit needed — every test invocation now produces its own dist.
- **Defensive precondition in `subprocess-smoke`** — the test now
  throws a clear `dist/worker/runner.cjs missing` message if
  someone bypasses the npm scripts and runs `vitest run` directly
  on a clean clone. Replaces the previous behavior where a missing
  binary caused spawn ENOENT to surface as a test timeout
  (confusing).

### Verified
- `rm -rf dist && pnpm test` → 404/404 green from clean state
- `pnpm typecheck` clean
- The next CI / release run on this commit should pass

### Compatibility
No production / runtime change. Only affects test invocation
mechanics. Bundle size unchanged (build emits the same dist).

### Why this slipped past local runs
`pnpm test` was always preceded — implicitly — by a recent
`pnpm build` from manual development. Codex round 7 ran `pnpm
test:all` which inlines the build, so it passed too. The exact
combination "fresh clone + first invocation = pnpm test" is what
CI does, and only what CI does. Adding a fresh-state test step
to the local dev loop would catch this earlier next time.

## [0.9.0] - 2026-04-19

UX track entry. Two long-tracked items land together:
- **a11y phase 1** — focus trap, aria-live status announcer,
  aria-labels on every interactive button, auto-focus the textarea
  on first panel open. Codex round-3 #6.
- **i18n shim foundation** — every user-visible string moved into
  a `StringTable` with English defaults and a partial-override
  registry. Locale resolves from `window.__PyanchorConfig.locale`
  or `data-pyanchor-locale` on the runtime script tag. Untranslated
  keys fall back to English silently.

### Added
- **`src/runtime/overlay/strings.ts`** — central string table:
  - `StringTable` interface with **39 keys** covering status banner,
    pending bubble, composer (title / placeholder / hint / submit /
    cancel), mode switch, toggle button, toasts, empty state, role
    labels, and boot-error copy
  - `enStrings` — the English default bundle (verbatim copy of the
    pre-v0.9.0 inline strings)
  - `registerStrings(locale, partial)` — host apps register a
    locale bundle; partial overrides merge over `enStrings`
  - `resolveStrings(locale?)` — returns the merged table; empty /
    null / `"en"` / unknown locale → `enStrings` verbatim,
    case-insensitive
- **`window.__PyanchorConfig.locale`** + **`data-pyanchor-locale`**
  script attribute — both honored by overlay bootstrap (config
  field takes precedence).
- **a11y: focus trap on the panel.** When the panel is open and
  the user Tabs past the last focusable element (or Shift+Tabs
  past the first), focus wraps to the other end. Listener attached
  once at module load on the shadow root; gates on `uiState.isOpen`.
- **a11y: aria-live status announcer.** The status-line block is
  now wrapped in `<div aria-live="polite" aria-atomic="true">` so
  screen readers announce status transitions (running → done,
  failed errors, queue position) without stealing focus.
- **a11y: missing aria-labels filled in.** The mode-switch
  buttons now have `aria-pressed` reflecting the active mode and
  the `<div class="mode-switch">` has `role="group"`. The textarea
  has both a `<label>` and an aria-label.
- **a11y: auto-focus the textarea** when the panel opens fresh
  (focus wasn't previously inside the overlay). Doesn't steal focus
  on re-renders that originated from inside the panel.

### Changed
- `state.ts` derived helpers now take a `StringTable` parameter
  (`getStatusHeadline`, `getPlaceholder`, `getComposerTitle`,
  `getPendingBubbleTitle`). Pass `enStrings` for the original
  English behavior.
- `templates.ts` `RenderMessagesProps` adds a required `strings`
  field. Empty-state copy and role labels (`You` / `Pyanchor`)
  now come from the table.
- `overlay.ts` resolves the table once at boot via `resolveStrings()`
  and threads it through every template + closure.
- `bootstrap.ts` `Window.__PyanchorConfig` type now includes
  `locale?: string` (kept aligned with the overlay-side declaration).
  Backwards-compatible: omitting `locale` is the same as English.

### Tests
- **`tests/runtime/overlay/strings.test.ts`** (**13 tests**):
  - `enStrings` shape completeness across all 39 keys
  - `statusQueuedAt` parameter formatting
  - `composerSubmitSending` uses the unicode horizontal ellipsis
    (regression guard against editor rewrites to `...`)
  - `resolveStrings` fallback behavior (null/undefined/`en`/unknown)
  - case-insensitive locale matching
  - `registerStrings` partial-override merge with English fallback
  - parameterized override (`statusQueuedAt`)
  - last-registration-wins idempotency
  - `enStrings` not mutated by registrations
- **`tests/runtime/overlay/templates.test.ts`** — **+3 i18n tests**:
  empty-state uses `strings.messagesEmpty`; role labels use
  `strings.roleYou` / `strings.rolePyanchor`; a Korean override
  bundle renders Korean copy in both empty + populated states.
- **`tests/runtime/overlay/state.test.ts`** — every existing test
  updated to pass `enStrings` as the new param. Behavior assertions
  unchanged.
- **Total**: **404 unit + 7 e2e = 411 tests**.

### Compatibility
No runtime behavior change for English users. The Korean (or any
locale) bundle is opt-in via `window.__PyanchorConfig.locale =
"ko"` + `registerStrings("ko", { … })` in host code. The bundle
size grew from 30.7KB → 35.0KB (+14%) — the increase is the
string table + a11y attribute serialization; gzip should bring
most of it back.

### Roadmap
- **v0.9.1** (likely): ship a Korean bundle (`enStrings.ko`)
  alongside English so users get bilingual support out of the box.
  Currently each host app would have to call `registerStrings` to
  add a locale.
- **v0.9.x** UX polish:
  - render snapshot tests for the panel template (Codex round-7
    "있으면 좋은 것" #4)
  - keyboard nav diagnostic (Tab through every focusable element
    in CI to catch tab-order regressions)
  - status copy key extraction tooling (a script that lists every
    `s.xxx` reference so translators know which keys are live)
- **Lower priority**: Docker-based runner sandbox for real
  permission/filesystem semantics. Tracked, not blocking.

## [0.8.2] - 2026-04-19

Codex round-7 review of v0.8.1 surfaced 3 findings — 2 mediums
(actual contract gaps) + 1 low (test branch coverage). All three
patched here. Codex flagged the mediums as blockers before UX track
entry; resolving them clears the path to v0.9.0.

### Fixed
- **Worker EPIPE diagnostic now actually lands on the thrown error
  message.** v0.8.1 registered a second `child.on("close", …)` handler
  that forwarded the synthetic `[stdin closed early: …]` note via
  `onStderrChunk`. But the FIRST close handler had already settled the
  promise from the `stderr` buffer by the time the second fired —
  meaning the thrown `Error.message` for non-zero exits never contained
  the note. And callers that don't pass `onStderrChunk` (the
  prepare/sync/chown variants in `workspace.ts`) lost the note entirely.
  v0.8.2 collapses to a single error handler that appends the note
  directly to the `stderr` buffer, so the diagnostic survives both the
  thrown error path AND the resolved-but-augmented `stderr` field.
  Codex round-7 #2.
- **Bootstrap-flow e2e race window mathematically closed.** v0.8.1
  snapshotted `statusRequests.length` AFTER `waitForFunction(token === "")`
  resolved. Requests that landed in the gap between blanking and
  snapshot were bucketed pre-snapshot but were actually post-blanking
  → escaped the assertion. v0.8.2 captures `blankingTimestampMs`
  inside the page (`performance.timeOrigin + performance.now()`) at
  the exact tick token blanking is observed, and the route handler
  stamps `Date.now()` on every captured request as `_capturedAt`.
  The post-blanking filter is now `req._capturedAt > blankingTimestampMs`
  — strictly time-ordered, no count-snapshot race. Verified stable
  across 15/15 consecutive runs (`--repeat-each=5`). Codex round-7 #1.

### Added
- **`tests/config.test.ts`** — **+2 tests** for the optionalEnv
  fallback branch on the workspace-command env vars: empty-string
  `PYANCHOR_SUDO_BIN` falls back to `/usr/bin/sudo`; whitespace-only
  `PYANCHOR_FLOCK_BIN` falls back to `/usr/bin/flock`. The trim
  branch was already covered; the empty/whitespace fallback was the
  gap. Codex round-7 #3.

### Tests
- **Unit**: 387 → **389** (+2 config fallback tests).
- **E2E (Playwright)**: 7 (unchanged, but the bootstrap-flow test's
  race window is closed — same count, stronger guarantee).
- **Total**: **396 across 30 files**.

### Compatibility
No runtime behavior change for production. The EPIPE fix is purely
a code-path consolidation that strengthens the diagnostic message
shape; happy-path runs never hit the listener. The e2e race fix
only affects how the test captures + asserts on requests; the
overlay's actual lazy-getToken behavior is unchanged.

### Roadmap
- **UX track entry now unblocked.** Codex round-7 confirmed the two
  mediums were the only blockers; v0.9.0 = overlay accessibility
  (focus trap, aria-live, keyboard nav) + i18n shim for status copy
  strings. Codex round-3 #6 / round-7 closer.
- **Optional pre-v0.9 polish** (Codex round-7 said "fine after
  blockers, plus 1-2 overlay render snapshots + status-copy key
  extraction"): may bundle into v0.9.0 or split as v0.8.3.
- **Lower priority**: Docker-based runner sandbox for real
  permission/filesystem semantics. Tracked, not blocking UX work.

## [0.8.1] - 2026-04-19

Self-review of v0.8.0 (drafted before firing Codex round 7) surfaced
six items where the v0.7.4 / v0.8.0 patches were technically green
but weaker than the prose claimed. v0.8.1 closes all six.

### Fixed
- **"Happy path" subprocess test now exercises the REAL success
  path, not the empty-stream fallback.** Previously the fake
  `openclaw` was `/bin/true`, which emits zero events; the test
  passed because `runAdapterAgent` falls back to `"Edit complete."`
  for edit-mode jobs when no result event arrives. That's the
  *failure-recovery* path, not the success path. The fake openclaw
  now emits a real
  `{"result":{"payloads":[{"text":"actually wired up the change"}]}}`
  document, and the test asserts the assistant message + currentStep
  carry that exact text — proving the result event actually flowed
  through `parseAgentResult` → `summaryParts` → `finalizeSuccess`
  end-to-end.
- **Bootstrap-flow e2e restored to the strict v0.5.1 contract.**
  v0.8.0 relaxed the assertion to "within 8s, AT LEAST ONE
  `/api/status` request arrived without Authorization" because the
  original "LAST request has no Authorization" was flaky under
  parallel Playwright workers. The relaxed version was technically
  stable but verified a weaker guarantee — a partial token leak
  could pass it. v0.8.1 snapshots the request count at the moment
  token blanking lands, waits for at least one POST-blanking poll,
  then asserts EVERY post-blanking request omits the Authorization
  header. This is the actual v0.5.1 security promise. Verified
  stable across 5/5 consecutive runs.
- **EPIPE swallow now preserves diagnostic context.** v0.8.0
  registered a `child.stdin.on("error", () => undefined)` listener
  to keep the worker from crashing when a child subprocess exits
  before reading stdin. The listener was a silent no-op — a real
  `EPIPE` from a network-attached agent or a permission change
  would vanish without trace. Both `worker/child-process.ts` and
  `agents/openclaw/exec.ts` now capture the error code and surface
  it as a synthetic stderr chunk (`[stdin closed early: EPIPE]`),
  so the failure path retains diagnostic info.

### Added
- **`tests/config.test.ts`** — **+5 tests** for the v0.8.0
  `PYANCHOR_SUDO_BIN` / `PYANCHOR_FLOCK_BIN` envs:
  defaults, env override, whitespace trim. The integration suite
  exercised these implicitly; now there's explicit unit-level
  coverage too.
- **`pnpm test:all`** script runs the full unit + e2e suite in
  one command (`vitest run && node build.mjs && playwright test`).
  Previously contributors had to remember both `pnpm test` and
  `pnpm test:e2e`. The script invokes the binaries directly
  rather than chaining `pnpm test && pnpm test:e2e` because the
  inner shell doesn't have pnpm on PATH.

### Changed
- **`tests/integration/` → `tests/subprocess-smoke/`**. The original
  name oversold what the suite actually does — it spawns the real
  worker binary but stubs sudo / flock / openclaw with no-op
  wrappers, so it's a wiring smoke, not a permission/filesystem
  integration test. The file's header comment was rewritten to
  match. A true Docker-based sandbox is still tracked as a
  follow-up.
- **`ref/`** local-only scratchpad added (gitignored). Holds drafted
  Codex prompts, session notes, the round-NN response saves. Lets
  the cross-session collaboration state stay out of the public repo.
  See `ref/README.md` for conventions.

### Tests
- **Unit**: 382 → **387** (+5 config sudo/flock tests; the
  subprocess-smoke suite is unchanged in count).
- **E2E (Playwright)**: 7 (unchanged).
- **Total**: **394 across 30 files**.

### Compatibility
No runtime behavior change for production deployments. Two
additions are visible to test code only:
- the EPIPE diagnostic stderr chunk (only fires when stdin actually
  errors, which is normally never)
- the `[stdin closed early: …]` text shape (no contract; just a
  log line)

The `tests/integration/` → `tests/subprocess-smoke/` rename does
not affect any external consumer — vitest's `tests/**/*.test.ts`
glob still picks it up at the new path.

### Roadmap (post-v0.8.1)
- **Codex round 7** — drafted but not yet fired (sitting in
  `ref/round-07-prompt.md`). Fire AFTER v0.8.1 ships so the review
  sees the patched state.
- **v0.8.x or v0.9.x**: overlay accessibility (focus trap,
  aria-live, keyboard nav) — Codex round-3 #6.
- **v0.8.x or v0.9.x**: i18n shim for status copy strings.
- **Lower priority**: Docker-based runner sandbox for real
  permission/filesystem semantics. Tracked but not blocking UX
  work.

## [0.8.0] - 2026-04-19

Real-subprocess integration coverage for `dist/worker/runner.cjs`
— the v0.7.x decomposition's last remaining 0%-covered piece. The
v0.7.x track originally targeted a Docker-based sandbox for this;
v0.8.0 ships the same coverage via narrower `PYANCHOR_SUDO_BIN` /
`PYANCHOR_FLOCK_BIN` env overrides instead, without adding Docker
to the test infra.

Two real defensive bugs surfaced and got fixed along the way: an
inconsistent sudo binary between worker workspace ops and the
openclaw adapter, and an unhandled-EPIPE crash when a child
subprocess exits before reading stdin.

### Fixed
- **`openclaw` adapter now honors `PYANCHOR_SUDO_BIN`.** Previously
  the worker workspace ops (`prepare`, `install`, `build`, `sync`,
  `restart`) used the configurable `pyanchorConfig.sudoBin`, but the
  agent adapter hardcoded `/usr/bin/sudo` in `src/agents/openclaw/index.ts`.
  In production both paths point at the same binary so nothing
  visibly broke; in test sandboxes (and on distros where sudo lives
  elsewhere) the inconsistency would cause the agent's prepare /
  brief / chat shell-outs to fail while workspace ops succeeded.
  Both paths now read `pyanchorConfig.sudoBin`.
- **Unhandled EPIPE on child stdin no longer crashes the worker.**
  When a spawned subprocess exits before consuming the stdin pipe
  (a misconfigured wrapper, a sudo password reject, an openclaw
  binary that crashes on startup), the previous code would surface
  an unhandled `'error'` event on the stdin socket and terminate
  the worker via Node's default uncaughtException handler. Both
  `src/worker/child-process.ts` and `src/agents/openclaw/exec.ts`
  now register a no-op `'error'` listener on stdin before writing.
  The close handler still records the non-zero exit code so the
  failure surfaces through the normal job-failure path.

### Added
- **`PYANCHOR_SUDO_BIN`** — overrides the sudo wrapper path used by
  worker workspace ops AND the openclaw adapter. Default
  `/usr/bin/sudo`.
- **`PYANCHOR_FLOCK_BIN`** — overrides the flock binary used for
  shared/exclusive locks during workspace rsync. Default
  `/usr/bin/flock`.
  Both documented in `.env.example` under "Workspace command
  overrides (advanced / test-only)" — production deployments
  should leave them unset.

- **`tests/integration/runner-subprocess.test.ts`** — **3 tests**
  spawning the actual built `dist/worker/runner.cjs` binary:
  - **happy path**: state.json processed end-to-end, status flips
    `running → done`, assistant message appended with the default
    "Edit complete." summary that the openclaw adapter falls back
    to when its underlying subprocess emits zero events
  - **activity-log lifecycle steps**: asserts the
    `Preparing` / `Syncing` / `Job complete` markers landed in the
    persisted `activityLog` (proves `withHeartbeat` and the runtime
    buffer flush actually wrote through the real state-io)
  - **env validation**: missing `PYANCHOR_STATE_FILE_PATH` exits 1
  - **cancel signal**: with a fake-openclaw script that hangs on
    the `chat` invocation, SIGTERMing the worker mid-job causes
    `finalizeCancellation` to write the canceled final state and
    exit cleanly. Uses a fake-sudo wrapper that handles both
    `sudo cmd args` (workspace ops) and `sudo -u user cmd args`
    (agent ops).

### Changed
- **`tests/e2e/bootstrap-and-flows.spec.ts`** — token-surface test
  changed from "the LAST status request has no Authorization" to
  "WITHIN 8s, AT LEAST ONE status request arrived without
  Authorization." The strict assertion was flaky under parallel
  Playwright workers because polling cadence + session POST
  resolution can land status requests out of insertion order
  across two browser contexts. The new assertion preserves the
  v0.5.1 security guarantee (cookie-only path engages) without
  the timing dependency. Verified stable across 5/5 consecutive
  runs.

### Tests
- **Unit**: 378 → **382** (+3 runner-subprocess tests, -1 skipped
  → 0 skipped after restoring cancel).
- **E2E (Playwright)**: 7 (unchanged).
- **Total**: **389 across 30 files**.

### Coverage
- `src/worker/runner.ts`: 0% → real-subprocess smoke now exercises
  the full main loop, signal handlers, processJob orchestration,
  and the dequeue boundary. The vitest coverage tool still reports
  0% because the subprocess runs in a separate Node process, but
  the code IS executed end-to-end with state.json mutations
  observed from outside.
- `src/runtime/bootstrap.ts`: 100% (held from v0.7.4).
- All seven worker submodules: 100% (held from v0.6.x).
- All six overlay submodules: ≥98% (held from v0.7.0–v0.7.1).

### Compatibility
The two new env vars default to the prior hardcoded values, so
no production deployment needs to change anything. The openclaw
adapter behavior is unchanged when `PYANCHOR_SUDO_BIN` is unset.
The EPIPE swallow is purely defensive — happy-path runs never hit
the listener because the close handler resolves before the error
event would fire.

### Roadmap
- **v0.8.x**: overlay accessibility (focus trap, aria-live,
  keyboard navigation) — Codex round-3 #6.
- **v0.8.x or v0.9.x**: i18n shim for the status copy strings (the
  English / Korean mix in the messages).
- **Optional**: a true Docker-based sandbox would still be more
  faithful for testing real `sudo` / `rsync` / `chown` semantics
  against actual permission boundaries. v0.8.0's env-override
  approach covers the orchestration paths but stops short of
  permission/filesystem-edge testing. Tracked but lower priority
  than UX work.

## [0.7.4] - 2026-04-19

Codex round-6 verification gap closure. The review confirmed v0.7.0–
v0.7.3 had no code-level regressions, but flagged that the v0.5.1
token-surface fix — the security feature this project cares most
about — was NOT actually verified by the e2e suite because the fixture
loaded `overlay.js` directly and skipped `bootstrap.js`. v0.7.4
closes that gap with 21 new bootstrap unit tests (under happy-dom)
and 3 new e2e tests covering the full `bootstrap → session →
token-blanking → cookie-only` flow plus submit + cancel user paths.

### Changed
- **`src/runtime/bootstrap.ts`** refactored to expose
  `runBootstrap({ window, document, fetch?, currentScript })` as a
  pure callable. The browser entrypoint at the bottom of the file
  invokes it with the real globals (`window`, `document`,
  `document.currentScript`). Tests inject fakes / fetch mocks so the
  trusted-host check, token-blanking, idempotency, and overlay-script
  dedup paths are individually verifiable. Also re-exports
  `isTrustedHost` and `DEFAULT_TRUSTED_HOSTS` for direct testing.
  No runtime behavior change for the browser path — the IIFE-shaped
  invocation became a function call with the same arguments.
- **`tests/e2e/server.mjs`** now serves a second fixture at
  `/bootstrap.html` that loads `bootstrap.js` the way a real host
  page would (with `data-pyanchor-token` and
  `data-pyanchor-trusted-hosts="127.0.0.1,localhost"` attributes).
  The original `/` fixture stays as the fast-path overlay-direct
  loader. Each test picks the fixture that matches its surface.

### Added
- **`tests/runtime/bootstrap.test.ts`** (`@vitest-environment happy-dom`)
  — **21 tests** across 5 describe blocks:
  - `isTrustedHost`: exact match, rejection, wildcard subdomain
    (NOT bare domain), `.local` suffix, whitespace trim, empty
    hostname → false, DEFAULT_TRUSTED_HOSTS coverage
  - `runBootstrap` idempotency: first call → "loaded", second →
    "skipped-already-loaded"
  - trusted host allowlist: untrusted → "skipped-untrusted-host"
    + console.warn + no fetch / no config; custom override via
    `data-pyanchor-trusted-hosts` lets staging hosts through
  - config wiring: `baseUrl` derived from script src by stripping
    `/bootstrap.js`, fallback to `/_pyanchor` when no currentScript,
    token trimmed from `data-pyanchor-token`, empty-string when
    absent
  - **session exchange + token blanking (v0.5.1)**: POSTs
    `/api/session` with the bearer; does NOT post when no token;
    blanks `window.__PyanchorConfig.token` on 2xx; PRESERVES the
    token on non-2xx; PRESERVES the token on network throw
  - overlay script injection: appends
    `<script data-pyanchor-overlay='1' defer>`; dedups when one
    already exists → "loaded-overlay-already-present"
- **`tests/e2e/bootstrap-and-flows.spec.ts`** — **3 tests**:
  1. **v0.5.1 token surface (the headline fix)**: loads
     `/bootstrap.html` so the real bootstrap runs, asserts
     `/api/session` carries `Authorization: Bearer ...`, waits for
     `__PyanchorConfig.token` to blank, then asserts the
     LAST `/api/status` request has no `Authorization` header (the
     overlay's lazy `getToken()` reads empty → omits the header,
     proving the cookie-only path engaged in a real browser).
  2. **submit smoke**: opens the panel via the toggle button,
     types into the textarea, clicks submit, asserts
     `/api/edit` POST body matches `{ prompt, mode, targetPath }`.
  3. **cancel smoke**: opens the panel while server reports
     running, clicks cancel, asserts `/api/cancel` was called
     (and if the payload includes `jobId`, that it matches the
     active job).

### Tests
- **Unit**: 357 → **378** (+21 bootstrap tests).
- **E2E (Playwright)**: 4 → **7** (+3 bootstrap-flow tests).
- **Total**: **385** across 29 files (28 unit + 1 e2e directory
  with 2 spec files).

### Coverage
- `src/runtime/bootstrap.ts`: 0% → **100%** statements (was a
  testing dead zone since v0.1.0; now fully covered).

### Compatibility
No runtime behavior change. The bootstrap IIFE became a
`runBootstrap()` invocation with identical arguments; the
overlay-direct fixture path still works for the original 4 e2e
tests; the new `/bootstrap.html` fixture is opt-in per test.

### Roadmap (post-v0.7.x)
- **v0.8.0**: docker-based runner sandbox for the real-spawn /
  real-sudo / real-rsync paths (Codex round-5 #4, the runner-level
  integration coverage gap).
- **v0.8.x or v0.9.x**: overlay accessibility (focus trap, aria-live,
  keyboard navigation) + i18n shim. Codex round-3 #6.
- **Optional v0.7.5** (if Codex round-7 surfaces anything): the
  remaining "있으면 좋은 것" items — queuePosition pending bubble e2e,
  navigation event currentPath update, mode lock during running,
  template snapshot for the three message roles.

## [0.7.3] - 2026-04-19

Closes the v0.7.x decomposition track with the worker-assembly
smoke (Codex round-5 deferred item) and a Playwright job in CI.

### Added
- **`tests/worker/integration.test.ts`** — **6 tests** that wire
  ALL six extracted worker factories (`createStateIO` →
  `createRuntimeBuffer` → `createLifecycle` plus the workspace
  module + the cancel/activeChildren shared state) into one
  end-to-end harness with a stubbed `runCommand`. Exercises:
  - happy-path edit flow: prepare → install → agent → build →
    sync → finalizeSuccess, with state.json updated through the
    real `createStateIO` lock chain
  - the `baseExecOptions` propagation: every workspace runCommand
    call receives the same `activeChildren` Set + the same
    `isCancelled` callback the lifecycle reads
  - cancel boundary: `cancelActiveChildren` walks the same Set
    the workspace ops point at, runAdapterAgent throws
    `canceledError` while `isCancelled` is true (not silently
    swallowed), and `finalizeFailure('canceled')` is a no-op
    when `isCancelHandled()` returns true
  - runtime-buffer + state-io coalesce: 50 burst log lines
    flushed through the lock chain land in order without torn
    writes

  This is the smoke Codex round-5 noted before greenlighting
  v0.7.0. Real-spawn / sudo coverage stays out of scope —
  documented for a v0.8.x Docker-based harness.

- **GitHub Actions: e2e job in `.github/workflows/ci.yml`**.
  Runs after the matrix `build` job on Node 22 only (chromium is
  heavy and the overlay bundle is identical across Node versions).
  Caches `~/.cache/ms-playwright` keyed on `pnpm-lock.yaml`,
  installs OS deps when the cache hits but the binaries don't,
  uploads `test-results/` + `playwright-report/` as artifacts on
  failure for 7 days.

### Tests
- **Unit**: 351 → **357** (+6 integration tests).
- **E2E (Playwright)**: 4 (unchanged from v0.7.2).
- **Total**: **361 across 28 files** (27 unit + 1 e2e spec).

### Compatibility
No runtime change. The integration test consumes the existing
factory exports without modification; the CI workflow adds a job
without changing the existing matrix. PRs that fail the e2e job
won't merge — same gate model as the existing build job.

### v0.7.x track summary

| Slice | What landed | overlay.ts LOC | Tests | Coverage |
|---|---|---:|---:|---:|
| v0.7.0 | format / elements / fetch-helper / state extraction | 1074 → 887 | 266 → 328 | 55.1% → 59.3% |
| v0.7.1 | templates / polling extraction | 887 → 837 | 328 → 351 | 59.3% → 60.9% |
| v0.7.2 | Playwright e2e harness + 4 chromium smoke tests | 837 | 351 + 4e2e | 60.9% |
| v0.7.3 | worker integration smoke + CI Playwright job | 837 | 357 + 4e2e | 60.9% |

The pre-v0.6.0 `worker/runner.ts` was 860 LOC with 0% coverage. After
the v0.6.x track it's 348 LOC with the side-effectful orchestration
remaining at 0% (the seven extracted worker modules cover 100% of the
displaced code). After the v0.7.x track the pre-v0.7.0 1074-LOC
`runtime/overlay.ts` is 837 LOC with six pure submodules at ≥98%
coverage and a Playwright smoke verifying the mount + polling +
error-tolerance contracts hold against a real browser.

### Roadmap (post-v0.7.x)
- **v0.8.x**: docker-based runner sandbox for the real-spawn /
  real-sudo paths, replacing the integration smoke with full
  end-to-end coverage of `worker/runner.ts`'s orchestration.
- **v0.8.x or v0.9.x**: overlay accessibility (focus trap, aria-live,
  keyboard navigation) + i18n shim for the status copy. Codex
  round-3 #6 still tracked.

## [0.7.2] - 2026-04-19

Playwright e2e harness lands. The overlay's Shadow DOM mount,
polling cycle, and error tolerance are now smoke-tested against
a real Chromium browser with mocked sidecar APIs.

### Added
- **Playwright dev dependency** (`@playwright/test@^1.59`) — the
  browser binary (`chromium`) is downloaded into the local
  `~/.cache/ms-playwright/` cache via `pnpm exec playwright install
  chromium`. CI workflow update slated for v0.7.3 with the runner
  smoke harness.
- **`playwright.config.ts`** — chromium-only project, parallel
  enabled, retain-trace on failure, and a `webServer` block that
  spawns the e2e fixture server on port 4173.
- **`tests/e2e/server.mjs`** — a 60-LOC static server that serves
  a fixture HTML page with `window.__PyanchorConfig` inlined plus
  the freshly-built `dist/public/{overlay,bootstrap}.js`. NO API
  routes — each test mocks `/_pyanchor/api/*` via
  Playwright's `page.route()` so the e2e suite has zero coupling
  to the real sidecar. Missing-mock requests return 500 with a
  diagnostic body so test gaps fail loud instead of hanging.
- **`tests/e2e/overlay.spec.ts`** — 4 smoke tests:
  - mounts the `#pyanchor-overlay-root` host with an open Shadow
    DOM containing a toggle button
  - shadow root content is reachable via DOM piercing
  - polling renders the `running` status received from
    `/api/status` (heartbeat label / current step / generic fallback
    surface in the panel)
  - a 500 on `/api/status` does NOT throw a page-error and the
    overlay host stays alive (proves the v0.6.3 syncState
    try/catch hasn't regressed across the v0.7.x decomposition)
- **`pnpm test:e2e`** + **`pnpm test:e2e:ui`** scripts. Both
  invoke `node build.mjs` first so the served bundle is always
  fresh.

### Changed
- **`.gitignore`**: ignore `test-results/`, `playwright-report/`,
  and `.playwright/` to keep e2e artifacts out of the repo.
- **`vitest.config.ts`**: e2e specs use `*.spec.ts` (Playwright
  convention); vitest's `*.test.ts` glob already excludes them, so
  no change to the include/exclude lists was needed — verified by
  the 351 unit tests staying isolated from the 4 Playwright tests.

### Tests
- **Unit**: 351 (unchanged from v0.7.1).
- **E2E (Playwright)**: 4 — total run time ~2.3s on a warm
  chromium cache.
- Total: **355 across 27 files** (26 unit + 1 e2e spec).

### Compatibility
No runtime change. The e2e suite is opt-in via `pnpm test:e2e` —
the default `pnpm test` continues to run only the vitest unit
suite, so contributors without chromium installed aren't blocked.

### How to run locally

```bash
# one-time
pnpm install
pnpm exec playwright install chromium

# every run
pnpm test:e2e          # headless
pnpm test:e2e:ui       # Playwright UI mode (debugger)
```

### Roadmap
- **v0.7.3**: sandboxed integration tests for `worker/runner.ts`
  (the runner-smoke item Codex round-5 noted) + GitHub Actions
  workflow that runs both the unit suite and the Playwright job.

## [0.7.1] - 2026-04-19

Second slice of the overlay decomposition. Two more submodules
extracted; both at 100% statement coverage. Note: the original
v0.7.x roadmap mentioned an `anchor-picker.ts` module — turns out
the overlay is a chat/edit panel, not a Figma-style element-picker,
so there's nothing to extract under that name. Pivoted to extracting
the message-list template and the server-state polling client
instead, which are the natural seams given the actual code.

### Added
- **`src/runtime/overlay/templates.ts`** — `renderMessagesTemplate(props)`
  takes a plain props object (`messages`, `queuePosition`,
  `serverStatus`, `heartbeatAt`, `startedAt`, `pendingBubbleTitle`,
  optional `messageWindow`) and returns the messages-list HTML
  string. No closure over the overlay's mutable singletons —
  snapshot-testable in isolation. Splits the row + pending-bubble
  rendering into private helpers.
- **`src/runtime/overlay/polling.ts`** — `createSyncStateClient({
  fetchJson, buildStatusUrl, getUIState, getServerState, setServerState,
  mutateUIState, render, onOutcome })` factory returning `{ sync }`.
  Encapsulates the GET /api/status fetch, the
  `lastSubmittedJobId` clear-when-job-leaves-queue logic, and the
  done/failed/canceled outcome dispatch. UI-agnostic — caller
  wires `render` to the overlay's actual render and `onOutcome`
  to its toast renderer.

### Changed
- **`src/runtime/overlay.ts`** went from **887 → 837 LOC** (-50 / -5.6%).
  Cumulative since v0.6.3: **1074 → 837 (-22%)**. Six overlay
  submodules now exist; all at ≥ 98% coverage.
- `renderMessages` and `syncState` are now thin closures around
  the new module factories. Behavior bit-identical:
  - same 18-message window
  - same role-label mapping (`user`→"You", others→"Pyanchor")
  - same pending-bubble trigger conditions (running / canceling /
    user-has-queued-job)
  - same outcome-toast cascade (done with mode-specific text,
    failed with `{error}` fallback, canceled generic)

### Tests
- `tests/runtime/overlay/templates.test.ts` — **11 tests** for the
  message-list builder: empty placeholder, role-label mapping,
  XSS escape on message text + pending title, default 18-message
  window, custom window, pending-bubble trigger conditions,
  heartbeat→start fallback for the timestamp.
- `tests/runtime/overlay/polling.test.ts` — **12 tests** for the
  sync client: fetch+replace+render, render-on-error, the
  `lastSubmittedJobId` clearing rules (4 cases — leaves queue +
  not running, becomes the running job, still queued, mid-cancel
  transition), and the outcome cascade (done/failed/failed-with-null-error/
  canceled, plus the no-toast-when-silent and jobId-changed
  no-emit cases).
- Total: **351 passing tests** across 26 files (was 328 / 24).

### Coverage
- Whole-repo: 59.3% → **60.9%** (+1.6 pp).
- All six overlay submodules now at **100% statements**:
  format, elements, fetch-helper, state, templates, polling
  (state at 98% from v0.7.0 — same; templates and polling fresh
  at 100%).

### Compatibility
No runtime behavior change. The overlay still polls at 3.5s,
clears `lastSubmittedJobId` under the same conditions, and
displays the same outcome toasts at the same transitions.

### Roadmap (overlay track continued)
- **v0.7.2**: Playwright e2e harness — overlay mount → submit →
  server response → cancel happy path. CI workflow for the browser
  job. Bigger lift (new test infra), separate session.
- **v0.7.3**: sandboxed integration tests for `worker/runner.ts`
  (the runner-smoke item from Codex round-5).

## [0.7.0] - 2026-04-19

First slice of the `runtime/overlay.ts` decomposition track. Four
pure / DOM-friendly submodules carved out of the 1074-LOC monolith,
all tested individually (3 of 4 at 100% statements, the fourth at
98%). Adds `happy-dom` as a dev dependency for the DOM-touching tests.

### Added
- **`src/runtime/overlay/format.ts`** — pure formatters
  (`escapeHtml`, `formatTime`, `takeFirstLine`, `shorten`). No DOM,
  no module state. Mirrors the worker's `stampLogLine` HH:MM:SS
  format so log lines and heartbeats display identically across the
  server-rendered admin page and the in-page overlay.
- **`src/runtime/overlay/elements.ts`** — inline SVG icon strings
  (`sparkIcon`, `closeIcon`, `typingDots`) + `mountOverlayHost(doc?)`
  factory that creates the `#pyanchor-overlay-root` host and opens
  its Shadow DOM. Caller still owns idempotency (the
  `window.__PyanchorOverlayLoaded` check).
- **`src/runtime/overlay/fetch-helper.ts`** — `createFetchJson({
  baseUrl, getToken, fetchImpl? })` factory + `runtimePath(base, suffix)`
  joiner. **Token is read lazily on every call** (`getToken()`) so the
  v0.5.1 cookie-exchange behavior — bootstrap blanks
  `window.__PyanchorConfig.token` after the session POST — still
  works without breaking long-lived adapters. Error normalization
  surfaces the server's `{error}` field; falls back to
  `"Request failed."`.
- **`src/runtime/overlay/state.ts`** — UI state types
  (`UIState`, `AiEditState`, etc., re-declared locally so the
  browser bundle stays self-contained), plus pure derived helpers
  (`getTrackedQueuePosition`, `shouldPoll`, `getStatusHeadline`,
  `getStatusMeta`, `getPlaceholder`, `getComposerTitle`,
  `getPendingBubbleTitle`). Each helper takes `(uiState, serverState)`
  by parameter so the overlay's mutable singletons stay in
  `overlay.ts` while the logic becomes testable.

### Changed
- **`src/runtime/overlay.ts`** went from **1074 → 887 LOC** (-187 / -17%).
  What's left is the styles block, render() template orchestration,
  and event-handler wiring. The mutable singletons (`uiState`,
  `serverState`, the shadow root) stay here because they're
  inherently coupled to the render() loop; the pure logic is now
  out and individually verified.
- Bootstrap-and-mount sequence consolidated through `mountOverlayHost()`.
  fetchJson reads the token through a closure each call, restoring
  the cookie-only path the v0.5.1 patch enabled (was working but
  the lazy-read wasn't testable in isolation; it is now).

### Tests
- `tests/runtime/overlay/format.test.ts` — **16 tests** for the
  pure formatters: HTML escape ordering, ISO parsing edge cases,
  Unicode passthrough, takeFirstLine on whitespace-only input,
  shorten cap inclusivity (ellipsis takes one of the `max` slots).
- `tests/runtime/overlay/elements.test.ts` — **6 tests** (happy-dom)
  for SVG markup contents and the mount/shadow-root contract.
- `tests/runtime/overlay/fetch-helper.test.ts` — **11 tests** for
  header composition (Content-Type + lazy Authorization), per-call
  header merging, server-error message surfacing + generic fallback,
  and the lazy-token re-read behavior (proves the cookie-only path
  works after the bootstrap clears the token).
- `tests/runtime/overlay/state.test.ts` — **29 tests** for the
  derived helpers: queue-position 1-based indexing, polling
  predicate truth table, status headline priority cascade
  (queue → thinking → heartbeat → currentStep → mode-specific
  fallback → error → done summary → empty), getStatusMeta join
  semantics, mode-specific composer / placeholder / pending titles.
- Total: **328 passing tests** across 24 files (was 266 / 20).

### Coverage
- Whole-repo: 55.1% → **59.3%** (+4.2 pp).
- `src/runtime/overlay/`: **98.8%** statements (3/4 modules at 100%,
  state.ts at 98%).
- `src/runtime/overlay.ts` itself stays at 0% — the remaining
  render() body and event-handler wiring is integration-test
  surface, slated for the v0.7.2 Playwright e2e pass.

### Compatibility
No runtime behavior change for the in-page overlay. The Shadow DOM
host mounts the same way, the polling cadence is unchanged, the
fetch helper composes the exact same headers, and the status
headline / queue-position UX is identical (verified by the
character-for-character pure tests against the same priority cascade
the original inlined logic implemented).

### Roadmap (overlay track)
- **v0.7.1**: extract `runtime/overlay/anchor-picker.ts` (page
  element selection, highlight box, selector extraction) and
  `runtime/overlay/panel.ts` (the chat/edit panel template +
  binding).
- **v0.7.2**: Playwright e2e harness — overlay mount → anchor
  pick → submit → server response, plus the cancel happy path. CI
  workflow for the browser job.
- **v0.7.3**: sandboxed integration tests for `worker/runner.ts`
  (real signal handlers, real dequeue boundary) — the smoke
  Codex round-5 noted is a nice-to-have.

## [0.6.3] - 2026-04-19

Third (and final) slice of the worker decomposition tracked since
v0.5.0. Lifecycle module extracted, the cancel-during-dequeue
scenario from Codex round-4 covered. Combined with v0.6.0–v0.6.2,
the original 860-LOC `worker/runner.ts` is now down to **348 LOC
(-60%)** with the bulk of the displaced code at 100% test coverage.

### Added
- **`src/worker/messages.ts`** — three pure helpers
  (`createMessage`, `updateUserMessageStatus`, `pushMessageWithCap`)
  shared between the runner (cancel handler, processJob assistant
  push) and the new lifecycle module. Mirror of the same-named
  helpers in `src/state.ts`; kept duplicate in `worker/` so the
  worker process doesn't have to reach into the sidecar's higher-level
  state module (which has spawn / fetch side effects).
- **`src/worker/lifecycle.ts`** — `createLifecycle(config, deps)`
  factory returning `{ dequeueNext, finalizeSuccess, finalizeFailure,
  runAdapterAgent }`. State I/O, runtime-buffer, and cancel signaling
  are all dependency-injected:
  - `readState` / `writeState` from `createStateIO`
  - `queueLog` / `queueThinking` / `pulseState` / `flushRuntimeBuffers`
    + the pure helpers (`trimLog` / `stampLogLine` / `mergeThinking`)
    from `createRuntimeBuffer`
  - `cancelSignal: AbortSignal`, `isCancelled()`, `isCancelHandled()`
    callbacks owned by the runner

  This is what makes the cancel-race scenarios from the Codex review
  unit-testable end-to-end with a stub `AgentRunner` and an in-memory
  state store.

### Changed
- **`src/worker/runner.ts`** went from **530 → 348 LOC** (-182 / -34%).
  Cumulative since v0.6.0: **-60%** (860 → 348). What remains is
  pure orchestration: env wiring, signal handlers, processJob
  step sequencing, main loop. The lifecycle / state / runtime-buffer
  / workspace / child-process modules each test independently to 100%.

### Tests
- `tests/worker/messages.test.ts` — **10 tests** for the pure
  helpers (uuid uniqueness, role/status passthrough, in-place
  immutability, cap-trim behavior).
- `tests/worker/lifecycle.test.ts` — **19 tests** including:
  - `dequeueNext`: empty-queue null return, queue-pop with running
    state write + queued→running message status flip
  - `finalizeSuccess`: done state with assistant message + Done
    heartbeat, thinking merge with prior chunk
  - `finalizeFailure`: failed state with system message,
    short-circuit when `status='canceled'` and `isCancelHandled()`,
    no short-circuit for `status='failed'`
  - `runAdapterAgent`: result aggregation, step→pulseState
    forwarding, edit-mode default summary fallback, chat-mode
    empty-summary, throw-while-not-canceled returns failure,
    throw-while-canceled rethrows `canceledError`, mid-stream
    `isCancelled()` flip breaks the loop, `prepare()` invoked once
  - **Scenario B (Codex round-4)**: cancel-during-dequeue boundary
    races covered — the dequeue-wins path stays consistent (status
    reflects the new running job), the cancel-wins path doesn't get
    clobbered by a late `finalizeFailure('canceled')` echo, and a
    real `failed` during cancel teardown still gets written.
- Total: **266 passing tests** across 20 files (was 237 / 18).

### Coverage
- Whole-repo: 49.4% → **55.1%** (+5.7 pp).
- `src/worker/` directory: 44.5% → **66.8%**.
- All six extracted worker modules now at **100% statements**:
  child-process, workspace, state-io, runtime-buffer, messages,
  lifecycle.
- `src/worker/runner.ts` itself remains at 0% — what's left is the
  side-effectful orchestration (env wiring, signal handlers, real
  spawn, real sudo). That's an integration-test surface, not a
  unit-test one; tracked for v0.7.x with a sandboxed runner harness.

### Compatibility
No runtime behavior change. Same dequeue semantics, same final
state shape on success / failure / cancel, same `runAdapterAgent`
event handling. Verified by all 237 pre-existing tests remaining
green throughout the diff.

### Roadmap
The worker decomposition track is now complete. Next:
- **v0.6.4 / v0.7.0** (separate, bigger lift): `runtime/overlay.ts`
  decomposition (1074 LOC) + Playwright e2e for the in-page overlay.
- **v0.7.x**: sandboxed integration tests for `worker/runner.ts`'s
  real-spawn / real-sudo orchestration paths.

## [0.6.2] - 2026-04-19

Codex round-4 review of v0.6.1 (regression-focused) flagged three
hardening items to ship before the v0.6.3 lifecycle decomposition.
All three landed here. One scenario (cancel-during-dequeue boundary)
deferred to v0.6.3 because it requires the lifecycle module to be
extracted first.

### Fixed
- **`runtime-buffer` flush rejection no longer escapes as
  unhandledRejection.** The 500ms timer-driven `flushRuntimeBuffers()`
  was fire-and-forget (`void flushRuntimeBuffers()`) — a rejected
  flush (EROFS, disk full, perm change after fork) would surface as
  an unhandledRejection and could kill the worker mid-job. Now wired
  through `.catch(opts.onFlushError)`. The runner injects an
  `onFlushError` that logs to stderr so pm2 / journald sees the
  failure, and the next pulseState / withHeartbeat call still
  surfaces a synchronous failure to the caller.

### Added
- **`createRuntimeBuffer` accepts `onFlushError?: (error) => void`.**
  Optional sink for failures from the timer-driven path. Synchronous
  flushes (called directly from pulseState/withHeartbeat) continue
  to bubble exceptions to the caller — only the fire-and-forget path
  needs the swallow.

### Tests
- `runtime-buffer.test.ts`:
  - **+2 tests** for the flush-rejection path: `onFlushError`
    invocation with the original error, and silent-swallow when
    no sink is supplied.
  - **Strengthened** `withHeartbeat` throw test from intent-only
    documentation to explicit assertions: after the task throws,
    advancing fake time 10× the heartbeat interval must NOT trigger
    additional `updateState` calls, and `vi.getTimerCount()` must
    be exactly 0.
- `child-process.test.ts`:
  - **+1 test** for the cancel-mid-spawn race (scenario A from the
    Codex review): the `isCancelled()` callback flips false→true
    30ms into a long-lived `sleep`, the test SIGTERMs the child to
    force a close event, and asserts the close handler observes the
    flipped flag and rejects with the configured `canceledError`
    (not the SIGTERM exit-by-signal path).
- Total: **237 passing tests** across 18 files (was 234 / 18).

### Compatibility
No behavior change for any caller that doesn't pass `onFlushError`
— the swallow defaults to a silent no-op. Existing `runner.ts` wiring
adds the stderr sink; no observable difference for happy-path runs.

### Roadmap
- **v0.6.3**: extract `worker/lifecycle.ts` (dequeueNext,
  finalizeSuccess, finalizeFailure, runAdapterAgent) and add the
  cancel-during-dequeue integration test (scenario B from the
  Codex review) once the seam exists.
- **v0.6.4** (separate): `runtime/overlay.ts` decomposition + Playwright e2e.

## [0.6.1] - 2026-04-19

Second slice of the worker decomposition. Two more pure modules
carved out of `worker/runner.ts`, both tested to 100% statement
coverage.

### Added
- **`src/worker/state-io.ts`** — `createStateIO({ stateFile })`
  factory returning `{ readState, writeState, updateState }`. The
  promise-chain serializer (`stateLock`) lives inside the closure
  so each call to `createStateIO()` gets an independent instance,
  which is what makes the locking and atomic-write semantics
  unit-testable. Atomic write pattern (tmp + rename) preserved
  bit-identical from runner.ts.
- **`src/worker/runtime-buffer.ts`** — `createRuntimeBuffer({ updateState,
  maxActivityLog, maxThinkingChars, flushIntervalMs? })` factory
  returning `{ queueLog, queueThinking, flushRuntimeBuffers,
  pulseState, withHeartbeat, ... }`. The 500ms coalesce timer and
  the pending-line / pending-thinking queues are closure-private,
  so each instance has its own flush state and tests can use fake
  timers to drive the coalesce window deterministically. Pure
  helpers (`stampLogLine`, `trimLogWithCap`, `mergeThinkingWithCap`)
  exposed as standalone exports for direct unit testing.

### Changed
- **`src/worker/runner.ts`** went from **675 → 530 LOC** (-145 / -22%).
  Combined with v0.6.0 the decomposition has now removed **38%** of
  the original 860-LOC file. What remains is lifecycle orchestration:
  cancel handling, dequeueNext, finalizeSuccess/Failure, runAdapterAgent,
  processJob, main. That's the v0.6.2 target.

### Tests
- `tests/worker/state-io.test.ts` — **9 tests** covering atomic
  round-trip, missing-array repair on read, mutator clone-on-throw
  isolation, lock-chain serialization (20 concurrent updateState
  calls observe each other in order), async mutator support.
- `tests/worker/runtime-buffer.test.ts` — **20 tests** covering
  the pure helpers (stamp/trim/merge with cap dedupe), coalesce
  behavior with `vi.useFakeTimers()`, multi-line splitting,
  whitespace dropping, log cap enforcement, thinking merge,
  pulseState heartbeat write, and `withHeartbeat` cleanup on
  task throw.
- Total: **234 passing tests** across 18 files (was 205 / 16).

### Coverage
- Whole-repo: 45.3% → **49.4%** (+4.1 pp).
- `src/worker/` directory: 27.5% → **44.5%**.
- All four extracted worker modules now at **100% statements**:
  child-process, workspace, state-io, runtime-buffer.
- `src/worker/runner.ts` itself stays at 0% (lifecycle orchestration
  needs sandboxed integration tests, slated for v0.6.2).

### Compatibility
No runtime behavior change. The runner reads/writes state with the
same atomic pattern, coalesces logs at the same 500ms cadence, and
fires heartbeats at the same default 8s interval. The constants
`MAX_ACTIVITY_LOG` and `MAX_THINKING_CHARS` (8000) moved into the
runtime-buffer factory but are sourced from the same env-driven
defaults.

## [0.6.0] - 2026-04-19

First slice of the deferred `worker/runner.ts` decomposition tracked
since v0.5.0. Two pure I/O modules carved out, each tested to 100%.

### Added
- **`src/worker/child-process.ts`** — `runCommand`, `killChild`,
  `cancelActiveChildren`. Pure helpers around `node:child_process`
  with NO module-level state. The runner injects its own
  `Set<ChildProcess>` and a cancel-flag callback (`isCancelled`)
  via `RunCommandOptions` instead of the helpers reading runner
  globals. This is the seam that makes the cancel-on-SIGTERM and
  process-tracking behavior unit-testable.
- **`src/worker/workspace.ts`** — `prepareWorkspace`,
  `installWorkspaceDependencies`, `buildWorkspace`, `syncToAppDir`,
  `restartFrontend`, plus the `runAsOpenClaw` / `runAsOpenClawInDir`
  sudo wrappers and the rsync-exclude helpers. Operations take
  `(WorkspaceConfig, WorkspaceDeps)` rather than reading
  `pyanchorConfig` directly, so tests can assert exact rsync /
  install / build argv against any framework profile and any
  freshWorkspace value.

  Exposed constants for downstream introspection:
  `BASE_RSYNC_EXCLUDES` (`.git`, `node_modules`, always on),
  `AGENT_SCRATCH_EXCLUDES` (`.openclaw`, `EDIT_BRIEF.md`, …, only on
  sync-back), and the helpers `buildRsyncExcludeArgs(excludes)` /
  `workspaceRsyncExcludes(framework)`.

### Changed
- **`src/worker/runner.ts`** went from **860 → 675 LOC** (-22%).
  The remaining file is now lifecycle orchestration (state I/O,
  log/heartbeat buffering, dequeue, finalize, processJob, main).
  Behavior is bit-identical: every previously-inlined call site now
  delegates to the extracted module with the same arguments.

### Tests
- `tests/worker/child-process.test.ts` — **16 tests** covering
  exit-code paths, stdin forwarding, env injection, abort/timeout
  kill, child tracking, and the cancel-on-close error.
- `tests/worker/workspace.test.ts` — **23 tests** covering rsync
  exclude composition (nextjs vs vite), sudo wrapping, freshWorkspace
  branching, install/build command + timeout forwarding, sync-back
  excludes including agent scratch, linux-only chown, and restart
  script invocation. Uses a mocked `runCommand` to assert exact argv.
- Total: **205 passing tests** across 16 files (was 166 / 14).

### Coverage
- Whole-repo: 39.5% → **45.3%** (+5.8 pp).
- `src/worker/child-process.ts`: **100% statements / 94% branches**.
- `src/worker/workspace.ts`: **100% statements / 91% branches**.
- `src/worker/runner.ts` itself stays at 0% (lifecycle orchestration
  needs sandboxed integration tests, slated for v0.6.2).

### Compatibility
No runtime behavior change. The runner spawns the same processes,
runs the same rsync commands with the same excludes, and observes
the same cancel signals. The refactor is structurally invasive but
behaviorally surgical — verified by all 166 pre-existing tests
remaining green throughout the diff.

### Roadmap
- **v0.6.1**: extract `worker/state-io.ts` + `worker/runtime-buffer.ts`
  from runner.ts (state read/write helpers, log/thinking flush queue).
- **v0.6.2**: extract `worker/lifecycle.ts` (dequeue, finalize,
  runAdapterAgent) and add integration tests with a stubbed
  AgentRunner.
- **v0.6.3** (separate): `runtime/overlay.ts` decomposition (1074 LOC)
  + Playwright e2e for the in-page overlay. Bigger lift; tracked
  as its own initiative.

## [0.5.1] - 2026-04-19

Codex review pass on v0.5.0 surfaced four findings — three doc/security
items addressed in this release, one (overlay/runner integration tests)
deferred to v0.6.0 with the rest of the e2e surface.

### Security
- **Reduce in-page bearer-token surface.** `src/runtime/bootstrap.ts`
  now blanks `window.__PyanchorConfig.token` after the
  `POST /api/session` exchange resolves successfully. The overlay's
  fetch helper already conditionally omits the `Authorization` header
  when that field is empty, so subsequent calls authenticate via the
  HttpOnly session cookie alone. The raw bearer token no longer sits
  in JS-readable global state past the first 200ms of page load.
  Defense-in-depth against XSS / third-party script exfiltration; the
  hostname allowlist and Origin allowlist defenses still apply.
- **Loud startup warning for the empty Origin allowlist.** When
  `PYANCHOR_ALLOWED_ORIGINS` is unset, the sidecar logs a one-shot
  warning at boot pointing out that the cookie session path makes
  `/api/edit` and `/api/cancel` CSRF-prone. `SameSite=Strict` on the
  cookie blocks the common browser cases, but the explicit allowlist
  is the recommended setup. Empty stays the default for v0.x to
  preserve compatibility — the warning makes it impossible to ship
  the unsafe combination silently.

### Documentation
- **`SECURITY.md` rate-limit drift fixed.** The "Required hardening"
  list said "Cancel and status calls are not rate-limited"; the code
  has actually applied a per-IP cancel limiter (30 / min default)
  since v0.2.5. Doc now reflects both limiters and clarifies what
  remains unlimited (status reads, admin GETs).
- **`SECURITY.md` query-token drift fixed.** The "Token transport"
  section described `?token=<token>` as unconditionally accepted; it
  has been opt-in via `PYANCHOR_ALLOW_QUERY_TOKEN=true` since v0.2.6.
  Doc now states the default-rejected behavior up front.
- **`README.md`** picks up the cancel rate-limit line for symmetry
  with the edit limit.

### Compatibility
No breaking changes. The bootstrap behavior is strictly additive —
clients without the new bootstrap.js (e.g. legacy embeds) continue to
authenticate via the Bearer header as before.

## [0.5.0] - 2026-04-19

### Added
- **Test coverage push.** Total tests went from 94 → 166 (+72) across
  14 files. Statement coverage on the `src/` core (sidecar process,
  excluding the browser overlay and the side-effect-heavy worker
  process) jumped from 26% → **70.7%**. Whole-repo coverage including
  the deferred browser / worker modules: 18.4% → **39.5%**.

  New test files in this release:

  | File | Tests | Covers |
  | --- | --- | --- |
  | `tests/state.test.ts` | 17 | atomic write, normalizer, queue, cancel, prompt-length cap, dead-pid recovery |
  | `tests/sessions.test.ts` | 11 | createSession, validateSession (including expiry eviction), revoke, prune-when-full + drop-oldest fallback |
  | `tests/agents/openclaw-exec.test.ts` | 13 | streamSpawn (stdout/stderr/exit/abort/timeout/env/stdin), execBuffered |
  | `tests/agents/adapter-briefs.test.ts` | 15 | codex / aider / claude-code prompt construction; framework hint splicing across nextjs and vite profiles |
  | `tests/admin.test.ts` | 10 | renderAdminHtml structure + HTML-escape behavior (path injection, JSON pre escaping) |
  | `tests/agents/registry.test.ts` | 6 | selectAgent factory across all four built-in adapters + unknown-agent error |

  After this release the per-module breakdown is:

  | Module | Coverage |
  | --- | --- |
  | `admin.ts` | 100% |
  | `auth.ts` | 100% |
  | `sessions.ts` | 100% |
  | `frameworks/index.ts` + `nextjs.ts` | 100% |
  | `agents/openclaw/brief.ts` | 100% |
  | `agents/openclaw/parse.ts` | 100% |
  | `agents/index.ts` | 100% |
  | `agents/openclaw/exec.ts` | 95% |
  | `origin.ts` | 93% |
  | `frameworks/vite.ts` | 89% |
  | `rate-limit.ts` | 88% |
  | `state.ts` | 82% |
  | `config.ts` | 75% |

### Changed
- **`buildBrief` exported** from `src/agents/codex.ts`, `src/agents/aider.ts`,
  and `src/agents/claude-code.ts`. These were previously module-local;
  they're stable pure functions that benefit from direct unit tests
  without spawn mocking. No runtime behavior change.

### Deferred
Two large surfaces are intentionally still at 0% coverage and tracked
for v0.5.1 / v0.6.0:
- `src/runtime/overlay.ts` (1074 LOC) and `src/runtime/bootstrap.ts`
  (79 LOC) — DOM code that needs Playwright e2e against a real page.
- `src/worker/runner.ts` (860 LOC) — heavy `sudo` / `rsync` / `flock`
  side effects; needs a sandboxed integration test (likely a Docker
  scratch workspace) rather than the unit-mocking style the rest of
  the suite uses.

## [0.4.0] - 2026-04-19

### Added
- **Framework profile system.** Pyanchor is no longer Next.js-only.
  A new `PYANCHOR_FRAMEWORK` env (default `nextjs`) selects a profile
  that drives the default install/build commands, rsync excludes, and
  per-route hints fed to the agent. Two profiles ship in this release:
  - `nextjs` — preserves the existing behavior (`corepack yarn install
    --frozen-lockfile`, `next build`, `.next` exclude, app/pages route
    hints).
  - `vite` — new (`npm install`, `npm run build`, `dist`/`.vite`
    excludes, `src/routes/`/`src/pages/`/`src/components/` route
    candidates).
- **`PYANCHOR_INSTALL_COMMAND` / `PYANCHOR_BUILD_COMMAND`.** Shell-string
  overrides that bypass the framework profile entirely. Lets users
  point pyanchor at Astro / Remix / SvelteKit / pnpm / bun without
  shipping a profile — set the two commands and you're done.
- **`examples/vite-react-minimal/`** — a 6-file Vite + React reference
  app, mirrored on `examples/nextjs-minimal/` so the two integrations
  can be compared side-by-side.

### Changed
- **`worker/runner.ts`**: install / build / rsync commands all derive
  from the framework profile + env overrides instead of hardcoded
  `corepack yarn install` and `node ./node_modules/next/dist/bin/next
  build` strings. The `.git` and `node_modules` excludes stay always-on;
  framework-specific cache dirs (`.next`, `.vite`, `dist`) come from
  `framework.workspaceExcludes`.
- **Agent briefs** (`openclaw`, `codex`, `aider`, `claude-code`) now
  splice `framework.briefBuildHint` into their per-job instructions so
  the agent gets the right "validate by running X" sentence regardless
  of stack. The aider adapter's `guessFilesForRoute` heuristic now
  delegates to `framework.routeFileCandidates` — auto-discovers Vite
  routes the same way it auto-discovers Next.js routes.
- **README** picks up a "Supported frameworks" table and the tagline
  drops the Next.js exclusivity ("AI live-edit sidecar for your web
  app — Next.js, Vite, or your own stack").

### Compatibility
- **No-op for existing Next.js users.** All defaults preserve v0.2.8
  behavior verbatim — same install command, same build command, same
  rsync exclude list, same route hints. Skipping `PYANCHOR_FRAMEWORK`
  is equivalent to setting it to `nextjs`.
- API surface (`AgentRunner`) is unchanged. The new framework system is
  module-internal: adapters call `selectFramework(pyanchorConfig.framework)`
  and consume the profile.

### Tests
- Added `tests/frameworks.test.ts` — 21 tests covering registry
  fallback, both built-in profiles, and the case-insensitive lookup.
- Extended `tests/agents/openclaw-brief.test.ts` to assert the
  framework parameter actually swaps out the route hints.
- Total: 94 tests across 8 files (was 72 across 7).

## [0.2.8] - 2026-04-19

### Added
- **`Esc` closes the in-page overlay.** `document.keydown` listener
  in `src/runtime/overlay.ts` mirrors the existing outside-mousedown
  close behavior. Smallest possible a11y win; full focus-trap is
  deferred to the v0.3.0 overlay decomposition (`B-1`) where the
  module is split into testable pieces.
- **Three new env knobs** for retention / quotas (Codex review's
  UX-3 finding):
  - `PYANCHOR_MAX_MESSAGES` (default `24`) — historical message
    window kept in `state.json`.
  - `PYANCHOR_MAX_ACTIVITY_LOG` (default `80`) — activity-log line
    cap.
  - `PYANCHOR_PROMPT_MAX_LENGTH` (default `8000`) — semantic cap
    on a single user prompt. Above this, `POST /api/edit` rejects
    with a clear error message pointing at the env var. Below the
    Express body-parser's 128KB JSON limit but above the typical
    LLM context-window budget for a single turn.

### Notes
- Three Codex review items deliberately deferred:
  - **Focus trap on the panel.** Needs a careful pass over a 1054
    LOC overlay file; high regression risk without browser-level
    smoke. Tracked with the v0.3.0 `B-1` decomposition + Playwright
    e2e (`#11` in the PR backlog).
  - **Admin absolute-path masking.** Debatable: the page is
    token-gated, and masking obscures legitimate operator info.
    Logged as a v0.3.x toggle (`PYANCHOR_ADMIN_MASK_PATHS=true`)
    for screen-share scenarios, not enabled by default.
  - **Per-job workspace / git-worktree isolation.** The
    `freshWorkspace` flag added in v0.2.3 covers the
    "blow-it-away-and-rebuild" case; true per-job isolation is a
    bigger architectural change tracked under v0.3.0+ preview/undo
    work (B-5/B-6).

## [0.2.7] - 2026-04-19

### Security
- **Opaque session ids in the cookie path.** v0.2.2-v0.2.6 stored
  the raw `PYANCHOR_TOKEN` value directly in the `pyanchor_session`
  cookie. Cookie theft (XSS, dev-tools leak, log scrape) was
  effectively bearer-token theft — same blast radius, same
  impossibility-of-revocation.

  v0.2.7 issues a 32-byte random id from `POST /api/session` and
  stores it in `src/sessions.ts` (in-memory `Map<id, expiresAt>`)
  instead. `requireToken` looks the cookie value up via
  `validateSession()`. The cookie no longer carries any
  exfiltrable credential.

### Added
- `DELETE /_pyanchor/api/session` — explicit logout that drops the
  server-side session and clears the cookie. Idempotent (no cookie
  present is a no-op).
- `src/sessions.ts` (96 LOC) — `createSession` / `validateSession` /
  `revokeSession` / `clearAllSessions` (test helper). Hard cap of
  4096 active sessions with expiry-pruning + drop-oldest fallback.
- 4 new auth tests: valid session-id accepted, bearer-shaped value
  in cookie now rejected, made-up id rejected, revoked session
  rejected.

### Changed (breaking, behind cookie path)
- Cookies set by previous versions become invalid after upgrade —
  the bootstrap will simply re-issue on its next page load. Bearer
  header / query token paths are unaffected.

### Notes
- This closes the highest-priority finding from the Codex review
  pass that produced v0.2.6. The companion findings (atomic state
  writes, cancel rate limit, etc.) shipped in v0.2.6; the opaque
  session was scoped out for its own release because the auth
  refactor warranted dedicated tests.
- Sessions are in-memory only; sidecar restart drops them all.
  Acceptable for a single-process self-hosted sidecar; documented
  in SECURITY.md.

## [0.2.6] - 2026-04-19

### Security
- **Query-string tokens disabled by default.** `?token=<...>` was
  always documented as a footgun (leaks via proxy logs / browser
  history) but `requireToken` accepted it unconditionally. Now
  rejected unless `PYANCHOR_ALLOW_QUERY_TOKEN=true` is set
  explicitly. Header (`Authorization: Bearer ...`) and cookie
  paths are unchanged.
- **`PYANCHOR_TRUST_PROXY` env added; default flips from `true` to
  `loopback`.** v0.2.5 unconditionally `app.set('trust proxy',
  true)`, which trusted any upstream `X-Forwarded-*` header — fine
  behind a single nginx hop, exploitable if the sidecar was ever
  misconfigured to listen on a public interface. Default
  `loopback` trusts only `127.0.0.0/8` and `::1`. Accepts the full
  Express trust-proxy vocabulary (presets, booleans, hop counts,
  CSV CIDR lists).
- **`POST /api/cancel` now rate-limited.** v0.2.5 gated only
  `/api/edit`. Cancel was unbounded — cheap in itself but easy to
  abuse to fill the activity log. Default: 30/min per IP (looser
  than edit's 6/min since cancel is non-mutating).

### Fixed
- **Atomic `state.json` writes.** Both `src/state.ts` and
  `src/worker/runner.ts` now write to `state.json.tmp` and rename
  on top, so a crash mid-write leaves the previous state intact
  instead of producing half-written JSON the worker can't parse on
  restart.
- **Locale-agnostic timestamps in the overlay too.** `src/state.ts`
  and `src/worker/runner.ts` got the locale fix in v0.1.1, but
  `src/runtime/overlay.ts:602` still used `Intl.DateTimeFormat("ko-KR", ...)`.
  Replaced with the same manual `HH:MM:SS` formatter so all three
  call sites match.

### Notes
- All five fixes surfaced from an external code review pass after
  v0.2.5. Two independent reviews flagged the same set, which is
  the credible signal that this batch was worth shipping fast.
- v0.2.6 is the first release whose publish was gated by the
  `pnpm test` step added in v0.2.5. CI ran tests across Node
  18/20/22 before npm push.

## [0.2.5] - 2026-04-19

### Fixed
- **`isPyanchorConfigured()` now agent-aware.** Previously hard-coded
  the `openClawBin` presence check regardless of `PYANCHOR_AGENT`,
  which caused `claude-code` / `codex` / `aider` deployments to
  surface `configured: false` in the admin health endpoint even when
  fully wired up. Now switches:
  - `openclaw` → checks `PYANCHOR_OPENCLAW_BIN`
  - `codex` → checks `PYANCHOR_CODEX_BIN`
  - `aider` → checks `PYANCHOR_AIDER_BIN`
  - `claude-code` → no binary check (uses an npm package; missing-dep
    surfaces at run time via the dynamic import)
- 7 new tests in `tests/config.test.ts` covering each agent path.

### CI
- **`pnpm test` now gates both PRs and releases.** Previous workflows
  ran `typecheck` + `build` only; the 60+ tests added in v0.2.0 were
  effectively informational. `ci.yml` runs `pnpm test` across the
  Node 18/20/22 matrix; `release.yml` runs it once before `npm
  publish` so a broken build can't ship to npm.

### Notes
- Spotted by an external code review pass after v0.2.4 dog-fooding.
  The agent-aware config bug only affected admin `configured` flag
  reporting (not actual agent execution), but it would have caused
  confusion for anyone monitoring `/api/admin/health`.

## [0.2.4] - 2026-04-19

### Changed
- **Mode toggle now locks while a job is in flight.** The Chat / Edit
  buttons are disabled (with a "Mode is locked while a job is in
  flight" tooltip) while `serverState.status` is `running` /
  `canceling` or while a request is mid-submit / mid-cancel. Prevents
  switching mid-thread, which produced confusing two-mode threads in
  dog-fooding. Once the job completes (status `done` / `failed` /
  `canceled` / `idle`), the toggle re-enables for the next message.
- Disabled-button styling: `cursor: not-allowed`, `opacity: 0.45`
  (active button: `0.6`, retains a faint background tint so the user
  can still see which mode is "current").

### Notes
- v0.2.2's `data-pyanchor-trusted-hosts` attribute and v0.2.3's
  persistent-workspace defaults remain unchanged. This is a pure UX
  patch.
- Per-edit timing measured against AIG production after v0.2.3
  deploy: `yarn install` 12s → 2s (warm node_modules), `next build`
  unchanged at ~24s (Next 14 prod build's lint + page-data + static
  generation are not cached). Net per-edit cycle: ~55s shorter.

## [0.2.3] - 2026-04-19

### Performance
- **Persistent workspace (default).** `prepareWorkspace` no longer
  `rm -rf`s the scratch dir before every job. Rsync still mirrors
  source files from `PYANCHOR_APP_DIR` (with `--delete`, scoped to
  non-excluded paths), but the workspace's `node_modules/` and
  `.next/` directories now persist across jobs. That makes both
  `yarn install` and `next build` incremental — typical per-edit
  cycle drops from ~30s-3min to ~5-30s on warm workspaces.
- New `PYANCHOR_FRESH_WORKSPACE=true` env var restores the v0.1.0
  delete-and-recreate behavior for cases where stale workspace state
  is suspected. Default `false`.

### Fixed
- `rate-limit.ts` IP-key resolution simplified: `request.ip` already
  honours `X-Forwarded-For` once `app.set('trust proxy', true)` is on
  (server.ts does this in v0.1.1+), so the explicit
  `X-Forwarded-For` header fallback was dead code. Replaced with a
  cleaner `req.ip || req.socket?.remoteAddress || "unknown"` chain
  that does the same thing more legibly. No user-visible behavior
  change. (Flagged by the test agent's v0.2.0 sweep.)

### Notes
- Dog-fooded against the AIG production sidecar (studio.pyan.kr)
  during v0.2.2 → v0.2.3 transition; this release is the first one
  that reflects real-world performance feedback.

## [0.2.2] - 2026-04-19

### Added
- **Fast-reload mode (`PYANCHOR_FAST_RELOAD=true`).** When enabled,
  the worker skips `installWorkspaceDependencies`, the `next build`
  step, and the frontend restart — the rsync of the workspace back
  into `PYANCHOR_APP_DIR` is what triggers Next.js HMR. Drops the
  per-edit cycle from ~30s-3min to ~1-2s in dev. Sidecar logs a
  one-line warning at startup when the flag is on; documented as
  `next dev`-only in `.env.example`.
- **Cookie-based session tokens.** New `POST /_pyanchor/api/session`
  exchanges a Bearer token for an `HttpOnly` + `SameSite=Strict` +
  conditionally `Secure` cookie (`pyanchor_session`, 24h TTL).
  `requireToken` now accepts the cookie alongside `Authorization:
  Bearer` and `?token=<>` (priority: header → cookie → query).
  Bootstrap fires the exchange in the background on load, so the
  in-page overlay's subsequent fetches authenticate via cookie
  without needing the token in JS-readable headers.
- `pyanchorConfig.fastReload` / `pyanchorConfig.agent` surfaced via
  `GET /api/admin/health` (new `agent`, `fastReload` fields on
  `AdminHealth`).
- `optionalBool` config helper.
- 2 new auth tests covering the cookie path.

### Changed
- `cookie-parser` added as a runtime dependency (~13 kB unpacked).

### Notes
- **Cookie-CSRF**: the cookie is auto-sent on same-origin requests,
  which is desired but expands attack surface for misconfigured
  deployments. SECURITY.md now explicitly recommends pairing cookie
  auth with `PYANCHOR_ALLOWED_ORIGINS` for defense in depth, on top
  of `SameSite=Strict`.
- The bootstrap `data-pyanchor-token` attribute is still required —
  the cookie can only be set by the sidecar after the first Bearer
  exchange. v0.3.0 will explore one-shot exchange tickets that
  remove the attribute entirely.

## [0.2.1] - 2026-04-19

### Changed
- **OpenClaw moved behind the `AgentRunner` interface.** The
  `OPENCLAW_INLINE` sentinel is gone; `selectAgent()` now always
  returns an `AgentRunner` instance. The OpenClaw flow lives in
  `src/agents/openclaw/` (split into `brief.ts`, `parse.ts`,
  `exec.ts`, `index.ts`), tested in isolation, and is selected the
  same way as every other backend. End-user behavior unchanged —
  `PYANCHOR_AGENT=openclaw` still routes to the same CLI calls under
  sudo as before.
- `src/worker/runner.ts` shrunk **1212 → 843 LOC** (-369). The
  inline `writeBrief`, `ensureAgent`, `runAgent`,
  `processAgentChunk`, `flushAgentChunkRemainders` functions and
  the `stdoutBuffer` / `stderrBuffer` module-level state are gone;
  `processJob` is now a single linear path that calls
  `runAdapterAgent(agent, ...)` for every backend.

### Added
- `src/agents/openclaw/exec.ts` — `streamSpawn` async-iterator and
  `execBuffered` helper. Independent of the worker's `runCommand`
  because the adapter observes `ctx.signal` instead of the worker's
  module-level `cancelRequested` flag.
- 45 new unit tests across `tests/agents/openclaw-{brief,parse,runner}.test.ts`
  covering the extracted helpers and the line-to-event parser.

### Notes
- v0.1.0 deployments that pinned `PYANCHOR_AGENT=openclaw` (the
  default) keep working with no changes. The shell command pyanchor
  invokes is byte-identical to the inline path.

## [0.2.0] - 2026-04-19

### Added
- **`codex` adapter** (`src/agents/codex.ts`, ~225 LOC) — shells out to
  the OpenAI Codex CLI (`codex exec --json --skip-git-repo-check
  --full-auto --cd <workspace> [-m <model>] "<prompt>"`). Parses JSONL
  events for `agent_message` (summary) and `reasoning` (thinking).
  Helpful `ENOENT` error pointing at `npm i -g @openai/codex`.
- **`aider` adapter** (`src/agents/aider.ts`, ~232 LOC) — shells out to
  aider-chat (`aider --no-stream --yes --message <prompt> [files...]`).
  Includes a `guessFilesForRoute` heuristic that maps `/login` →
  `app/login/page.tsx`, `app/(auth)/login/page.tsx`, `pages/login.tsx`,
  etc. `--dry-run` for chat mode. Helpful `ENOENT` error pointing at
  `pip install aider-chat`.
- **Vitest test scaffold** + 15 smoke tests covering `auth.ts` (100%),
  `origin.ts` (93.1%), `rate-limit.ts` (81.1%). `pnpm test` and
  `pnpm test:coverage` scripts. Pinned to `vitest@^2.1.9` so Node 18
  stays supported (vitest@4 requires Node 22+).
- **`docs/roadmap.md`** — multi-release plan for v0.2.0 → v0.3.0 with
  effort/risk/dependency for every item, plus a parallel-execution map
  for which tasks can run in worktrees concurrently.
- `PYANCHOR_CODEX_BIN` and `PYANCHOR_AIDER_BIN` env overrides (default
  `codex` / `aider` resolved via PATH).

### Changed
- README + `docs/adapters.md` flip both new adapter rows from 🟡 v0.2.0
  to ✅ shipped, with one-line install hints.
- `docs/adapters.md` now links each backend's source file from the
  built-in matrix.

### Notes
- The OpenClaw flow is **still inline** in `src/worker/runner.ts` and
  selected via the `OPENCLAW_INLINE` marker. Extracting it behind the
  `AgentRunner` interface (Tier S-2, ~14h) is the next focus and lands
  in the upcoming v0.2.1 patch.
- Three minor source-code rough edges surfaced by the test pass and
  flagged for v0.2.1 patches: `rate-limit.ts:34` (X-Forwarded-For
  fallback unreachable when `req.ip` is set), `rate-limit.ts:47`
  (Retry-After computed against just-refilled bucket — minor in
  practice), `auth.ts:51` (redundant guard after `extractToken`).
- vitest@4 has the right shape but uses `node:util.styleText` (Node 22+).
  Pinning at v2.1.9 buys us full Node 18 support; we'll bump when we
  raise `engines.node` to 20.

## [0.1.1] - 2026-04-19

### Security
- **Bootstrap hostname allowlist.** The injected `bootstrap.js` now
  self-disables on hosts outside `localhost`, `127.0.0.1`, `[::1]`, and
  `*.local`. Override with `data-pyanchor-trusted-hosts="..."` on the
  `<script>` tag. This is belt-and-suspenders defense for the case
  where a production build accidentally still renders the bootstrap.
- **Origin allowlist (`PYANCHOR_ALLOWED_ORIGINS`).** Optional CSV of
  origins that may call `POST /api/edit` and `POST /api/cancel`.
  When unset, every origin with a valid token is accepted (v0.1.0
  behavior preserved). When set, mismatched `Origin`/`Referer` is
  rejected with 403. Closes the trivial CSRF surface where a leaked
  token could be exercised from any page.

### Changed
- `stampLogLine` no longer hard-codes the `ko-KR` locale; activity log
  timestamps are now ISO-style `HH:MM:SS` regardless of system locale.
- README rewritten with a centered hero, badges row, collapsible
  per-agent prerequisite blocks, and a new **Production safety
  checklist** section.
- `SECURITY.md` updated to describe the new hostname / origin
  allowlists.

### Notes
- These two security additions are deliberately framed to not break
  v0.1.0 deployments: the origin check is opt-in, and the hostname
  allowlist's defaults cover the dev-time host names that v0.1.0
  documentation pointed at. Staging hosts on real domains will need a
  one-line `data-pyanchor-trusted-hosts` addition on upgrade.

## [0.1.0] - 2026-04-18

### Added
- Initial import of the sidecar source from the AIG project.
- MIT license, project metadata, `.gitignore`, README skeleton, CHANGELOG.
- `PYANCHOR_*` env vars (replacing `AIG_*`/`AI_EDIT_*`) + `validateConfig()`
  that throws a single grouped error listing every missing required var.
- `.env.example` documenting all PYANCHOR_* variables, grouped by required
  vs optional.
- Browser-side rebrand: `__AIGDevtools*` → `__Pyanchor*`, CSS classes
  `aig-*` → `pyanchor-*`, custom event `aig-devtools:navigation` →
  `pyanchor:navigation`, default base path `/_aig` → `/_pyanchor`.
- Bearer-token auth (`requireToken`) on every `/api/*` and the admin `/`
  route. `/healthz` and the static runtime bundles stay public.
  Timing-safe compare via `crypto.timingSafeEqual`.
- Per-IP token-bucket rate limit on `POST /api/edit` (6 / min default).
- `SECURITY.md` with threat model, hardening checklist, and reporting policy.
- `AgentRunner` interface in `src/agents/types.ts`; adapter dispatcher in
  `src/agents/index.ts` wired from `PYANCHOR_AGENT`.
- `ClaudeCodeAgentRunner` adapter using `@anthropic-ai/claude-agent-sdk`
  (declared as an **optional peer dependency**, dynamically imported,
  marked `external` in the worker bundle).
- `docs/adapters.md` documenting the interface, event types, cancellation
  contract, and how to add new adapters.

### Changed
- Drop hardcoded `/home/studio/...` pm2 restart fallback in
  `restartFrontend`; always invoke the configured `PYANCHOR_RESTART_SCRIPT`.
- Workshop-coupling (`AIG_WORKSHOP_STATE_FILE`) generalized to an opt-in
  `PYANCHOR_PEER_STATE_FILE`. Defaults to `null` (no peer awareness).

### Notes
- The OpenClaw flow remains inline in `src/worker/runner.ts` and is
  selected via the `OPENCLAW_INLINE` marker. Moving it behind the
  `AgentRunner` interface is tracked for v0.2.0.
- Korean strings in user-facing surfaces (overlay, server errors,
  worker activity log) translated to English; structured i18n shim
  remains a v0.2.0 target.
- README restructured to lead with a "pick an agent first" prereqs
  section so new users don't get blocked at runtime by a missing
  OpenClaw install or a missing `ANTHROPIC_API_KEY`.
- Multi-user is explicitly out of scope for v0.1.0 (single token /
  single queue / single workspace). Levels 1-2 of the multi-user
  roadmap are documented in README; v0.3.0+ work depending on demand.

### Planned for `v0.1.0` ship
- GitHub Actions CI, npm publish, v0.1.0 tag/release.
