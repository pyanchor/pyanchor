# sveltekit-minimal

A minimal **SvelteKit 2** app wired to pyanchor. Uses the built-in
`sveltekit` framework profile (since v0.32.0): just set
`PYANCHOR_FRAMEWORK=sveltekit` and the sidecar knows to skip
`.svelte-kit` / `build` from rsync, run `npm run build`, and route
hint your edits into `src/routes/+page.svelte`.

## Why this matters

Pyanchor ships first-class profiles for **5 frameworks**: nextjs,
vite, astro, sveltekit, remix. Each profile bundles framework-
specific defaults (install/build commands, rsync excludes, route
hint heuristics) so the sidecar doesn't need any per-stack
configuration from you beyond the env var.

Anything else (Nuxt, custom stacks) still works via the
`PYANCHOR_INSTALL_COMMAND` + `PYANCHOR_BUILD_COMMAND` override
path — see the worker log warning + override docs in
[`docs/integrate-with-vite.md`](../../docs/integrate-with-vite.md).

## Layout

```
sveltekit-minimal/
  src/
    routes/
      +layout.svelte    ← bootstrap script tag (PUBLIC_* env-gated)
      +page.svelte      ← landing page
    app.html            ← document shell
  scripts/restart.sh    ← stub PYANCHOR_RESTART_SCRIPT
  vite.config.ts        ← /_pyanchor proxy via vite.server.proxy
  svelte.config.js
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

pnpm dev   # http://localhost:5173
```

In another terminal:

```bash
export PYANCHOR_TOKEN=<same as above>
export PYANCHOR_APP_DIR=$(pwd)
export PYANCHOR_WORKSPACE_DIR=/tmp/pyanchor-sveltekit-workspace

# Built-in sveltekit profile (v0.32.0+) handles install + build + route hints
export PYANCHOR_FRAMEWORK=sveltekit
# Override the default install command if you use pnpm or yarn:
# export PYANCHOR_INSTALL_COMMAND="pnpm install --frozen-lockfile"

export PYANCHOR_RESTART_SCRIPT=$(pwd)/scripts/restart.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:5173/
export PYANCHOR_AGENT=openclaw
export PYANCHOR_ALLOWED_ORIGINS=http://localhost:5173
pyanchor
```

## How the proxy works

SvelteKit uses Vite under the hood, so `/_pyanchor/*` is proxied
through `vite.server.proxy` (see [`vite.config.ts`](./vite.config.ts)).
Same mechanism as the Vite + Astro examples.

In production you'd terminate `/_pyanchor/*` at nginx and forward
to `127.0.0.1:3010`.

## Adding a real SvelteKit framework profile

If you maintain pyanchor and want first-class SvelteKit support,
the hook point is [`src/frameworks/index.ts`](../../src/frameworks/index.ts):

```ts
const profiles: Record<string, FrameworkProfile> = {
  nextjs: nextjsProfile,
  vite: viteProfile,
  sveltekit: sveltekitProfile   // ← add this
};
```

A profile only needs `installCommand` + `buildCommand` defaults
plus a display name. The override-via-env path this example
demonstrates will keep working regardless.

## What works the same as Next.js

- `<script src="/_pyanchor/bootstrap.js">` boot
- All 5 agent adapters (set `PYANCHOR_AGENT`)
- Output modes (`apply` / `pr` / `dryrun`)
- Gate cookie + `data-pyanchor-require-gate-cookie`
- Audit log + webhooks + admin metrics
- HMAC actor signing

## See also

- [`docs/integrate-with-vite.md`](../../docs/integrate-with-vite.md)
  — same proxy mechanism, more detail
- [`../astro-minimal/`](../astro-minimal/) — Astro equivalent
  (also uses Vite proxy under the hood)
- [`../vite-react-minimal/`](../vite-react-minimal/) — built-in
  Vite profile reference
