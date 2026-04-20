# sveltekit-minimal

A minimal **SvelteKit 2** app wired to pyanchor. Demonstrates the
non-built-in framework path: pyanchor doesn't ship a SvelteKit
profile, so you supply `PYANCHOR_INSTALL_COMMAND` and
`PYANCHOR_BUILD_COMMAND` explicitly. Once that's done, every other
feature works the same as on Next.js or Vite.

## Why this matters

Pyanchor only has built-in profiles for **nextjs** and **vite**
today. SvelteKit, Astro, Remix, Nuxt, and any custom stack go
through the override path: pin install/build commands, get a
one-line warning, everything else just works. This example proves
the override path on SvelteKit (matching `astro-minimal/` for
Astro).

If you read pyanchor's worker logs you'll see:

```
[pyanchor] Unknown PYANCHOR_FRAMEWORK="sveltekit". Falling back to "nextjs".
Built-in: nextjs, vite.
```

That warning is **expected** — install/build overrides take
precedence over the profile.

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

# These two are the key bits — SvelteKit doesn't have a built-in profile
export PYANCHOR_INSTALL_COMMAND="pnpm install --frozen-lockfile"
export PYANCHOR_BUILD_COMMAND="pnpm build"

# Optional: make the fallback explicit. Setting this does NOT
# silence the warning ("Unknown PYANCHOR_FRAMEWORK") because
# pyanchor only ships nextjs / vite profiles — but it's a useful
# operator hint that future-you intentionally took the override
# path. Omit entirely if you'd rather have one fewer env var.
export PYANCHOR_FRAMEWORK=sveltekit

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
