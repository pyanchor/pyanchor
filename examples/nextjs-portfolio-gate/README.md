# nextjs-portfolio-gate

Pyanchor wired to a Next.js 14 app with a **production gate cookie**
so anonymous visitors never see the devtools — useful when you want
to live-edit your own portfolio while it's actually deployed at a
public URL.

If you want the simpler "deploy with devtools off, dev with devtools
on" pattern, see [`../nextjs-minimal/`](../nextjs-minimal/) instead.

## What's here

```
nextjs-portfolio-gate/
  app/
    layout.tsx        ← reads pyanchor_dev cookie; conditionally renders bootstrap
    page.tsx          ← placeholder content
  middleware.ts       ← magic-word URL → sets/clears HttpOnly cookie
  scripts/
    restart.sh        ← stub PYANCHOR_RESTART_SCRIPT
  next.config.mjs     ← /_pyanchor rewrite to the sidecar
  package.json
```

## How the gate works

```
┌─────────────────┐         ┌────────────────┐         ┌──────────────┐
│ visitor's URL   │ ──────▶ │ middleware.ts  │ ──────▶ │  NextResponse │
│ ?_pyanchor=XYZ  │         │ verify env     │         │  + Set-Cookie │
└─────────────────┘         └────────────────┘         └──────────────┘
                                                              │
                                                              ▼
        next page load → cookies().get("pyanchor_dev") === "1"
                              │
                              ├─ true  → layout renders <script src=".../bootstrap.js">
                              │           (also carries data-pyanchor-require-gate-cookie
                              │            as fail-safe + trusted-hosts pin)
                              │
                              └─ false → no bootstrap script, no overlay,
                                         no token leak in HTML
```

Defense layers (any one alone would mostly stop anonymous traffic;
together they're belt-and-suspenders-and-belt):

1. `middleware.ts`: only the URL with the correct secret sets the cookie.
2. `app/layout.tsx`: bootstrap script tag is omitted server-side
   when the cookie is absent.
3. `data-pyanchor-require-gate-cookie="pyanchor_dev"` on the script
   tag: even if (2) misfires, the bootstrap refuses to mount the
   overlay without the cookie.
4. Sidecar's `PYANCHOR_REQUIRE_GATE_COOKIE=true` + `requireGateCookie`
   middleware: every `/_pyanchor/*` request returns 403 to anonymous
   traffic, regardless of (1)/(2)/(3).

## Run it

```bash
# 1. install deps
pnpm install

# 2. start Next.js
pnpm dev   # http://localhost:3000

# 3. start pyanchor (in a separate terminal)
export PYANCHOR_TOKEN=<random32+ bytes>
export PYANCHOR_APP_DIR=$(pwd)
export PYANCHOR_WORKSPACE_DIR=/tmp/pyanchor-portfolio-workspace
export PYANCHOR_RESTART_SCRIPT=$(pwd)/scripts/restart.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:3000/
export PYANCHOR_AGENT=openclaw
export PYANCHOR_ALLOWED_ORIGINS=http://localhost:3000

# v0.17.0+ — production gate
export PYANCHOR_REQUIRE_GATE_COOKIE=true
export PYANCHOR_GATE_COOKIE_NAME=pyanchor_dev

# Same secret used for the magic-word URL below
export PYANCHOR_GATE_SECRET=<your-long-random-secret>

pyanchor
```

Then in your browser:

1. Open `http://localhost:3000` → no devtools (cookie not set).
2. Open `http://localhost:3000/?_pyanchor=<your-long-random-secret>`
   → middleware sets the cookie, redirects to `/`, and from now on
   every page load shows the devtools.
3. Open `http://localhost:3000/?_pyanchor=logout` → cookie cleared,
   back to anonymous view.

## Deploying for real

The same pattern works on Vercel / Fly / Railway / Render / a VPS.
Two things to change:

- `next.config.mjs` rewrite: change `127.0.0.1:3010` to the actual
  internal hostname of your sidecar (e.g. a private network address
  on your VPS, or remove the rewrite and put the sidecar behind your
  reverse proxy directly).
- `secure: process.env.NODE_ENV === "production"` in `middleware.ts`
  is already set up — the cookie will be HTTPS-only on the deployed
  site, plain HTTP locally.

Everything else (the secret rotation, the auth pattern, etc.) is
your call.

## Threat model

See [`../../docs/SECURITY.md`](../../docs/SECURITY.md) for the
full pyanchor threat model. This example implements the
**Deployment recipe B** described there.
