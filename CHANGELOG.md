# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
