# astro-minimal

A minimal **Astro 4** app wired to pyanchor. Demonstrates the
non-built-in framework path: pyanchor doesn't ship an Astro profile,
so you supply `PYANCHOR_INSTALL_COMMAND` and `PYANCHOR_BUILD_COMMAND`
explicitly. Once that's done, every other feature works the same as on
Next.js or Vite.

## Why this matters

Pyanchor only has built-in profiles for **nextjs** and **vite** today.
For anything else (Astro, SvelteKit, Remix, Nuxt, plain Node + esbuild,
custom monorepos), you bypass the profile and pin the install/build
commands directly. This example proves the fallback works.

If you read pyanchor's worker logs you'll see:

```
[pyanchor] Unknown PYANCHOR_FRAMEWORK="astro". Falling back to "nextjs".
Built-in: nextjs, vite.
```

That warning is **expected** — the install/build overrides take
precedence over the profile, so the nextjs fallback is never actually
used for command resolution.

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
export PYANCHOR_INSTALL_COMMAND="pnpm install --frozen-lockfile"
export PYANCHOR_BUILD_COMMAND="astro check && astro build"

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
