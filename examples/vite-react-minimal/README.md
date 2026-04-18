# vite-react-minimal

A 6-file Vite + React app wired to pyanchor with the `vite` framework
profile. Mirrors `nextjs-minimal` so you can compare the two integrations
side-by-side.

## What's here

```
vite-react-minimal/
  src/
    App.tsx         ← single component to point the overlay at
    main.tsx        ← React entrypoint
  scripts/
    restart.sh      ← stub PYANCHOR_RESTART_SCRIPT
  index.html        ← injects /_pyanchor/bootstrap.js
  vite.config.ts    ← proxies /_pyanchor/* to the sidecar
  tsconfig.json
  package.json
```

## Run it

```bash
# 1. install deps
pnpm install

# 2. start Vite
pnpm dev   # http://localhost:5173

# 3. start pyanchor (in a separate terminal)
export PYANCHOR_TOKEN=<same value as data-pyanchor-token in index.html>
export PYANCHOR_APP_DIR=$(pwd)
export PYANCHOR_WORKSPACE_DIR=/tmp/pyanchor-vite-workspace
export PYANCHOR_RESTART_SCRIPT=$(pwd)/scripts/restart.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:5173/
export PYANCHOR_FRAMEWORK=vite
export PYANCHOR_AGENT=openclaw   # or codex / aider / claude-code
pyanchor
```

`PYANCHOR_FRAMEWORK=vite` swaps the defaults to:

- install: `npm install`
- build: `npm run build` (which runs `vite build`)
- workspace excludes: `dist`, `.vite`
- adapter brief hint: "Run a production build (`npm run build`)..."

If you use pnpm or yarn instead, set the commands explicitly:

```bash
export PYANCHOR_INSTALL_COMMAND="pnpm install --frozen-lockfile"
export PYANCHOR_BUILD_COMMAND="pnpm run build"
```

## Notes

- The `vite.config.ts` includes a `/_pyanchor` proxy so dev works without
  nginx. Replace it with a real reverse proxy in production.
- Vite has no file-system router by default, so `targetPath` hints don't
  resolve to a file unless you also use TanStack Router (`src/routes/...`)
  or a `src/pages/...` convention. Pyanchor still works without them —
  the agent just falls back to its own discovery.
- `next dev`-style HMR works the same way: `PYANCHOR_FAST_RELOAD=true`
  skips install + build + restart, dropping the per-edit cycle to ~1-2s.
