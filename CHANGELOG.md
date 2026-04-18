# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
