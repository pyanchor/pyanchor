# nextjs-nextauth-gate

Concrete implementation of the **`docs/SECURITY.md` recipe C** —
"existing auth as the gate" — using NextAuth (Auth.js v4).

If you're on **Auth.js v5**, the imports change but the pattern
stays the same: server-side session check + email allowlist + set
the pyanchor cookie via a server-side route.

If you don't have any auth, see
[`../nextjs-portfolio-gate/`](../nextjs-portfolio-gate/) for the
magic-word URL pattern instead.

## Layout

```
nextjs-nextauth-gate/
  app/
    layout.tsx                 ← reads pyanchor_dev cookie, conditionally renders bootstrap
    page.tsx                   ← landing with "Sign in" link
    api/
      auth/[...nextauth]/route.ts  ← NextAuth handler
      pyanchor-gate/route.ts        ← issues pyanchor_dev cookie after auth check
  lib/
    auth.ts                    ← NextAuth config + isPyanchorAllowed()
  scripts/
    restart.sh                 ← stub PYANCHOR_RESTART_SCRIPT
  next.config.mjs              ← /_pyanchor proxy
  package.json
```

## Flow

```
visitor → NextAuth sign-in (GitHub)
            │
            ↓ user.email in allowlist?
            ├─ no  → redirect home, no cookie set
            └─ yes → /api/pyanchor-gate
                       │
                       ↓ Set-Cookie: pyanchor_dev=1; HttpOnly
                       └─ redirect to /
visitor → /
            │
            ↓ layout.tsx reads cookie
            ├─ present → bootstrap script renders → overlay mounts
            └─ absent  → no bootstrap, no overlay
```

## Defense layers

1. **NextAuth signIn callback** rejects users not in
   `PYANCHOR_DEV_EMAILS` at the auth step itself.
2. **`/api/pyanchor-gate`** double-checks the allowlist before
   issuing the cookie — even if NextAuth misconfigures, this
   gate enforces.
3. **`layout.tsx` cookie check** omits the bootstrap script tag
   server-side from anonymous responses.
4. **`data-pyanchor-require-gate-cookie="pyanchor_dev"`** on the
   script tag — fail-safe if (1)/(2)/(3) misalign.
5. **Sidecar `PYANCHOR_REQUIRE_GATE_COOKIE=true`** — final
   defense at the API layer.

## Run it

```bash
pnpm install

# NextAuth secret + GitHub OAuth app credentials
export NEXTAUTH_SECRET=$(openssl rand -hex 32)
export NEXTAUTH_URL=http://localhost:3000
export GITHUB_ID=<from github.com/settings/applications/new>
export GITHUB_SECRET=<...>

# Who's allowed to use pyanchor (CSV of emails)
export PYANCHOR_DEV_EMAILS="alice@example.com,bob@example.com"

# Pyanchor token (matches sidecar)
export PYANCHOR_TOKEN=$(openssl rand -hex 32)

pnpm dev   # http://localhost:3000

# In another terminal: sidecar
export PYANCHOR_TOKEN=<same>
export PYANCHOR_APP_DIR=$(pwd)
export PYANCHOR_WORKSPACE_DIR=/tmp/pyanchor-nextauth-workspace
export PYANCHOR_RESTART_SCRIPT=$(pwd)/scripts/restart.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:3000/
export PYANCHOR_AGENT=openclaw
export PYANCHOR_ALLOWED_ORIGINS=http://localhost:3000

# Production gating
export PYANCHOR_REQUIRE_GATE_COOKIE=true
export PYANCHOR_GATE_COOKIE_NAME=pyanchor_dev

pyanchor
```

Sign in flow:

1. `http://localhost:3000` → click "Sign in with GitHub"
2. GitHub OAuth → if your email is in `PYANCHOR_DEV_EMAILS`,
   NextAuth lets you in
3. Visit `http://localhost:3000/api/pyanchor-gate` → cookie set,
   redirected
4. From now on, the overlay mounts on every page load

## Production tweaks

- Use `secure: true` cookies (already gated by `NODE_ENV` in
  the route handler).
- Pin `data-pyanchor-trusted-hosts` to your real domain.
- Set `NEXTAUTH_URL` to your production URL.
- Rotate `PYANCHOR_DEV_EMAILS` when team membership changes.

See [`../../docs/SECURITY.md`](../../docs/SECURITY.md) recipe C
for the threat model walkthrough.
