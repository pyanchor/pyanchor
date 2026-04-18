# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
