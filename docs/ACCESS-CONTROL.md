# Access control — who can edit your app via pyanchor

Pyanchor's permission model in one document. If you only read one
security doc, read this one. For threat-model walkthroughs +
deployment recipes, see [`SECURITY.md`](./SECURITY.md). For sandbox
hardening + sudoers + log shipping, see
[`PRODUCTION-HARDENING.md`](./PRODUCTION-HARDENING.md).

## TL;DR

> Pyanchor's `PYANCHOR_TOKEN` is treated like an **SSH key** — anyone
> holding it can mutate your code. Pyanchor does **NOT** ship a per-
> user account system. Instead, it gives you **9 opt-in layers** you
> compose to answer "who can access this".

The recommended composition for production is **gate cookie + existing
auth + PR mode + signed actor + audit log**. That stack means even a
leaked `PYANCHOR_TOKEN` cannot:

- Reach the sidecar (gate cookie missing → 403 before the token check)
- Make an unattended live change (PR mode → frontend reviews + merges)
- Fabricate audit lines for a real teammate (HMAC-signed actor)

You don't need any per-user account system in pyanchor for this — the
host app's existing auth (NextAuth / OAuth / SSO) does the user
identity work, and pyanchor records what it's told.

## The 9 layers

Most are opt-in. They stack — you compose what your threat model
warrants.

| # | Layer | What it restricts | How to enable | Default |
|---|---|---|---|---|
| 1 | **Bearer token** | Anyone holding the token can call the API | `PYANCHOR_TOKEN=$(openssl rand -hex 32)` | **required** |
| 2 | **Bind address** | Which network interfaces the sidecar listens on | `PYANCHOR_HOST=127.0.0.1` (loopback only) | `127.0.0.1` |
| 3 | **Origin allowlist (CSRF)** | Which `Origin:` headers `/api/edit` accepts | `PYANCHOR_ALLOWED_ORIGINS=https://app.example.com,...` | empty (warns on boot) |
| 4 | **Trusted hosts (browser)** | Which hosts the bootstrap script will mount on | `<script data-pyanchor-trusted-hosts="prod.example.com,...">` | `localhost / 127.0.0.1 / *.local` |
| 5 | **Gate cookie** | Sidecar refuses every request without a host-set cookie — used to tie pyanchor access to your existing auth | Sidecar: `PYANCHOR_REQUIRE_GATE_COOKIE=true` + `PYANCHOR_GATE_COOKIE_NAME=pyanchor_dev`. Host app: middleware sets the cookie after its own auth check. | off |
| 6 | **Bootstrap fail-safe** | Browser-side defense-in-depth — overlay refuses to mount if the named cookie isn't present | `<script data-pyanchor-require-gate-cookie="pyanchor_dev">` | off |
| 7 | **Reverse proxy gate (nginx / Caddy)** | IP allowlist, basic auth, SSO subrequest auth, mTLS — anything your proxy supports | nginx: `allow 10.0.0.0/8; deny all;` or `auth_request /sso-check;` in front of `location /_pyanchor/` | up to operator |
| 8 | **systemd `IPAddressAllow/Deny`** | Linux kernel-level network filter (cgroup v2) — only relevant under systemd | Edit the unit's `IPAddressDeny=`/`IPAddressAllow=` directives. ⚠ Don't blanket-block outbound or you'll cut off agent CLIs / GitHub / webhooks. | not set in the shipped template |
| 9 | **HMAC actor signing** | "Who requested this edit" can't be spoofed in the audit trail | Sidecar: `PYANCHOR_ACTOR_SIGNING_SECRET=$(openssl rand -hex 32)`. Host app: call `signActor(actor, secret)` from `src/actor.ts` and pass result as `X-Pyanchor-Actor` header. | off |

Plus two automatic guarantees:

- **Per-IP rate limit (token bucket)** — `/api/edit` 6/min,
  `/api/cancel` 30/min. Always on. No env var to disable.
- **PR mode as human gate** — `PYANCHOR_OUTPUT_MODE=pr` makes every
  edit land as a reviewable GitHub PR via `git push` + `gh pr
  create`. The frontend reviewer is the de-facto access gate to
  production code, regardless of token leakage.

## Recommended setups by scenario

### 🟢 Solo dev (loopback, your laptop)

Simplest. The defaults already isolate you:

```bash
export PYANCHOR_TOKEN=$(openssl rand -hex 32)
# PYANCHOR_HOST defaults to 127.0.0.1 → no external exposure
# trusted hosts default includes localhost → bootstrap mounts
pyanchor
```

Bootstrap tag:

```html
<script src="/_pyanchor/bootstrap.js" defer
        data-pyanchor-token="<your-token>"></script>
```

Risk: anyone with shell access to your laptop can `curl 127.0.0.1:3010`.
Acceptable for dev.

### 🟡 Team dev / staging (internet-facing, only your team)

Add 4 things:

```bash
# Sidecar
export PYANCHOR_TOKEN=$(openssl rand -hex 32)
export PYANCHOR_ALLOWED_ORIGINS=https://staging.example.com  # CSRF guard
export PYANCHOR_REQUIRE_GATE_COOKIE=true                     # tie to host auth
export PYANCHOR_GATE_COOKIE_NAME=pyanchor_dev
export PYANCHOR_OUTPUT_MODE=pr                               # edits → PR review
export PYANCHOR_AUDIT_LOG=true                               # record who did what
```

Host app (NextAuth example — see
[`examples/nextjs-nextauth-gate/`](../examples/nextjs-nextauth-gate/)):

```ts
// app/api/pyanchor-gate/route.ts
const session = await getServerSession(authOptions);
if (!session?.user?.email || !PYANCHOR_DEV_EMAILS.includes(session.user.email)) {
  return redirect("/");  // silent — don't leak gate existence
}
response.cookies.set("pyanchor_dev", "1", {
  httpOnly: true,
  sameSite: "strict",
  path: "/",
  maxAge: 60 * 60 * 24 * 30
});
```

Bootstrap tag with fail-safe:

```html
<script src="/_pyanchor/bootstrap.js" defer
        data-pyanchor-token="<token>"
        data-pyanchor-trusted-hosts="staging.example.com"
        data-pyanchor-require-gate-cookie="pyanchor_dev"></script>
```

Net effect: only people who can sign in via NextAuth AND whose email
is on `PYANCHOR_DEV_EMAILS` can even download `bootstrap.js`. Their
edits become PRs the frontend reviews on the normal cadence. Audit
log records every attempt.

### 🔴 Production (real users on the same site)

On top of the team setup, add:

```bash
# Sidecar
export PYANCHOR_ACTOR_SIGNING_SECRET=$(openssl rand -hex 32)

# Optional: webhook so reviewers see edit requests in Slack
export PYANCHOR_WEBHOOK_EDIT_REQUESTED_URL=https://hooks.slack.com/...
```

Host app: sign the actor field instead of passing it raw:

```ts
import { signActor } from "pyanchor/actor";  // src/actor.ts export

const signed = signActor(session.user.email, process.env.PYANCHOR_ACTOR_SIGNING_SECRET);
fetch("/_pyanchor/api/edit", {
  headers: {
    "X-Pyanchor-Actor": signed,
    "Authorization": `Bearer ${process.env.PYANCHOR_TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ /* ... */ })
});
```

nginx in front of pyanchor:

```nginx
location /_pyanchor/ {
    # Corp VPN only
    allow 10.0.0.0/8;
    deny all;
    # OR SSO check (returns 200 if cookie validates)
    auth_request /sso-check;

    proxy_pass http://127.0.0.1:3010/_pyanchor/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
}
```

systemd unit (see [`../examples/systemd/`](../examples/systemd/)):
sandbox directives + run as a dedicated `pyanchor` user with no shell.

## "What if my token leaks?"

Trace what each layer blocks:

| Token leaked + no other layers on | Attacker can do anything pyanchor can do |
| Token + `PYANCHOR_HOST=127.0.0.1` | Only useful from the same host (still bad if attacker has shell access) |
| Token + reverse proxy IP allowlist | Useless unless attacker is on the corp VPN / allowed CIDR |
| Token + gate cookie | Useless unless attacker also gets a valid gate cookie (= session cookie of an allowlisted user) |
| Token + gate cookie + PR mode | Even if attacker bypasses the gate, **they cannot make a live change** — PR opens, frontend reviews, merge required |
| Above + signed actor + audit log | Forensics — every attempted edit is recorded with a tamper-proof "who" field. Attacker cannot blame a real teammate |

The gate cookie + PR mode combination is the single highest-leverage
defense. A leaked token without those two is "we have to rotate now";
a leaked token with both is "we should rotate when convenient and
audit the log to see what was attempted".

## "Per-user accounts inside pyanchor?"

**Not currently.** Pyanchor is single-tenant by design (one token,
one queue, one workspace, one app). Per-user permissions live in
the host app's existing auth system (which you reuse via the gate
cookie). A future `v1.x` may add multi-tenancy — design at
[`MULTI-TENANCY-DESIGN.md`](./MULTI-TENANCY-DESIGN.md), shipping
when there's demand from a multi-app adopter.

In the meantime, the supported pattern for "different teammates,
different powers" is:

- Everyone gets the same `PYANCHOR_TOKEN`
- Different teammates get different gate cookie eligibility (your
  host app decides who gets the cookie set)
- All edits go through PR mode, so per-user "what they're allowed to
  ship" is decided by your existing GitHub branch protection /
  CODEOWNERS / required reviewer rules
- HMAC-signed actor + audit log answers "who tried to do what"

## "Is `pyanchor doctor` useful for checking access setup?"

Partially. `pyanchor doctor` (v0.29.0+) reports the **state** of
each access layer (PYANCHOR_REQUIRE_GATE_COOKIE on/off, ALLOWED_ORIGINS
empty/set, PYANCHOR_ACTOR_SIGNING_SECRET set/unset, etc) but does
**not** evaluate whether your composition is appropriate for your
threat model. Doctor's role is "the sidecar will boot"; this doc's
role is "the sidecar will reject the right requests".

Sample doctor output for an underprotected setup:

```
Optional knobs
  ! PYANCHOR_ALLOWED_ORIGINS           (empty)
      → Production deployments should set this to a CSV of trusted origins...
  ! PYANCHOR_REQUIRE_GATE_COOKIE       false
      → Off by default. Set true for production gating (see docs/SECURITY.md).
  ! PYANCHOR_AUDIT_LOG                 disabled
      → Recommended for any team / production deploy.
```

Each `!` is a hint about a layer you may want to enable.

## Q&A

### "IP allowlist만 쓰면 안 돼?" / "Can I just use an IP allowlist?"

Yes — nginx `allow/deny` is the simplest single layer. Risk: IPs
shift in NAT / VPN / mobile environments, and an internal attacker
on the same network bypasses it. Combine with at least the gate
cookie for defense in depth.

### "Gate cookie는 pyanchor만의 새 인증인가?" / "Is the gate cookie a new auth system?"

No. It's a **channel** for transmitting "this user passed the host
app's auth" to the sidecar. The host decides who gets a cookie
(via NextAuth, OAuth, magic-word URL, IP check, anything). Pyanchor
just checks cookie presence.

### "Token rotation은?" / "How do I rotate the token?"

1. Generate a new one: `openssl rand -hex 32`
2. Update `PYANCHOR_TOKEN` in your sidecar's env
3. Update `data-pyanchor-token` in your bootstrap script tag (or
   `NEXT_PUBLIC_PYANCHOR_TOKEN` if you used `pyanchor init`)
4. Restart the sidecar AND redeploy the host app (so the new token
   reaches the browser)
5. Old token is now dead. Existing in-page sessions will 401 on
   their next API call and the user will need to refresh.

### "Per-route permissions inside pyanchor (e.g. designer can only edit /about, frontend can edit anywhere)?"

**Not currently.** Closest workaround: PR mode + GitHub CODEOWNERS.
Make `/app/about/**` owned by `@designers` and `/app/api/**` owned
by `@backend`. The PR pyanchor opens will require the matching
reviewer.

### "Can I run multiple sidecars for multiple teams on the same host?"

Yes, with separate ports + separate workspace dirs + separate tokens:

```bash
PYANCHOR_PORT=3010 PYANCHOR_WORKSPACE_DIR=/var/lib/pyan-team-a/workspace pyanchor &
PYANCHOR_PORT=3011 PYANCHOR_WORKSPACE_DIR=/var/lib/pyan-team-b/workspace pyanchor &
```

Each sidecar is fully isolated. The future multi-tenancy work
(`MULTI-TENANCY-DESIGN.md`) collapses this into a single sidecar
process with multiple workspaces, but the multi-process pattern
above already works today.

### "Anonymous traffic ever sees `bootstrap.js`?"

When `PYANCHOR_REQUIRE_GATE_COOKIE=true`, the sidecar returns 403
for the bootstrap asset itself if the cookie is missing. So the
overlay never even starts loading. This is recipe B in
[`SECURITY.md`](./SECURITY.md) and the basis of the
[`examples/nextjs-portfolio-gate/`](../examples/nextjs-portfolio-gate/)
+ [`examples/vite-react-portfolio-gate/`](../examples/vite-react-portfolio-gate/)
templates.

## See also

- [`SECURITY.md`](./SECURITY.md) — full threat model + deployment recipes A/B/C
- [`PRODUCTION-HARDENING.md`](./PRODUCTION-HARDENING.md) — operator playbook
  (separate Unix user, sudoers, audit shipping)
- [`MULTI-TENANCY-DESIGN.md`](./MULTI-TENANCY-DESIGN.md) — single-sidecar-many-tenants design (not yet implemented)
- [`API-STABILITY.md`](./API-STABILITY.md) — public surface contract
- [`../examples/nextjs-nextauth-gate/`](../examples/nextjs-nextauth-gate/) — gate cookie + existing auth working code
- [`../src/actor.ts`](../src/actor.ts) — `signActor()` source for HMAC-signed headers
