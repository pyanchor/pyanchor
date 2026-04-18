# Pyanchor

> Agent-agnostic AI live-edit sidecar for Next.js. Anchor edits straight into your running app.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-v0.1.0--prerelease-orange.svg)](./CHANGELOG.md)

Pyanchor is a small Express sidecar you bolt on to a running Next.js app.
A one-line `<script>` tag injects an in-page overlay (Shadow DOM, no
styling collisions). You point at any UI element, describe a change in
plain language, and your AI coding agent of choice does the edit, builds
the project, and restarts the frontend — all without you ever leaving
the browser.

Designed for **self-hosted, prod-attached** workflows. Not a SaaS, not
an IDE plugin.

## Why not just use Cursor / v0 / Lovable?

|  | Where it lives | What it edits |
|---|---|---|
| Cursor / Windsurf | Your editor | Files in a workspace |
| v0 / Lovable / bolt.new | The vendor's cloud | Brand-new apps |
| **Pyanchor** | The page you're looking at | The app you already shipped |

If you want to point at the live login page on your staging server and
say "make this dark mode", and you don't want your code to ever leave
your machine, this is for you.

## How it works

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  Your Next.js app       │     │  Pyanchor sidecar        │
│  (port 3000)            │     │  (port 3010, localhost)  │
│                         │     │                          │
│  layout.tsx injects:    │     │  Express server          │
│   <script               │ ──> │   /_pyanchor/bootstrap.js│
│     src="/_pyanchor/    │     │   /_pyanchor/overlay.js  │
│     bootstrap.js"       │     │   /_pyanchor/api/edit    │
│     defer />            │     │   /api/admin/*           │
│                         │     │                          │
│  Reverse-proxy /_pyanchor/* to the sidecar in nginx.     │
└─────────────────────────┘     └──────────────┬───────────┘
                                               │
                                               │ spawns worker
                                               ▼
                            ┌──────────────────────────────┐
                            │  Agent (OpenClaw or          │
                            │   Claude Code)               │
                            │                              │
                            │  1. mutate code in workspace │
                            │  2. next build               │
                            │  3. rsync workspace → app    │
                            │  4. restart frontend         │
                            └──────────────────────────────┘
```

## Quick start

```bash
pnpm add pyanchor
# or: npm i pyanchor / yarn add pyanchor / bun add pyanchor
```

Set the required environment, then start the sidecar:

```bash
export PYANCHOR_TOKEN=$(openssl rand -hex 32)
export PYANCHOR_APP_DIR=/abs/path/to/your/nextjs-app
export PYANCHOR_WORKSPACE_DIR=/abs/path/to/scratch-workspace
export PYANCHOR_RESTART_SCRIPT=/abs/path/to/restart-frontend.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:3000/

pyanchor
```

If anything required is missing, the sidecar refuses to start and prints
exactly which env var is missing. See [`.env.example`](./.env.example)
for every supported variable.

Inject the bootstrap into your Next.js app's root layout:

```tsx
// app/layout.tsx
const devtoolsEnabled = process.env.NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED === "true";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        {devtoolsEnabled && (
          <script src="/_pyanchor/bootstrap.js" defer data-pyanchor-token="<your-token>" />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

Reverse-proxy `/_pyanchor/*` to the sidecar in nginx:

```nginx
location /_pyanchor/ {
    proxy_pass http://127.0.0.1:3010/_pyanchor/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120;
}
```

Full integration walk-through: [`docs/integrate-with-nextjs.md`](./docs/integrate-with-nextjs.md).

## Supported agents

Pick a backend with `PYANCHOR_AGENT`:

| `PYANCHOR_AGENT` | Status | Notes |
|---|---|---|
| `openclaw` | ✅ default | OpenClaw CLI on `PATH`. See [`docs/openclaw-setup.md`](./docs/openclaw-setup.md). |
| `claude-code` | ✅ shipped | install peer dep `@anthropic-ai/claude-agent-sdk` |
| `codex` | 🟡 v0.2.0 | community adapter welcome |
| `aider` | 🟡 v0.2.0 | community adapter welcome |
| Goose, Cline, custom | 🟡 | implement the [`AgentRunner`](./src/agents/types.ts) interface — see [`docs/adapters.md`](./docs/adapters.md) |

The interface is ~70 lines; a working adapter is typically ~100-200.

## Configuration

Required (sidecar refuses to start without these):

| Variable | What it points at |
|---|---|
| `PYANCHOR_TOKEN` | Bearer token for the API. `openssl rand -hex 32`. |
| `PYANCHOR_APP_DIR` | Your Next.js project root. |
| `PYANCHOR_WORKSPACE_DIR` | Scratch dir the agent mutates before sync-back. |
| `PYANCHOR_RESTART_SCRIPT` | Executable that restarts your frontend. |
| `PYANCHOR_HEALTHCHECK_URL` | URL that returns 2xx once the frontend is back up. |

Common optional knobs: `PYANCHOR_AGENT`, `PYANCHOR_PORT` (default 3010),
`PYANCHOR_HOST` (default 127.0.0.1), `PYANCHOR_RUNTIME_BASE_PATH`
(default `/_pyanchor`). Full list in [`.env.example`](./.env.example).

## Security

Pyanchor is a **self-hosted developer tool**, not a SaaS. Anyone with
the bearer token can mutate your code and restart your frontend. Treat
the token like an SSH key.

Defaults that protect you out of the box:

- Sidecar binds to `127.0.0.1` — front it with nginx/Caddy + TLS.
- Every `/api/*` route and the admin index require `PYANCHOR_TOKEN`.
  `/healthz` and the static runtime bundles stay public.
- Per-IP token-bucket rate limit on `POST /api/edit` (6 / min default).
- Bootstrap injection is opt-in via your own env flag (the example
  above uses `NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED`).

Full threat model and reporting policy: [`SECURITY.md`](./SECURITY.md).

## Documentation

| | |
|---|---|
| [`docs/integrate-with-nextjs.md`](./docs/integrate-with-nextjs.md) | Wire pyanchor into your existing Next.js app |
| [`docs/openclaw-setup.md`](./docs/openclaw-setup.md) | Install OpenClaw and point pyanchor at it |
| [`docs/adapters.md`](./docs/adapters.md) | Build your own agent adapter |
| [`SECURITY.md`](./SECURITY.md) | Threat model + reporting |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Local dev, build, release flow |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release notes |
| [`examples/nextjs-minimal/`](./examples/nextjs-minimal) | A 5-file Next.js app wired to pyanchor |

## Status

`v0.1.0` is the first public release. Expect API and config breaks
between minor versions until `v1.0.0`. Planned for `v0.2.0`:

- Move OpenClaw behind the `AgentRunner` interface (currently inline).
- Codex CLI and Aider reference adapters.
- Split the >1k LOC files (`worker/runner.ts`, `runtime/overlay.ts`).
- Test scaffold (vitest), starting with the state machine.
- English-default UI strings + i18n shim.

## License

[MIT](./LICENSE) © 2026 PYAN
