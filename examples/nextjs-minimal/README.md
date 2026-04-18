# nextjs-minimal

A 5-file Next.js 14 (App Router) app wired to pyanchor. Use it as a
reference when adding pyanchor to your own project, or as a sandbox to
test the sidecar end-to-end.

## What's here

```
nextjs-minimal/
  app/
    layout.tsx        ← injects /_pyanchor/bootstrap.js when the env flag is on
    page.tsx          ← a single H1 to point the overlay at
  scripts/
    restart.sh        ← a stub PYANCHOR_RESTART_SCRIPT
  .env.example        ← copy to .env.local
  next.config.mjs
  package.json
```

## Run it

```bash
# 1. install deps
pnpm install

# 2. copy and fill the env file
cp .env.example .env.local
# edit .env.local and set NEXT_PUBLIC_PYANCHOR_TOKEN

# 3. start Next.js
pnpm dev   # http://localhost:3000

# 4. start pyanchor (in a separate terminal)
export PYANCHOR_TOKEN=<same value as NEXT_PUBLIC_PYANCHOR_TOKEN>
export PYANCHOR_APP_DIR=$(pwd)
export PYANCHOR_WORKSPACE_DIR=/tmp/pyanchor-workspace
export PYANCHOR_RESTART_SCRIPT=$(pwd)/scripts/restart.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:3000/
export PYANCHOR_AGENT=openclaw   # or claude-code
pyanchor
```

You'll need a reverse proxy (or Next.js rewrites) to forward
`/_pyanchor/*` from port 3000 to pyanchor on 3010. The simplest dev
option is a `next.config.mjs` rewrite — uncomment the block in this
example's config file.

## Next steps

- For the full integration walk-through (TLS, nginx, process supervision)
  see [`docs/integrate-with-nextjs.md`](../../docs/integrate-with-nextjs.md).
- For OpenClaw setup, see [`docs/openclaw-setup.md`](../../docs/openclaw-setup.md).
