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
4. **Rate limits.** The sidecar applies a per-IP token bucket on
   `POST /api/edit` (default: 6 requests / minute). Tune via fork or
   PR. Cancel and status calls are not rate-limited; protect them with
   network ACLs if needed.

## Token transport

The sidecar accepts the token via:

- `Authorization: Bearer <token>` — preferred for API calls.
- `?token=<token>` — accepted for cases where setting headers is hard
  (e.g. an `<img>` ping). Be aware that query-string tokens can leak via
  proxy logs and browser history; prefer the header when possible.

## Reporting a vulnerability

Email **shkm1420@gmail.com** with subject `[pyanchor] security`. Please
include a minimal reproduction and a suggested CVSS rating. Public
issues are fine for non-security bugs; do not open a public issue for an
unpatched vulnerability.

We aim to acknowledge security reports within 72 hours and ship a fix
or mitigation within 14 days for high-severity issues. Pyanchor is
maintained by a small team; please do not run public scanners against
production deployments without permission.
