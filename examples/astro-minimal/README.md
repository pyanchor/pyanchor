# astro-minimal

A minimal **Astro 4** app wired to pyanchor. Uses the built-in
`astro` framework profile (since v0.32.0): just set
`PYANCHOR_FRAMEWORK=astro` and the sidecar knows to skip `dist` /
`.astro` from rsync, run `npx astro build`, and route hint your
edits into `src/pages/`.

## Why this matters

Pyanchor ships first-class profiles for **5 frameworks**: nextjs,
vite, astro, sveltekit, remix. For anything else (Nuxt, plain
Node + esbuild, custom monorepos), the
`PYANCHOR_INSTALL_COMMAND` + `PYANCHOR_BUILD_COMMAND` override
path still works — pyanchor falls back to the nextjs profile for
the route-hint heuristics with a one-line warning.

## Layout

```
astro-minimal/
  src/
    layouts/Base.astro    ← bootstrap script tag (PUBLIC_* env-gated)
    pages/index.astro     ← landing page
  scripts/restart.sh      ← stub PYANCHOR_RESTART_SCRIPT
  astro.config.mjs        ← /_pyanchor proxy via vite.server.proxy
  tsconfig.json
  package.json
```

## Run it

```bash
pnpm install

# Token shared between host (PUBLIC_*) and sidecar
export PUBLIC_PYANCHOR_DEVTOOLS_ENABLED=true
export PUBLIC_PYANCHOR_TOKEN=$(openssl rand -hex 32)
export PYANCHOR_TOKEN=$PUBLIC_PYANCHOR_TOKEN

pnpm dev   # http://localhost:4321
```

In another terminal:

```bash
export PYANCHOR_TOKEN=<same as above>
export PYANCHOR_APP_DIR=$(pwd)
export PYANCHOR_WORKSPACE_DIR=/tmp/pyanchor-astro-workspace

# These two are the key bits — Astro doesn't have a built-in profile
export PYANCHOR_FRAMEWORK=astro
# Built-in astro profile (v0.32.0+) defaults install/build to npm.
# Override for pnpm/yarn:
# export PYANCHOR_INSTALL_COMMAND="pnpm install --frozen-lockfile"
# Or promote build to type-check-then-build (needs @astrojs/check + typescript):
# export PYANCHOR_BUILD_COMMAND="npx astro check && npx astro build"

# Optional: silence the framework warning by setting the var (the
# value is ignored once install/build are pinned, but at least the
# log line tells future-you what was intended)
export PYANCHOR_FRAMEWORK=astro

export PYANCHOR_RESTART_SCRIPT=$(pwd)/scripts/restart.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:4321/
export PYANCHOR_AGENT=openclaw
export PYANCHOR_ALLOWED_ORIGINS=http://localhost:4321
pyanchor
```

## How the proxy works

Astro uses Vite under the hood, so `/_pyanchor/*` is proxied through
`vite.server.proxy` (see [`astro.config.mjs`](./astro.config.mjs)).
This is the same mechanism the Vite example uses — Astro just
re-exports it.

In production you'd terminate `/_pyanchor/*` at nginx (or whatever
reverse proxy fronts your Astro `astro preview` / static build) and
forward to `127.0.0.1:3010`.

## Adding a real Astro framework profile

If you maintain pyanchor and want first-class Astro support, the
hook point is [`src/frameworks/index.ts`](../../src/frameworks/index.ts):

```ts
const profiles: Record<string, FrameworkProfile> = {
  nextjs: nextjsProfile,
  vite: viteProfile,
  astro: astroProfile   // ← add this
};
```

A profile only needs `installCommand` + `buildCommand` defaults plus a
display name. The override-via-env path this example demonstrates will
keep working regardless.

## What works the same as Next.js

- `<script src="/_pyanchor/bootstrap.js">` boot
- All 5 agent adapters (set `PYANCHOR_AGENT`)
- Output modes (`apply` / `pr` / `dryrun`)
- Gate cookie + `data-pyanchor-require-gate-cookie`
- Audit log + webhooks + admin metrics

## See also

- [`docs/integrate-with-vite.md`](../../docs/integrate-with-vite.md)
  — same proxy mechanism, more detail
- [`../vite-react-minimal/`](../vite-react-minimal/) — the Vite
  built-in profile reference
