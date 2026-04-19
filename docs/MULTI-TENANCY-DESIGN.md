# Multi-tenancy — design proposal (v1.1+ track)

> **Status: design draft, no implementation yet.** This doc captures
> the open questions and a proposed shape for hosting multiple
> independent app workspaces from a single pyanchor sidecar process.
> It is not a v1.0 commitment — the [API stability commitment](./API-STABILITY.md)
> calls multi-tenancy out as `Pre-1.0` and explicitly free to iterate.
>
> Comments / counter-proposals welcome via GitHub issues. We'll
> freeze the design after the v1.0 cut + the first 30-day production
> adoption window completes, so feedback now is real input, not a
> formality.

## Why bother

Pyanchor's positioning is "self-hosted, prod-attached, single-team".
Multi-tenancy at SaaS scale (multiple orgs, billing, isolation
guarantees) is explicitly out of scope — that's a different product.

The case for in-process multi-tenancy is narrower:

- **One developer, multiple personal projects.** Today you'd run a
  separate sidecar per project (different port, different env file,
  different pm2 entry). Annoying, but it works.
- **One small team, multiple apps.** Same code review pattern, same
  agent backend, same rate limit budget — but different repos,
  different deploy scripts. Today: same pain.
- **One internal platform team serving N product teams.** Each team
  has its own app + its own people + its own gh org. Different audit
  log per team. Today: per-team sidecar makes sense as long as the
  count stays small (~10).

The ceiling is low. If you have hundreds of tenants, you want a real
control plane (kube, fly, etc.), not pyanchor with a config file.

## Three plausible models

### A. Per-tenant sidecar process (current solution)

What it looks like: every tenant gets its own pyanchor process,
its own port, its own env file, its own pm2 entry.

Pros:
- Already works. No code needed.
- Process boundary = strong isolation.
- Each tenant can run a different pyanchor version.

Cons:
- Linear cost in process count.
- Per-tenant config is a separate file/unit; no central view.
- Restart-frontend script can't be shared if it has tenant
  context.

When this is right: you have ≤5 tenants, or you want maximum
isolation for compliance reasons.

### B. Single sidecar, multiple workspaces (this proposal)

What it looks like: one pyanchor process binds to one port. A new
config file (`pyanchor.tenants.json` or similar) lists the tenants;
each tenant has its own workspace dir, app dir, agent config, git
remote. Requests carry a tenant identifier and the sidecar routes
to the correct context.

Pros:
- O(1) processes regardless of tenant count.
- Central view: one log stream, one admin page (with tenant
  filter), one set of webhooks.
- Easier to add per-tenant policy (rate limit, role gates) later.

Cons:
- New code: tenant resolver middleware, per-tenant state.json,
  per-tenant locks, per-tenant audit log.
- Fault isolation weakens: a runaway worker for tenant A can
  starve tenant B (CPU, fd, memory).
- Config file becomes a deployment artifact.

When this is right: 5-30 tenants, single team owning all of them,
willing to trade hard isolation for operational simplicity.

### C. Control plane spawning ephemeral sidecars

What it looks like: a thin pyanchor "controller" listens on one
port. On request, it spawns (or routes to) a per-tenant sidecar
in a separate process / container.

Pros:
- Process isolation back.
- Can scale horizontally.

Cons:
- Real complexity: container runtime dep, lifecycle management,
  inter-process state.
- Drift toward SaaS architecture — pyanchor explicitly isn't this.
- Most users would just use kube at this point.

**Verdict**: out of scope. If you need this, you're building on top
of pyanchor, not asking pyanchor to grow into it.

---

**This proposal commits to model B.**

## Tenant identification

Three options, pick one:

| Option | Example | Pros | Cons |
|---|---|---|---|
| Subdomain | `tenant-a.pyanchor.example.com` | Clean URLs, plays well with reverse proxy | Operator must own DNS + cert per tenant |
| Path prefix | `pyanchor.example.com/t/tenant-a/_pyanchor/...` | Single domain + cert | Bootstrap script's `baseUrl` must include the prefix |
| Request header | `X-Pyanchor-Tenant: tenant-a` | URL stays clean | Hard to use from a `<script>` tag (no header control) |

**Recommendation: path prefix.** A new env `PYANCHOR_TENANT_BASE_PATH`
(default `/t`) puts all tenants under `${tenant_base_path}/${tenant_id}/_pyanchor/...`.
Bootstrap takes `data-pyanchor-tenant="tenant-a"` and constructs URLs
accordingly.

## Per-tenant config

New file: `pyanchor.tenants.json` (or `.cjs` for env interpolation).
Schema sketch:

```json
{
  "tenants": [
    {
      "id": "tenant-a",
      "appDir": "/srv/apps/tenant-a",
      "workspaceDir": "/var/lib/pyanchor/tenants/tenant-a/workspace",
      "stateDir": "/var/lib/pyanchor/tenants/tenant-a/state",
      "restartScript": "/srv/apps/tenant-a/scripts/restart.sh",
      "healthcheckUrl": "http://127.0.0.1:3001/",
      "framework": "nextjs",
      "agent": "openclaw",
      "openClawUser": "openclaw-tenant-a",
      "outputMode": "apply",
      "auditLogEnabled": true,
      "git": {
        "remote": "origin",
        "baseBranch": "main",
        "branchPrefix": "pyanchor/"
      },
      "tokenHash": "sha256:abc123...",
      "allowedOrigins": ["https://tenant-a.example.com"]
    },
    {
      "id": "tenant-b",
      "...": "..."
    }
  ]
}
```

Key changes from the current single-tenant config:

- **`tokenHash` instead of `token`**: the file is on disk; storing
  raw tokens there is a footgun. Operator generates the token, hashes
  it (sha256), writes the hash. Sidecar timing-compares the bearer
  against the stored hash on each request.
- **Per-tenant subset of envs**: only the ones that vary by tenant
  go in the file. Globals (port, host, gate cookie name, webhook
  base URL) stay in env vars.
- **Per-tenant agent + output mode**: each tenant can be on a
  different agent backend or output mode independently.

## Per-tenant state

Each tenant gets:
- Own `state.json` in `${stateDir}/state.json`
- Own `audit.jsonl` in `${stateDir}/audit.jsonl`
- Own `app-dir.lock` in `${stateDir}/app-dir.lock`

The sidecar resolves the tenant from the request, then uses that
tenant's paths for every state operation. No cross-tenant reads
or writes.

## Per-tenant queue + concurrency

Open question: do queues compose or are they fully independent?

- **Independent (recommended)**: each tenant has its own queue,
  its own running job. Tenant A's job doesn't block tenant B's.
  Cost: N concurrent worker processes max.
- **Shared global queue**: only one job runs across all tenants
  at a time. Simpler resource accounting; bad UX (tenant B waits
  on tenant A).

Recommendation: independent. Add a global `PYANCHOR_MAX_CONCURRENT_WORKERS`
cap (default e.g. 4) so a runaway loop can't fork-bomb the host.

## Worker spawn

`spawnRunner` already takes the env. Add `PYANCHOR_TENANT_ID` to
the worker env; the worker reads its tenant from there and resolves
its own state/audit/workspace paths.

The worker doesn't need to know about other tenants. Each spawned
worker is single-tenant from its perspective.

## Audit log unification

Two patterns:
- **Per-tenant file** (default): each tenant's audit.jsonl is
  isolated. Operators tail individually.
- **Unified file with tenant column**: one audit.jsonl with
  `tenant_id` field added to each event. Easier global tail; harder
  per-tenant retention/rotation.

Recommendation: per-tenant file by default. Add `PYANCHOR_AUDIT_LOG_UNIFIED=true`
opt-in for operators who prefer the global stream.

## Bootstrap script changes

The host page's bootstrap tag needs to know which tenant it belongs
to. Two non-breaking options:

```html
<!-- option 1: data attribute -->
<script src="/_pyanchor/bootstrap.js" data-pyanchor-tenant="tenant-a" />

<!-- option 2: encoded in baseUrl -->
<script src="/t/tenant-a/_pyanchor/bootstrap.js" />
```

Option 2 is preferred — the URL itself carries the tenant, so the
bootstrap doesn't need any new attribute. The bootstrap reads its
own script's `src` URL (already does this for `baseUrl` derivation)
and passes the inferred prefix forward to overlay.js fetches.

## Webhook routing

Per-tenant webhook URLs. Each tenant config block can override
`webhooks.editRequested`, `editApplied`, `prOpened`. If absent, fall
back to the global env (`PYANCHOR_WEBHOOK_*_URL`). This keeps single-
tenant deployments unchanged.

## Single-tenant compatibility

If `pyanchor.tenants.json` is absent, the sidecar runs in legacy
single-tenant mode. The current envvars (`PYANCHOR_APP_DIR`,
`PYANCHOR_WORKSPACE_DIR`, etc.) describe one synthetic tenant whose
id is `_default`. URLs stay flat (`/_pyanchor/...`), bootstrap stays
unchanged.

This means the v1.0 single-tenant API stays Stable @ 1.0. Multi-
tenancy is purely additive — opt-in via the tenants file.

## What this would cost to implement

Rough breakdown:
- New `src/tenants.ts` module: load tenants file, resolve tenant
  from request, expose `getTenantContext(req)`. ~300 LOC.
- Refactor `src/state.ts`: every state operation takes a tenant
  context (or resolves from caller). State paths from tenant ctx.
  ~150 LOC change.
- Refactor `src/server.ts`: tenant resolver middleware, route
  prefixes. ~100 LOC.
- Refactor `src/worker/runner.ts`: read `PYANCHOR_TENANT_ID` env
  + use tenant-scoped audit + state paths. ~50 LOC.
- New tests: `tests/tenants.test.ts` + extending state / server
  tests for multi-tenant cases. ~600 LOC.
- Docs: this design doc graduates to operator guide.

Total: ~1200 LOC change, ~600 LOC of new tests. Real work but
not architectural surgery — the worker is already standalone, the
state is already file-based, the audit log is already pluggable.

## Open questions for feedback

1. **Tenant identification scheme** — path prefix (recommended)
   vs subdomain. Strong opinions?
2. **Token hash storage** — sha256 + raw bearer, or pivot to
   per-tenant signed JWTs?
3. **Per-tenant rate limits** — separate buckets per tenant or
   shared global?
4. **Cross-tenant admin** — should the admin page show all tenants
   (filterable) or one at a time (require tenant-scoped URL)?
5. **Auto-discovery vs explicit list** — must operator list each
   tenant, or can pyanchor scan `${PYANCHOR_TENANTS_DIR}/` for
   per-tenant subdirs?

If you have a use case for any of these, file an issue describing
the workflow. The implementation will be informed by what people
actually ask for, not by what the proposal guesses.

## Timeline

- v0.22.0 — this doc (no code).
- v0.x → v1.0 — adoption window, no multi-tenancy work. Single-
  tenant API contract stabilized.
- v1.0 — single-tenant cut.
- v1.1 — multi-tenancy lands as opt-in. Single-tenant operators
  see no change unless they create the tenants file.

Reactive timeline — if no one asks for multi-tenancy in the v1.0
adoption window, it stays in this doc as a future track and we
focus on whatever real users actually ask for instead.
