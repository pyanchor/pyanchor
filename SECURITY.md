# Security policy

## Threat model

Pyanchor is a **self-hosted developer tool** that lets an authenticated
caller mutate source files in a repository, run a build, and restart a
running Next.js process. It is intentionally not a multi-tenant SaaS, and
its security boundary is therefore narrow: anything that holds a valid
`PYANCHOR_TOKEN` can patch your code and restart your frontend.

Treat the sidecar like an SSH key. Do not expose it to the open internet,
do not hand the token to untrusted clients, and do not enable the
in-page bootstrap injection on a domain that anonymous users can reach.

### What pyanchor does **not** do

- It does not authenticate end users. There is no notion of "user
  accounts" — everyone presenting the token has full access.
- It does not sandbox the agent. Whatever permissions the agent process
  (OpenClaw, Claude Code, etc.) has, pyanchor inherits.
- It does not enforce TLS. Always terminate TLS in front of the sidecar
  (nginx, Caddy, Cloudflare).

## Required hardening

1. **Set a strong token.** `PYANCHOR_TOKEN` is required. Generate with
   `openssl rand -hex 32` (32 bytes = 64 hex chars). The server warns if
   the token is shorter than 24 characters.
2. **Bind to localhost.** Default `PYANCHOR_HOST` is `127.0.0.1`. Put
   pyanchor behind a reverse proxy that adds TLS and (optionally) IP
   allowlisting.
3. **Don't inject the bootstrap script on public pages.** The
   `<script src="/_pyanchor/bootstrap.js">` tag should only be rendered
   for sessions you trust. The minimal example uses an env flag
   (`NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED`) that defaults to `false`.
4. **Hostname allowlist (since v0.1.1).** The bootstrap self-disables
   on hosts outside `localhost`, `127.0.0.1`, `[::1]`, and `*.local`.
   To enable on additional hosts, set
   `data-pyanchor-trusted-hosts="staging.example.com,..."` on the
   `<script>` tag. This is belt-and-suspenders defense against an
   accidental production build that still injects the script.
5. **Origin allowlist (since v0.1.1).** Set
   `PYANCHOR_ALLOWED_ORIGINS=https://app.example.com,https://stage.example.com`
   to reject `/api/edit` and `/api/cancel` requests whose `Origin` (or
   `Referer`) header is not in the list. When unset, every origin
   presenting a valid token is accepted (v0.1.0 compatibility).
6. **Rate limits.** The sidecar applies a per-IP token bucket on
   `POST /api/edit` (default: 6 requests / minute). Tune via fork or
   PR. Cancel and status calls are not rate-limited; protect them with
   network ACLs if needed.

## Token transport

The sidecar accepts the token via three transports:

- `Authorization: Bearer <token>` — preferred for explicit API calls.
- **`pyanchor_session` cookie** (since v0.2.2) — set by
  `POST /api/session` after a successful Bearer authentication. The
  cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` when the request
  arrived over TLS. The bootstrap script POSTs to `/api/session`
  automatically on first load, so the in-page overlay can keep working
  while the JS-readable token attribute can eventually be dropped.
- `?token=<token>` — accepted for cases where setting headers is hard
  (e.g. an `<img>` ping). Be aware that query-string tokens can leak via
  proxy logs and browser history; prefer the header when possible.

### CSRF caveat for cookie auth

Cookie-based auth is auto-sent on cross-origin requests, which expands
the CSRF surface compared to a Bearer header. **If you rely on the
session cookie path, you should also set
`PYANCHOR_ALLOWED_ORIGINS=https://your-app.example.com,...`** so the
`requireAllowedOrigin` middleware rejects edit/cancel calls coming from
unrelated origins. The `SameSite=Strict` flag we set on the cookie
already blocks most browser-driven cross-site requests, but defense in
depth via the origin allowlist is the recommended setup.

## Reporting a vulnerability

Email **shkm1420@gmail.com** with subject `[pyanchor] security`. Please
include a minimal reproduction and a suggested CVSS rating. Public
issues are fine for non-security bugs; do not open a public issue for an
unpatched vulnerability.

We aim to acknowledge security reports within 72 hours and ship a fix
or mitigation within 14 days for high-severity issues. Pyanchor is
maintained by a small team; please do not run public scanners against
production deployments without permission.
