# vite-react-portfolio-gate

Production gate-cookie pattern for **Vite + React** — same
defense-in-depth story as `nextjs-portfolio-gate/` but adapted to
Vite, which doesn't ship a Next.js-style middleware.

If you want the simpler "deploy with devtools off" pattern, see
[`../vite-react-minimal/`](../vite-react-minimal/) instead.

## Layout

```
vite-react-portfolio-gate/
  index.html        ← bootstrap script with require-gate-cookie attr
  server/
    gate.mjs        ← tiny standalone gate server (magic-word + proxy)
  src/
    main.tsx, App.tsx
  scripts/
    restart.sh      ← stub PYANCHOR_RESTART_SCRIPT
  vite.config.ts
  package.json
  tsconfig.json
```

## How it works (4 defense layers, same as nextjs-portfolio-gate)

```
visitor → gate server (port 5174)
            │
            ├─ ?_pyanchor=<secret> → set HttpOnly cookie + 302
            ├─ ?_pyanchor=logout → clear cookie + 302
            ├─ /_pyanchor/* → proxy to sidecar (which enforces gate too)
            └─ everything else → proxy to vite dev (5173) or static
```

1. **Gate server** (`server/gate.mjs`): only the URL with the right
   secret sets the cookie.
2. **Bootstrap fail-safe** (`data-pyanchor-require-gate-cookie="pyanchor_dev"`
   in `index.html`): even if the script tag reaches an anonymous
   visitor, the overlay refuses to mount without the cookie.
3. **Sidecar middleware** (`PYANCHOR_REQUIRE_GATE_COOKIE=true`):
   `/_pyanchor/*` requests get 403 without the cookie regardless
   of how they reached the sidecar.
4. **Bootstrap allowlist** (`data-pyanchor-trusted-hosts`): even
   with the cookie, the overlay won't load on hostnames outside
   the allowlist.

## Run it

```bash
pnpm install

# Pick a long random secret for the magic-word URL
export PYANCHOR_GATE_SECRET=$(openssl rand -hex 24)

# In one terminal: vite dev (port 5173) + gate server (port 5174)
pnpm dev

# In another terminal: pyanchor sidecar (port 3010)
export PYANCHOR_TOKEN=$(openssl rand -hex 32)
echo "$PYANCHOR_TOKEN"
# ⚠️  Copy that value into index.html — replace
# data-pyanchor-token="REPLACE_ME_WITH_PYANCHOR_TOKEN_VALUE"
# with the exact $PYANCHOR_TOKEN string. They MUST match or every
# overlay request 401s. (For production, use vite's `define` plugin
# to inject from a build-time env var instead of committing the value.)
export PYANCHOR_APP_DIR=$(pwd)
export PYANCHOR_WORKSPACE_DIR=/tmp/pyanchor-vite-workspace
export PYANCHOR_RESTART_SCRIPT=$(pwd)/scripts/restart.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:5174/
export PYANCHOR_AGENT=openclaw   # or any other adapter
export PYANCHOR_ALLOWED_ORIGINS=http://localhost:5174

# Production gating envs
export PYANCHOR_REQUIRE_GATE_COOKIE=true
export PYANCHOR_GATE_COOKIE_NAME=pyanchor_dev

pyanchor
```

Browser:

1. Open `http://127.0.0.1:5174` → no devtools (cookie not set).
2. Open `http://127.0.0.1:5174/?_pyanchor=<your-secret>` → cookie
   set, redirected, devtools active.
3. Open `http://127.0.0.1:5174/?_pyanchor=logout` → cookie cleared.

## Production deployment

Replace `server/gate.mjs` with nginx (snippet at the bottom of
the file). The cookie name and the v0.17.0 bootstrap fail-safe
attribute stay the same. See
[`../../docs/SECURITY.md`](../../docs/SECURITY.md) recipe B for
the full threat model.
