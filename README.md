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

## Prerequisites: pick an agent first

Pyanchor doesn't bring its own LLM. You wire it to an external agentic
coding tool. **Set this up before installing pyanchor itself** — both
backends need credentials and one of them needs a CLI install:

### A) OpenClaw (default)

The OpenClaw CLI must be installed and `openclaw onboard` must have run
at least once for the user that will invoke it. The full walkthrough
(install, dedicated agent user, sudoers, model selection, smoke test)
is in [`docs/openclaw-setup.md`](./docs/openclaw-setup.md). Quick check:

```bash
which openclaw && openclaw --version
ls ~/.openclaw 2>/dev/null && echo "onboarded" || echo "run: openclaw onboard"
```

You will also need an agent workspace dir owned by whichever user
runs OpenClaw, and (in production-style setups) sudo privileges for
pyanchor's user to invoke OpenClaw as the agent user. Worth reading
the setup doc end-to-end.

### B) Claude Code

The Anthropic Agent SDK must be installed in the project that runs
pyanchor (it's an **optional peer dep**, doesn't auto-install) and
`ANTHROPIC_API_KEY` must be in pyanchor's process env. See
[`docs/claude-code-setup.md`](./docs/claude-code-setup.md). Quick
version:

```bash
pnpm add @anthropic-ai/claude-agent-sdk
export ANTHROPIC_API_KEY=sk-ant-...
export PYANCHOR_AGENT=claude-code
```

This path has fewer moving parts than OpenClaw — recommended if you're
trying pyanchor for the first time.

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
export PYANCHOR_AGENT=openclaw   # or claude-code

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
| `openclaw` | ✅ default | OpenClaw CLI on `PATH` + `openclaw onboard`. Full setup: [`docs/openclaw-setup.md`](./docs/openclaw-setup.md). |
| `claude-code` | ✅ shipped | install peer dep `@anthropic-ai/claude-agent-sdk` + `ANTHROPIC_API_KEY`. Full setup: [`docs/claude-code-setup.md`](./docs/claude-code-setup.md). |
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
| [`docs/claude-code-setup.md`](./docs/claude-code-setup.md) | Install the Anthropic Agent SDK and route pyanchor through Claude |
| [`docs/adapters.md`](./docs/adapters.md) | Build your own agent adapter |
| [`SECURITY.md`](./SECURITY.md) | Threat model + reporting |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Local dev, build, release flow |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release notes |
| [`examples/nextjs-minimal/`](./examples/nextjs-minimal) | A 5-file Next.js app wired to pyanchor |

## Multi-user

`v0.1.0` is **single-tenant by design**: one bearer token, one queue,
one workspace, one Next.js app. Anyone holding `PYANCHOR_TOKEN` has the
same capabilities as the maintainer. This matches the "personal /
small-team self-hosted" use case and keeps the threat model tight.

Multi-user is on the roadmap if there's demand:

| Level | What it adds | Tracked for |
|---|---|---|
| 1 | Multiple named tokens + per-user audit log; shared workspace and queue | `v0.3.0` |
| 2 | Per-user queues + simple route-level locking when two users target the same page | `v0.4.0` |
| 3 | Per-user branches + PR-style approval flow (effectively a Git review platform) | likely a separate fork (`pyanchor-team`) |
| 4 | Multi-tenant SaaS (multiple apps, multiple orgs, billing) | out of scope; that's a different product |

If you need any of these, open an issue describing your workflow — the
`v0.3.0` design will be informed by what people actually ask for, not
by what I think the abstraction should be.

## Status

`v0.1.0` is the first public release. Expect API and config breaks
between minor versions until `v1.0.0`. Planned for `v0.2.0`:

- Move OpenClaw behind the `AgentRunner` interface (currently inline).
- Codex CLI and Aider reference adapters.
- Split the >1k LOC files (`worker/runner.ts`, `runtime/overlay.ts`).
- Test scaffold (vitest), starting with the state machine.
- Replace ad-hoc i18n placeholders with a real translation shim.

## License

[MIT](./LICENSE) © 2026 PYAN
