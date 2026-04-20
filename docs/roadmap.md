# Roadmap

Last updated: 2026-04-20 (v0.25.1).

> **Tone shift:** through v0.10.x this doc was a sized-task plan
> for refactoring the inline runner. That work shipped (v0.6/v0.7
> decompositions). What follows is a present-tense map: what we're
> stabilizing, what's next, and what's deliberately not on the
> menu. Sized engineering breakdowns now live in CHANGELOG entries
> per release, not here.

## Where we are (v0.25.1)

- **Code**: 720+ unit tests + 69 e2e (Node 18/20/22 matrix on every commit)
- **Docs**: SECURITY + PRODUCTION-HARDENING + API-STABILITY +
  MULTI-TENANCY-DESIGN + per-adapter setup guides; README
  quickstart is 5 explicit numbered steps
- **i18n**: 21 built-in locales (LTR + RTL), code-split for
  fetch-free English path
- **Production gating**: 4-layer stack (host middleware → host
  layout → bootstrap fail-safe → sidecar middleware). Documented +
  examples + tested
- **Output modes**: `apply` (default), `pr` (`gh pr create`),
  `dryrun`. Audit log + webhook hooks for both. PR mode covered
  by real-git smoke (v0.24.0)
- **Agent backends**: 5 built-in adapters — openclaw / claude-code
  / codex / aider / gemini (v0.25.0). Same `AgentRunner` contract
- **Agent error classifier**: known transient OAuth race / rate
  limit / timeout / network errors get actionable hints in
  state.error
- **Operator visibility**: `/api/admin/metrics` (v0.23.1) exposes
  in-process queue depth + active sessions + recent message status
  counts
- **First production adopter**: studio.pyan.kr running pyanchor
  v0.24.0 with `PYANCHOR_AUDIT_LOG=true`, 30-day adoption window
  started 2026-04-20 (Day 1 in progress)

## 1.0 trajectory

| Blocker | Status |
|---|---|
| Threat model docs | ✅ shipped (v0.17 + v0.18) |
| Production hardening guide | ✅ shipped (v0.18) |
| Public API contract pin | ✅ shipped (v0.22.0 — see `API-STABILITY.md`) |
| README rewrite | ✅ shipped (v0.23.0 — 5-step quickstart) |
| First non-author production adopter | ⏳ studio.pyan.kr running cleanly since 2026-04-20 |

**Target**: 1.0 cut around 2026-05-20 if no API-break-forcing issue
surfaces in the 30-day adoption window. The cut itself is a single
CHANGELOG line: "All `Stable @ 1.0` items in API-STABILITY.md
become the contract."

## Recently shipped polish (v0.23.x → v0.25.x)

All closed during the active polish track between Codex round 15
and round 16:

- ✅ **`/api/admin/metrics` endpoint** — v0.23.1
- ✅ **`overlay.ts` decomposition round 2** — v0.23.2 (CSS
  extraction; `render()` decomposition deferred — coupling cost
  doesn't pay off as a single factory)
- ✅ **Realistic PR-mode smoke** — v0.24.0 (real git + fake gh,
  catches round-14 branch-parenting on actual `git rev-parse`,
  ~500ms total — fast enough to stay in default `pnpm test`,
  no nightly infra needed)
- ✅ **Gemini CLI adapter** — v0.25.0 (5th built-in agent)
- ✅ **Round-16 fast-follow** — v0.25.1 (Gemini `-m` openclaw-
  default leak fix + API-STABILITY metrics row + `.env.example`
  Gemini section)

## Final 1.0 prep

Pre-cut work that is intentionally NOT new product features:

- **Adoption narrative from audit data** — once studio's
  `audit.jsonl` accumulates a meaningful sample (target: 14+
  days), summarize outcome counts / duration percentiles /
  failure-kind breakdown into the 1.0 announcement. Replaces the
  "22 done / 2 failed (91.7%)" snapshot which is a message-count,
  not a job-outcome metric (round-16 P3).
- **Launch copy review** — `ref/launch-copy.md` (gitignored)
  has Show HN / r/nextjs / Twitter drafts. Tune tone closer to
  the cut date.
- **Demo video** — operator-recorded; Playwright session at
  `srcsht/aig/pyanchor-demo-{01-04}.png` is the storyboard, not
  the deliverable.

## Post-1.0 candidates

In rough order of likely user demand:

1. **More framework profiles** — Astro, Remix, SvelteKit. Pattern
   is ~50 LOC each (`src/frameworks/`). PRs welcome.
2. **More agent adapters** — Goose, Cline. Same `AgentRunner`
   interface (`src/agents/types.ts`, ~70 LOC contract).
3. **`/api/admin/metrics?include=audit`** — historical aggregations
   (duration p50/p95/p99, failure-kind counts over last 24h)
   parsed from `audit.jsonl`. Bounded read window.
4. **Multi-tenancy** — design doc shipped at `docs/MULTI-TENANCY-DESIGN.md`.
   Single sidecar, multiple workspaces. Path-prefix routing.
   Implement when someone files an issue describing the workflow,
   not before. v1.1+.
5. **Signed actor headers** — for high-trust team deployments
   where `X-Pyanchor-Actor` needs cryptographic provenance.
   Currently solved via host-side middleware (record signed JWT
   payload then pass `actor` to pyanchor); a first-party helper
   could ship as a docs example without code change.
6. **Visual regression + axe-core in CI** — catches UI drift
   that current Playwright e2e doesn't flag.
7. **Bundle size CI guard tightening** — current ceilings have
   ~2x headroom over actuals; could enforce per-PR delta.

## Explicit non-goals

These are NOT on the roadmap. Filed here so the answer is
"won't" not "not yet":

- **Database** — pyanchor's persistence is `state.json` +
  `audit.jsonl`. Adding a DB makes the deployment story
  significantly heavier and serves no clear user need.
- **Control plane / orchestrator** — pyanchor is a sidecar, not a
  platform. If you need to run N pyanchors managed by a control
  plane, use kube/fly/etc. + a per-tenant pyanchor process.
- **Multi-tenant SaaS hosting** — out of scope. pyanchor is a
  self-hosted dev tool; if there's a hosted offering, it'll be
  someone else's product on top of pyanchor, not pyanchor itself.
- **Built-in identity / RBAC** — pyanchor records what the host
  app's auth tells it (`X-Pyanchor-Actor`). Building our own
  identity layer means owning user lifecycle + token rotation +
  audit-of-the-audit, all of which are an SSO product, not a
  sidecar.
- **Fancy admin UI** — the admin page (`/`) is intentionally
  minimal: live status + queue + recent messages + raw JSON.
  Operators use logs + audit + metrics; if they want a dashboard,
  Datadog / Grafana / similar can tail the audit log.
- **Telemetry / phone-home** — none, ever. Self-hosted means
  self-hosted.

## How to influence this list

The post-1.0 candidate list is reactive. If you have a use case
for any of them — or for something not on the list — file an issue
describing the workflow. Implementations follow demand, not
abstraction guesses.
