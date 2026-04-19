# Security model

## TL;DR

Pyanchor is a **dev-only sidecar**. The default deployment model is
`localhost` + a per-developer bearer token. If you want it on a
public-facing host (e.g. you'd like to live-edit your portfolio while
it's actually deployed), you must add a host-side gate so anonymous
traffic can't see it.

> **What we do NOT support**: pyanchor running on a public host
> without a host-app gate, with the bootstrap script rendered for
> anonymous visitors. The sidecar will still refuse API calls without
> auth, but the overlay UI will mount, the bootstrap will try its
> session exchange, and you'll be relying on a single defensive layer.

## Threat model

| Surface | Pyanchor's defense | Host app's responsibility |
|---|---|---|
| API auth | `PYANCHOR_TOKEN` bearer + opaque session cookie. Timing-safe compare. | Generate ≥32 random bytes. Don't ship to client outside dev gate. |
| Cross-site write requests | `PYANCHOR_ALLOWED_ORIGINS` allowlist + `SameSite=Strict` session cookie. | Set `PYANCHOR_ALLOWED_ORIGINS` to your dev origins explicitly. |
| Static asset gating (v0.17.0+) | `PYANCHOR_REQUIRE_GATE_COOKIE` middleware refuses static + API to anonymous traffic. | Set the gate cookie via host middleware after some auth. |
| Bootstrap script for anonymous traffic | `data-pyanchor-trusted-hosts` allowlist (loopback by default). `data-pyanchor-require-gate-cookie` mounts only when the named cookie is present. | Render the bootstrap `<script>` conditionally (cookie/auth check) **and** set the fail-safe attribute. |
| Token in JS-readable global | Bootstrap blanks `window.__PyanchorConfig.token` after the cookie session exchange returns 2xx. | Don't read the token before the exchange completes. |
| Path traversal on locale assets | `BUILT_IN_LOCALE_SET` whitelist + `^[a-z][a-z-]*[a-z]$` regex. Subprocess smoke test locks the contract. | None — pyanchor handles. |
| Subprocess sandbox (worker) | Worker shells out via `sudo` + `flock` to a system user. Each job runs in a per-worker workspace. | Provision the system user with the documented sudoers entry. Never run worker as root in production. |

## Deployment recipes

### A. Loopback-only dev (safest, default)

- `PYANCHOR_TOKEN=<random32+ bytes>` set in your shell or `.env.local`
- `PYANCHOR_ALLOWED_ORIGINS=http://localhost:3000` (your dev origin)
- Bootstrap renders only when `process.env.NODE_ENV !== "production"`
- Sidecar lives at `127.0.0.1:<port>`, never published

Risk: zero on production hosts (devtools never deploy). Tradeoff:
can't live-edit deployed sites.

### B. Production gate cookie (live edit your own deployed site)

This is the recommended pattern for use cases like "live-edit my own
portfolio while it's deployed publicly".

1. **Sidecar**: enable the gate.
   ```sh
   PYANCHOR_TOKEN=<random32+>
   PYANCHOR_REQUIRE_GATE_COOKIE=true
   PYANCHOR_GATE_COOKIE_NAME=pyanchor_dev
   PYANCHOR_ALLOWED_ORIGINS=https://your-portfolio.com
   ```
2. **Host app middleware**: set the gate cookie when the magic-word
   URL is hit. See `examples/nextjs-portfolio-gate/` for a complete
   Next.js middleware that does this.
3. **Host app layout**: render the bootstrap `<script>` only when
   the cookie is present, AND add the fail-safe attribute so even if
   you forget the conditional render, the overlay won't mount for
   anonymous traffic.
   ```tsx
   const isDev = cookies().get("pyanchor_dev")?.value === "1";
   {isDev && (
     <script
       src="/_pyanchor/bootstrap.js"
       defer
       data-pyanchor-token={process.env.PYANCHOR_TOKEN}
       data-pyanchor-require-gate-cookie="pyanchor_dev"
       data-pyanchor-trusted-hosts="your-portfolio.com"
     />
   )}
   ```

Defense layers stack:
1. Host middleware: only authorized visitors get the cookie.
2. Host layout: bootstrap script tag only renders when cookie present.
3. Bootstrap fail-safe: if (1) and (2) somehow misalign, the
   `data-pyanchor-require-gate-cookie` attribute makes the overlay
   skip mount.
4. Sidecar middleware: even if (1), (2), (3) all fail, every static
   asset and API call returns 403 to anonymous traffic.

Anonymous attacker has to break **all four** to see anything.

### C. Existing auth (NextAuth / Clerk / Lucia / etc.)

If your host app already has authentication, use it as the gate
instead of the magic-word pattern:

```tsx
const session = await getSession();
const isOwner = session?.user?.email === process.env.PYANCHOR_OWNER_EMAIL;

{isOwner && <script src="/_pyanchor/bootstrap.js" /* ... */ />}
```

Then set the gate cookie in your auth middleware too (so the
sidecar's `requireGateCookie` check passes for the same authenticated
session).

## Disclosure

If you find a security issue, please **do not open a public GitHub
issue**. Email the maintainer at the address listed in `package.json`'s
`author` field, or open a private security advisory via GitHub's
"Security" tab on the repo.

## What we will not commit to (pre-1.0)

- Backwards compatibility on the worker `state.json` schema.
- Backwards compatibility on the `__PyanchorConfig` shape (will pin
  for 1.0).
- Pinned API stability for the `__PyanchorRegisterStrings` /
  `LOCALE_REGISTERED_EVENT` hooks (will document for 1.0).
- Any guarantee about behavior in non-loopback deployments without
  the gate cookie pattern in place.

These will all be tightened for the 1.0 commitment. See
`docs/roadmap.md`.
