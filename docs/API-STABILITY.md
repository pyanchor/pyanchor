# Public API surface — stability commitment

> **TL;DR for v0.22.0+:** This document enumerates every public
> surface pyanchor exposes. v0.x is still pre-1.0; we don't promise
> backwards compatibility on minor bumps yet. **At v1.0 the items
> marked `Stable @ 1.0` become the contract.** Breaking changes to
> them require a major bump.
>
> Items marked `Pre-1.0` are still under iteration. They may change
> in a v0.x minor without a deprecation window. We'll surface
> intent to break in CHANGELOG before the cut.
>
> Items marked `Internal` are not public. Anything not listed here
> is also internal — don't depend on it across versions.

## Why this matters

If you're considering pyanchor for anything beyond a personal
workflow — a team adoption, embedding it in another product, or
even just standing up a long-running deployment — you need to know
which knobs we'll keep stable across upgrades and which ones we
might rework.

This doc is the answer.

## Contract surfaces

### 1. Host-page globals

| Symbol | Status | Where defined | Notes |
|---|---|---|---|
| `window.__PyanchorConfig` | **Stable @ 1.0** | `src/runtime/bootstrap.ts` | `{ baseUrl: string, token: string, locale?: string }`. Locale is optional. We will not remove or rename existing fields without a major bump. May add new optional fields. |
| `window.__PyanchorBootstrapLoaded` | **Stable @ 1.0** | `src/runtime/bootstrap.ts` | Boolean idempotency guard set by bootstrap. Read-only from host code. |
| `window.__PyanchorOverlayLoaded` | **Stable @ 1.0** | `src/runtime/overlay.ts` | Same idempotency guard for overlay. |
| `window.__PyanchorPendingLocales` | **Stable @ 1.0** | `src/runtime/overlay/strings.ts` | Pre-overlay queue of `{ locale, bundle }` entries. Locale bundle modules push onto this; the overlay drains on boot. |
| `window.__PyanchorRegisterStrings(locale, bundle)` | **Stable @ 1.0** | `src/runtime/overlay/strings.ts` | Late-registration hook for locales loaded after the overlay. `locale` is case-insensitive. `bundle` is a `Partial<StringTable>` — only the keys you want to override. |
| `pyanchor:locale-registered` CustomEvent | **Stable @ 1.0** | `src/runtime/overlay/strings.ts` (`LOCALE_REGISTERED_EVENT`) | Fires after a late-registered locale bundle is added to the registry. `event.detail.locale` is the lowercased code. The overlay listens to re-render when the active locale's bundle arrives. |
| `#pyanchor-overlay-root` element id | **Stable @ 1.0** | `src/runtime/overlay/elements.ts` | The host element pyanchor mounts under `<body>`. Use this id to detect / inspect / hide the overlay from host code. The Shadow Root inside it is open mode; `host.shadowRoot` is reachable. |

### 2. Bootstrap script `data-` attributes

These attributes on the `<script src=".../bootstrap.js">` tag steer
how bootstrap behaves. All optional unless marked required.

| Attribute | Status | Notes |
|---|---|---|
| `data-pyanchor-token` | **Stable @ 1.0** | Required (or set `__PyanchorConfig.token` first). The bearer token used for the one-shot session-exchange POST. Bootstrap blanks it from `__PyanchorConfig` after the exchange returns 2xx. |
| `data-pyanchor-locale` | **Stable @ 1.0** | Locale code (e.g. `ko`, `pt-br`, `ar`). Built-in locales auto-load their bundle script before overlay. Unknown locales silently fall back to English. |
| `data-pyanchor-trusted-hosts` | **Stable @ 1.0** | CSV of hostname patterns. Bootstrap refuses to mount the overlay on hostnames not in this list. Default: `localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`. Patterns: exact match, `.local` suffix, `*.example.com` wildcard, `.example.com` suffix. |
| `data-pyanchor-require-gate-cookie` | **Stable @ 1.0** | Cookie name. When set, bootstrap refuses to mount unless `document.cookie` contains the named cookie with a non-empty value. Defense-in-depth fail-safe for production gating. |

### 3. Sidecar HTTP API

Routes mounted under `runtimeBasePath` (default `/_pyanchor`) and
`runtimeAliasPath` (default `/runtime`).

| Route | Method | Auth | Status | Notes |
|---|---|---|---|---|
| `/healthz` | GET | none | **Stable @ 1.0** | `{ ok: true }`. Liveness — always 200 if process is alive. Open even when gate cookie is required. |
| `/readyz` | GET | none | **Stable @ 1.0** | v0.27.0+. `{ ok, ready }`. 200 when `isPyanchorConfigured()` passes (workspace + app dir + restart script + agent CLI all resolvable), 503 otherwise. For k8s/orchestrator readiness probes. Open even when gate cookie is required. |
| `/_pyanchor/bootstrap.js` | GET | gate cookie if `requireGateCookie` | **Stable @ 1.0** | Bootstrap IIFE. |
| `/_pyanchor/overlay.js` | GET | gate cookie if `requireGateCookie` | **Stable @ 1.0** | Overlay IIFE. |
| `/_pyanchor/locales/:locale.js` | GET | gate cookie if `requireGateCookie` | **Stable @ 1.0** | Per-locale bundle IIFE. Whitelist + regex guarded. |
| `/_pyanchor/api/session` | POST | gate + origin + bearer | **Stable @ 1.0** | Exchange bearer token for HttpOnly opaque session cookie (`pyanchor_session`). Returns `{ ok: true, ttlMs }`. |
| `/_pyanchor/api/session` | DELETE | gate + origin | **Stable @ 1.0** | Logout. Clears session cookie + revokes server-side. |
| `/_pyanchor/api/status` | GET | gate + bearer/cookie | **Stable @ 1.0** | Returns the current `AiEditState`. Overlay polls at `POLL_INTERVAL_MS`. |
| `/_pyanchor/api/edit` | POST | gate + origin + bearer/cookie | **Stable @ 1.0** | Body: `AiEditStartInput`. Header: optional `X-Pyanchor-Actor` (≤256 chars; v0.27.0+ supports HMAC verification when `PYANCHOR_ACTOR_SIGNING_SECRET` is set — header value becomes `<actor>.<hex-sha256-hmac>`). Returns the new `AiEditState`. |
| `/_pyanchor/api/cancel` | POST | gate + origin + bearer/cookie | **Stable @ 1.0** | Body: `AiEditCancelInput`. |
| `/api/admin/health` | GET | gate + bearer/cookie | Pre-1.0 | `AdminHealth` JSON. Shape may change; admin surface is in flux. |
| `/api/admin/state` | GET | gate + bearer/cookie | Pre-1.0 | Same as `/api/status` for now. May be removed if duplicate. |
| `/api/admin/metrics` | GET | gate + bearer/cookie | Pre-1.0 | Cheap in-process operator metrics (v0.23.1+): `queue.depth` + `queue.oldestEnqueuedAt` + `currentJob` + `sessions.activeCount` + `recentMessages.byStatus` (last 50 messages) + `actorRejections` (HMAC actor verify failures since boot, by reason; v0.29.0+). Shape may change before 1.0; historical aggregations from `audit.jsonl` are a post-1.0 candidate. |
| `/` | GET | gate + bearer/cookie | Pre-1.0 | Renders the (minimal) admin HTML. |

### 4. Environment variables

The full list lives in [`.env.example`](../.env.example). Stability:

- **Stable @ 1.0** — every env that's currently in `.env.example`
  AND is referenced by a route or runtime behavior listed above.
  Renaming or removing one needs a major bump.
- **Pre-1.0** — anything in `.env.example` marked with a "advanced"
  / "internal" comment or scoped to admin routes (`PYANCHOR_AGENT_*`
  knobs may be reorganized as we add more adapters).

**Worker IPC envs** (`PYANCHOR_JOB_ID`, `PYANCHOR_JOB_PROMPT`,
`PYANCHOR_JOB_TARGET_PATH`, `PYANCHOR_JOB_MODE`, `PYANCHOR_JOB_ACTOR`,
`PYANCHOR_STATE_FILE_PATH`) are **Internal**. The sidecar sets them
when spawning the worker; don't set them yourself.

### 5. Worker `state.json` schema

Defined by `AiEditState` in `src/shared/types.ts`. Status:

- **Stable @ 1.0** for the documented fields: `configured`,
  `status`, `jobId`, `pid`, `prompt`, `targetPath`, `mode`,
  `error`, `startedAt`, `completedAt`, `updatedAt`, `queue`,
  `messages`, `activityLog`.
- **Pre-1.0** for transient/heartbeat fields that get rewritten
  every poll: `currentStep`, `heartbeatAt`, `heartbeatLabel`,
  `thinking`. Don't build long-running consumers off these.

The state file is intended for the sidecar + worker to share. Host
apps should consume it via `/api/status`, not by tailing the file
directly. (If you do tail it: read with retry — it's atomically
replaced via tmp-file + rename.)

### 6. Audit log schema (`AuditEvent`)

Defined in `src/audit.ts`. **Stable @ 1.0** for the documented
fields: `ts`, `run_id`, `actor`, `origin`, `prompt_hash`,
`target_path`, `mode`, `output_mode`, `diff_hash`, `outcome`,
`pr_url`, `duration_ms`, `agent`, `error`.

We may add new optional fields in minor bumps; we won't rename or
remove existing ones until a major.

The on-disk format is one JSON object per line (`audit.jsonl`).
Always write-only-append; consumers can tail safely.

### 7. Webhook payload (`WebhookPayload`)

Defined in `src/webhooks.ts`. Same stability commitment as audit:
**Stable @ 1.0** for the documented fields, additive minor changes
allowed.

The three event names — `edit_requested`, `edit_applied`,
`pr_opened` — are Stable @ 1.0. We may add new event types but
won't rename these.

### 8. Agent adapter contract

Defined in `src/agents/types.ts`. **Stable @ 1.0** for the
`AgentRunner` interface and `Brief` shape. The internal adapters
(`openclaw`, `claude-code`, `codex`, `aider`) implement this
interface; third-party adapters can ship as separate packages.

Adapter authoring guide: [`docs/adapters.md`](./adapters.md).

### 9. Locale bundle contract

A custom locale bundle is any JS module that, on load, pushes
`{ locale, bundle: Partial<StringTable> }` onto
`window.__PyanchorPendingLocales` AND calls
`window.__PyanchorRegisterStrings(locale, bundle)` if available.
See `src/runtime/overlay/locales/ko.ts` for the canonical pattern.

`StringTable` shape is **Stable @ 1.0** — adding new keys to the
table will not break existing locales (unset keys fall back to
English). Removing keys would be a major bump.

The 21 built-in locales (ko / ja / zh-cn / es / de / fr / pt-br /
vi / id / ru / hi / th / tr / nl / pl / sv / it / ar / he / fa /
ur) are kept up-to-date with the English `StringTable` at every
ship. Coverage is asserted in `tests/runtime/overlay/strings.test.ts`.

### 10. CLI surface (`pyanchor` bin)

The `pyanchor` binary added a subcommand dispatcher in v0.28.0.
Backward compatible — invoking with no subcommand still starts the
sidecar exactly as pre-v0.28 (where the bin pointed straight at
`dist/server.cjs`). The full surface:

| Invocation | Status | Notes |
|---|---|---|
| `pyanchor` (no args, default) | **Stable @ 1.0** | Start the sidecar. Reads `PYANCHOR_*` env. |
| `pyanchor --version` / `-v` | **Stable @ 1.0** | Print version + exit 0. |
| `pyanchor --help` / `-h` | **Stable @ 1.0** | Print short usage + exit 0. |
| `pyanchor init` | **Stable @ 1.0** | Interactive scaffolder. v0.28.0+. |
| `pyanchor init --yes` / `-y` | **Stable @ 1.0** | Headless mode (CI-safe; uses defaults for every prompt). |
| `pyanchor init --dry-run` | **Stable @ 1.0** | Print the plan without writing. |
| `pyanchor init --force` | **Stable @ 1.0** | Overwrite existing files (default is skip-if-present). |
| `pyanchor init --cwd <path>` | **Stable @ 1.0** | Init a project at a path other than the current dir. |
| `pyanchor doctor` | **Stable @ 1.0** | v0.29.0+. Run all config checks; print pass/fail per check + suggested fix. Exit 0 = sidecar safe to start; exit 1 = at least one ✗. Output format ("Required environment variables", "Filesystem", "Agent", "Output mode: <mode>", "Optional knobs" sections + summary line) is Stable @ 1.0; the exact wording of fix suggestions is Pre-1.0. |
| Files written by `init` | **Stable @ 1.0** | Locations: `.env.local` (Next.js) or `.env` (others); `scripts/pyanchor-restart.sh` (chmod +x). Renaming or moving these is a major bump. For Next.js, `.env.local` also contains `NEXT_PUBLIC_PYANCHOR_TOKEN` set to the same value as `PYANCHOR_TOKEN` (v0.29.0+). |
| Auto-detected frameworks | Pre-1.0 | nextjs / vite / astro / remix / sveltekit / nuxt. Adding new ones is non-breaking; the detection heuristic itself may evolve. |
| Bootstrap snippet output (the JSX/HTML printed for the user to copy) | Pre-1.0 | The exact text may evolve as we add framework profiles. The substance (script tag pointing at `/_pyanchor/bootstrap.js` with token data attr) is stable. |
| `dist/server.cjs` direct invocation (`node dist/server.cjs`) | **Stable @ 1.0** | Legacy entry — still works, used by the systemd template. |

Future subcommands (e.g. `pyanchor doctor`, `pyanchor agent test`)
will be additive; never break existing invocations.

## Pre-1.0 surfaces (will iterate)

- **Multi-tenancy** — currently single-tenant. v0.22+ may add
  per-tenant config + isolation. If/when that lands, `state.json`
  layout, audit log path resolution, and webhook URL config may
  pick up a tenant prefix. Tracked in `docs/roadmap.md`.
- **Admin HTML page (`/`)** — minimal placeholder. May be expanded
  or removed.
- **Agent adapter knobs** (`PYANCHOR_AGENT_*` envs) — adapter-
  specific knobs may be reorganized as the adapter set grows.
- **CSS class names inside the Shadow Root** — internal layout
  details. Don't style the overlay from host CSS; if you need to
  customize appearance, file an issue describing the use case.

## Internal surfaces (don't depend on)

- Anything in `src/worker/` not exported to consumers (lifecycle,
  state-io, runtime-buffer, child-process internals).
- The exact content of `state.json` activity log lines (free-form
  human-readable strings, formatted for the overlay).
- Implementation details of `runPr()` git command sequence —
  tested via unit tests, not a public contract.
- The contents of `pyanchor_session` cookie — opaque random id,
  not meant to be parsed.

## How we'll handle 1.0 itself

When we cut 1.0:

1. The CHANGELOG entry for `1.0.0` will be a single statement:
   "All `Stable @ 1.0` items above become the contract."
2. We will **not** rename / remove any Stable @ 1.0 item until 2.0.
3. New optional additions (new `data-pyanchor-*` attributes, new
   audit log fields, new webhook events) are minor bumps.
4. Behavior changes that affect default semantics (e.g. changing
   the default rate limit, changing `outputMode` default) are
   minor bumps with a CHANGELOG note.
5. Anything in "Pre-1.0" or "Internal" remains free to change.

## Reporting drift

If you find a behavior change between minor versions on a
`Stable @ 1.0` item before 1.0 is actually cut, that's a bug.
Report it as a regular issue.

After 1.0, the same finding is a security/severity issue — file
an advisory via the GitHub Security tab.
