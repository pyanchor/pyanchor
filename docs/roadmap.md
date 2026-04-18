# Pyanchor v0.2.0 → v0.3.0 roadmap

Honest sizing: numbers assume a single experienced contributor, no test
scaffold for refactors until S-1 lands, and that v0.1.1 behavior is the
bar (don't regress origin/host allowlists, bearer token auth,
`OPENCLAW_INLINE` branch in `processJob`).

## v0.2.0 (Tier S)

### S-1. Vitest scaffold + smoke tests for auth / origin / rate-limit
- description: Wire `vitest` + `@vitest/coverage-v8`, add `tests/unit/`
  covering token timing-safe compare, origin allowlist enforce/bypass,
  token-bucket refill + 429.
- files: `package.json` (devDeps + `test` script), `vitest.config.ts`
  (new), `tests/unit/auth.test.ts`, `tests/unit/origin.test.ts`,
  `tests/unit/rate-limit.test.ts`, `tests/helpers/express-stub.ts`,
  `.github/workflows/ci.yml` (add `pnpm test`).
- effort: 5h
- risk: low — pure additive, no runtime touched. Mocking
  `pyanchorConfig` requires per-test `vi.resetModules()`; only sharp edge.
- depends on: nothing
- commit: single `test: scaffold vitest + smoke tests for auth/origin/rate-limit`
- parallelizable: yes — independent of every other item. **Must land
  first** so S-2/A-4 refactors have a safety net.

### S-2. OpenClaw inline → `src/agents/openclaw.ts` adapter
- description: Extract the ~800 LOC inline OpenClaw flow (lines ~318–1030
  of `runner.ts`: `runAsOpenClaw*`, `ensureAgent`, `runAgent`,
  `parseAgentResult`, `extractAgentSignals`, `processAgentChunk`,
  `writeBrief`, `createBrief`) into an `AgentRunner` implementation.
  Delete `OPENCLAW_INLINE` symbol and the branch in `processJob`.
- files: `src/agents/openclaw.ts` (new, ~600 LOC), `src/agents/index.ts`
  (register, drop sentinel), `src/worker/runner.ts` (delete inline
  path, collapse `processJob` to single `runAdapterAgent` call),
  `tests/unit/agents/openclaw.test.ts` (mock `child_process.spawn`,
  assert brief shape + chunk parsing), `docs/adapters.md` (note
  OpenClaw is now reference impl).
- effort: 14h (this is the heaviest single task)
- risk: high — touches the production-default codepath. `runAgent`
  mixes `spawn`, `cancelController`, heartbeat updates, log/thinking
  buffering. Adapter contract has no `queueLog`/`queueThinking`/
  `pulseState` hooks — must be re-expressed as `AgentEvent` yields,
  which means moving the chunk parser to also yield events instead
  of mutating module-level buffers.
- depends on: **S-1** (need tests covering chunk parser + brief
  generation before refactor)
- commit: split into 3 — (a) lift `createBrief`/`writeBrief`/
  `parseAgentResult`/`extractAgentSignals` into pure helpers in
  `src/agents/openclaw/brief.ts` and `src/agents/openclaw/parse.ts`
  with tests; (b) introduce `OpenClawAgentRunner` class wrapping
  spawn + AsyncIterable; (c) delete inline branch and
  `OPENCLAW_INLINE` sentinel.
- parallelizable: no — sequential against S-1 (needs tests) and
  against A-4 (which decomposes the leftover runner).

### S-3. Fast-reload mode (`PYANCHOR_FAST_RELOAD=true`)
- description: When set, skip `installWorkspaceDependencies`, skip
  `buildWorkspace`, skip `restartFrontend`; still run `syncToAppDir`
  so Next HMR picks up the change. Surface mode in admin health +
  activity log.
- files: `src/config.ts` (add `fastReload: boolean`),
  `src/worker/runner.ts` (gate three `withHeartbeat` calls in
  `processJob`), `src/state.ts` (expose flag in admin health),
  `src/runtime/overlay.ts` (badge in status header), `.env.example`,
  `README.md` (Quick start dev section), `tests/unit/config.test.ts`
  (parsing).
- effort: 4h
- risk: medium — silently skipping build is a footgun if anyone
  enables it in prod. Mitigate by logging a one-line warning at
  sidecar startup when fast-reload is on, and require
  `PYANCHOR_HOST=127.0.0.1`.
- depends on: ideally lands **after S-2** so the gating lives in one
  place (`processJob`), not duplicated across an inline branch.
- commit: single `feat: PYANCHOR_FAST_RELOAD skips build/restart for HMR-driven dev loops`
- parallelizable: yes against S-1/S-4; no against S-2 (merge conflict
  in `processJob`).

### S-4. Cookie-based session tokens
- description: New `POST /_pyanchor/api/session` exchanges header
  bearer for an HttpOnly, SameSite=Strict, Secure cookie
  (`pyanchor_session`). `requireToken` accepts cookie OR
  `Authorization: Bearer` (backwards compat). Bootstrap stops
  requiring `data-pyanchor-token` when cookie present; keep attribute
  path as fallback for first request.
- files: `src/auth.ts` (cookie extractor, add to `extractToken`),
  `src/server.ts` (add `cookie-parser`, register `/api/session`
  route), `src/runtime/bootstrap.ts` (call `/api/session` once on
  load if no cookie), `src/runtime/overlay.ts` (drop token from
  in-memory config exposure on `window.__PyanchorConfig`),
  `package.json` (`cookie-parser`), `tests/unit/auth.test.ts`
  (cookie path), `SECURITY.md` (transport section), `README.md`
  (script tag no longer needs token attribute).
- effort: 6h
- risk: medium — introduces CSRF surface that did not exist before
  (cookie auto-sent). Mitigated by existing `requireAllowedOrigin`,
  but origin enforcement is **opt-in**. Doc must call this out:
  enabling cookie sessions implies setting
  `PYANCHOR_ALLOWED_ORIGINS`.
- depends on: S-1 (auth tests in place)
- commit: split — (a) server side cookie issuance + dual-accept in
  `requireToken`; (b) bootstrap/overlay client switch.
- parallelizable: yes against S-2/S-3.

## v0.2.x patches

### A-1. Codex CLI adapter
- description: `OpenAICodexAgentRunner` — try `import("@openai/codex")`;
  if absent, shell out to `codex` CLI (mirror OpenClaw spawn pattern
  but smaller).
- files: `src/agents/codex.ts` (new, ~180 LOC), `src/agents/index.ts`
  (register), `tests/unit/agents/codex.test.ts`, `docs/codex-setup.md`,
  `README.md` (status table flip 🟡→✅).
- effort: 6h (8h if SDK doesn't exist and we go shell-only with chunk
  parser similar to OpenClaw)
- risk: medium — depends on Codex SDK shape stability, which is unknown
  today. Mitigate by treating shell-out as primary path.
- depends on: **S-2** (extracted OpenClaw is the reference impl to
  copy from)
- commit: single, behind feature flag in dispatcher only when
  `PYANCHOR_AGENT=codex`.
- parallelizable: yes with A-2/A-3; independent of A-4.

### A-2. Aider adapter
- description: Shell out to `aider --yes --message <brief>` against
  workspace. Parse stdout for diff summary; emit `step` events on
  file-write log lines.
- files: `src/agents/aider.ts` (~150 LOC), `src/agents/index.ts`,
  `tests/unit/agents/aider.test.ts`, `docs/aider-setup.md`,
  `README.md`.
- effort: 5h
- risk: low — pure shell-out, no SDK risk, but Aider's stdout format
  isn't structured so summary parsing is fuzzy.
- depends on: S-2
- commit: single
- parallelizable: yes — fully concurrent with A-1.

### A-3. i18n shim
- description: String table per locale (`src/i18n/strings.ts` exporting
  `en`, `ko` maps; `t(key, locale)`). Replace hardcoded English
  strings in overlay + worker activity log. Locale resolved from
  `PYANCHOR_LOCALE` (server) and `navigator.language` (overlay).
- files: `src/i18n/index.ts`, `src/i18n/en.ts`, `src/i18n/ko.ts`,
  `src/runtime/overlay.ts` (replace ~30 string literals),
  `src/worker/runner.ts` (~20 literals), `src/state.ts` (status step
  strings), `tests/unit/i18n.test.ts`.
- effort: 5h
- risk: low — additive, fallback to `en`. Risk is missing a string
  and shipping a partial Korean experience.
- depends on: ideally after A-4 so overlay strings are in module-scope
  places, not buried in a 1054 LOC file. If shipped before A-4,
  expect a second pass.
- commit: split — (a) shim + worker strings; (b) overlay strings.
- parallelizable: no with A-4 (overlay file conflict); yes with A-1/A-2.

### A-4. `runner.ts` decomposition (1212 LOC → 5 modules)
- description: Split into `src/worker/state-helpers.ts`
  (read/write/update + lock + clone, ~120 LOC),
  `src/worker/cancel.ts` (signal handling, `cancelController`,
  `finalizeCancellation`, ~80 LOC),
  `src/worker/agent-helpers.ts` (`runAdapterAgent`, event pump,
  log/thinking flush, ~180 LOC),
  `src/worker/workspace-lifecycle.ts` (prepare, install, build,
  sync, restart, ~250 LOC),
  `src/worker/runner.ts` (main + `processJob` only, ~150 LOC).
- files: above 5 files modified/created, plus
  `tests/unit/worker/state-helpers.test.ts`,
  `tests/unit/worker/agent-helpers.test.ts`.
- effort: 10h
- risk: high — module-level mutable state (`pendingLogLines`,
  `flushTimer`, `stdoutBuffer`, `activeChildren`, `cancelController`)
  is the central coordination mechanism. Naive split will create
  circular imports. Solution: a small `src/worker/runtime-state.ts`
  that owns the singletons and is imported by everyone else.
- depends on: **S-2** (must extract OpenClaw first; doing both at once
  is reckless), **S-1** (need any test coverage at all)
- commit: split per module; don't combine. Each commit must keep
  `pnpm build && pnpm test` green.
- parallelizable: no — single file owner. Cannot run alongside S-2,
  S-3, or A-3.

## v0.3.0 (Tier B)

### B-1. `overlay.ts` decomposition (1054 LOC)
- description: Split into `src/runtime/overlay/state.ts` (uiState,
  polling, `syncState`), `src/runtime/overlay/dom.ts` (Shadow DOM
  construction + style injection), `src/runtime/overlay/render.ts`
  (`render`, `renderMessages`, formatters),
  `src/runtime/overlay/composer.ts` (input handling, history
  binding), `src/runtime/overlay/picker.ts` (element selection mode),
  `src/runtime/overlay/index.ts` (entry). Update `build.mjs` if it
  bundles overlay as single entry (it likely does — verify before
  splitting).
- files: 6 new files + `build.mjs` (entry update) + delete monolith.
- effort: 12h
- risk: high — browser surface, no tsc-only validation. Need
  Playwright smoke (already deferred-available) covering: overlay
  mounts, status polls, edit submission round-trips, cancel, picker
  highlight.
- depends on: B-3 (audit log) is independent; this should land first
  in v0.3.0 because every later overlay change is cheaper after.
- commit: split per module, each behind a Playwright smoke pass.
- parallelizable: no — single browser-side surface.

### B-2. Audit log (append-only JSONL)
- description: `~/.pyanchor/audit.jsonl` — one line per `startAiEdit`,
  `cancelAiEdit`, completion. Schema:
  `{ts, actor, jobId, mode, prompt, targetPath, outcome}`. Add
  `GET /api/admin/audit?limit=N` (token-gated).
- files: `src/audit.ts` (new), `src/state.ts` (call audit on
  transitions), `src/server.ts` (route), `src/admin.ts` (render last
  20 in admin page), `tests/unit/audit.test.ts`.
- effort: 5h
- risk: low — additive, append-only, no schema migration. Risk is
  unbounded growth — add size-based rotation at 16 MiB.
- depends on: nothing functional; B-4 (multi-user) consumes `actor`
  field, so design schema with `actor` from day one even when
  single-tenant.
- commit: single
- parallelizable: yes — fully concurrent with B-1.

### B-3. SQLite state migration (multi-user prep)
- description: Replace `~/.pyanchor/state.json` + `flock` with
  `better-sqlite3`. Schema: `state` (singleton row), `messages`
  (rows), `queue` (rows), `audit` (rows, supersedes B-2 file).
  Migration script reads existing JSON on first boot.
- files: `src/state/db.ts` (new), `src/state/migrate.ts` (new),
  `src/state.ts` (rewrite to query db),
  `src/worker/state-helpers.ts` (after A-4 — same), `package.json`
  (`better-sqlite3`), `tests/unit/state/db.test.ts`,
  `tests/unit/state/migrate.test.ts`.
- effort: 14h
- risk: high — `better-sqlite3` is a native module, breaks `pnpm pack`
  portability story; must verify the npm tarball still installs on
  macOS arm64, Linux x64, Linux arm64. Migration must be idempotent
  (boot, crash, reboot all fine).
- depends on: **A-4** (state-helpers must be its own module first),
  **B-2** (audit schema settled)
- commit: split — (a) add db layer behind
  `PYANCHOR_STATE_BACKEND=sqlite` opt-in; (b) flip default; (c)
  delete JSON path one minor later.
- parallelizable: no with B-4 (B-4 builds on this).

### B-4. Multi-user Lv1 (named tokens + per-user audit)
- description: Replace `PYANCHOR_TOKEN` (single) with
  `PYANCHOR_TOKENS_FILE` (JSON: `[{name, token, createdAt}]`).
  `requireToken` resolves bearer to actor name, attaches to
  `req.locals.actor`. Audit log + state write include actor. Old
  `PYANCHOR_TOKEN` still accepted as actor `default`.
- files: `src/auth.ts` (token map + actor resolution), `src/audit.ts`
  (consume actor), `src/state.ts` (carry actor on messages),
  `src/admin.ts` (per-actor activity), `src/runtime/overlay.ts`
  (display "you are <actor>"), `tests/unit/auth.test.ts`,
  `tests/unit/admin.test.ts`, `README.md` (Multi-user table flip
  Lv1 → ✅), `docs/multi-user.md` (new).
- effort: 8h
- risk: medium — auth surface change. Backwards compat path (env var
  fallback) is what de-risks it.
- depends on: B-3 (sqlite, so messages can carry actor without
  bloating JSON).
- commit: split — (a) actor plumbing with single hard-coded
  "default"; (b) tokens file + multi-actor.
- parallelizable: no with B-3.

### B-5. Preview / dry-run mode (workshop-style A/B)
- description: `mode: "preview"` runs the agent into a worktree,
  builds, and serves the diff + a `/preview/<jobId>/` proxy alongside
  production until accepted. Accept = sync to app dir + restart.
  Reject = discard.
- files: `src/worker/preview.ts` (new), `src/state.ts` (new statuses),
  `src/server.ts` (`/api/preview/accept`, `/api/preview/reject`,
  proxy), `src/runtime/overlay.ts` (Accept/Reject UI),
  `tests/integration/preview.test.ts`.
- effort: 16h
- risk: high — proxying a parallel build into the same browser
  session has subtle cookie/cache interactions. Likely needs
  path-prefix-aware Next config or a sub-port.
- depends on: A-4 (workspace-lifecycle module), B-3 (state needs a
  multi-row "candidate" concept).
- commit: behind `PYANCHOR_PREVIEW=true` opt-in for first release.
- parallelizable: no with B-1 (overlay), no with B-3.

### B-6. Undo / history (snapshot rollback)
- description: Before each successful edit, `git stash`-style snapshot
  of mutated files into `~/.pyanchor/snapshots/<jobId>/`.
  `POST /api/undo` restores last snapshot, runs build, restarts.
- files: `src/worker/snapshot.ts` (new), `src/server.ts` (route),
  `src/runtime/overlay.ts` ("Undo last edit" button),
  `tests/unit/worker/snapshot.test.ts`.
- effort: 8h
- risk: medium — disk usage grows linearly with edits; need rotation
  (keep last 20 by default). Restore semantics with concurrent
  in-flight edit need a lock — reuse `appDirLock`.
- depends on: A-4 (workspace-lifecycle), B-3 (need history table to
  point at snapshot dirs cleanly)
- commit: single
- parallelizable: yes with B-5 (different files), no with B-1
  (overlay).

## Critical path

`S-1 → S-2 → A-4 → B-3 → B-4`. Everything else hangs off this spine.

Chronological recommendation: S-1 first (single sitting), then S-3 +
S-4 in parallel worktrees while S-2 runs. Ship v0.2.0. Then A-4
(no other concurrent runner.ts work) while A-1/A-2 happen in parallel
worktrees. Ship v0.2.1. A-3 last in the patch series. For v0.3.0, B-1
and B-2 can start same day; B-3 after B-2 schema is final; B-4 after
B-3; B-5 and B-6 last and independent of each other.

## Parallel execution map

Concurrent groups (each group runs in its own worktree):
- **Wave 1 (v0.2.0):** {S-1} → then {S-2} alone → then {S-3, S-4} in parallel
- **Wave 2 (v0.2.x):** {A-1, A-2} in parallel → then {A-4} alone → then {A-3}
- **Wave 3 (v0.3.0):** {B-1, B-2} in parallel → {B-3} alone → {B-4} alone → {B-5, B-6} in parallel

Items that **must** be sequential because they all rewrite the same file:
- `src/worker/runner.ts`: S-2, S-3, A-4 (and B-5/B-6 lightly)
- `src/runtime/overlay.ts`: A-3, B-1, B-4, B-5, B-6
- `src/agents/index.ts`: S-2, A-1, A-2 (trivial conflicts but real)
- `src/auth.ts`: S-4, B-4

Items safe to fan out to independent agents at any time: S-1, A-1,
A-2, B-2.
