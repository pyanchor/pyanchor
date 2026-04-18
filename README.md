<div align="center">

# Pyanchor 🦞

**Agent-agnostic AI live-edit sidecar for your web app.**
*Anchor edits straight into your running app — Next.js, Vite, or your own stack.*

[![npm version](https://img.shields.io/npm/v/pyanchor.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/pyanchor)
[![npm downloads](https://img.shields.io/npm/dm/pyanchor.svg?style=flat-square)](https://www.npmjs.com/package/pyanchor)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/pyanchor/pyanchor?style=flat-square)](https://github.com/pyanchor/pyanchor/stargazers)

[**Documentation**](#-documentation) ·
[**Quick start**](#-quick-start) ·
[**Supported agents**](#supported-agents) ·
[**Security**](#-security) ·
[**Roadmap**](#-status)

</div>

---

> Pyanchor is a small Express sidecar you bolt on to a running Next.js app.
> A one-line `<script>` tag injects an in-page overlay (Shadow DOM, no
> styling collisions). You point at any UI element, describe a change in
> plain language, and your AI coding agent of choice does the edit, builds
> the project, and restarts the frontend — all without you ever leaving
> the browser.

Designed for **self-hosted, prod-attached** workflows. Not a SaaS, not
an IDE plugin.

## Why not just use Cursor / v0 / Lovable?

|                              | Where it lives           | What it edits                     |
| ---------------------------- | ------------------------ | --------------------------------- |
| Cursor / Windsurf            | Your editor              | Files in a workspace              |
| v0 / Lovable / bolt.new      | The vendor's cloud       | Brand-new apps                    |
| **Pyanchor**                 | The page you're looking at | The app you already shipped     |

If you want to point at the live login page on your staging server and
say *"make this dark mode"*, and you don't want your code to ever leave
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

<details open>
<summary><strong>A) OpenClaw</strong> (default) — full guide: <a href="./docs/openclaw-setup.md"><code>docs/openclaw-setup.md</code></a></summary>

```bash
which openclaw && openclaw --version
ls ~/.openclaw 2>/dev/null && echo "onboarded" || echo "run: openclaw onboard"
```

You will also need an agent workspace dir owned by whichever user
runs OpenClaw, and (in production-style setups) sudo privileges for
pyanchor's user to invoke OpenClaw as the agent user. Worth reading
the setup doc end-to-end.

</details>

<details>
<summary><strong>B) Claude Code</strong> — full guide: <a href="./docs/claude-code-setup.md"><code>docs/claude-code-setup.md</code></a></summary>

```bash
pnpm add @anthropic-ai/claude-agent-sdk
export ANTHROPIC_API_KEY=sk-ant-...
export PYANCHOR_AGENT=claude-code
```

This path has fewer moving parts than OpenClaw — recommended if you're
trying pyanchor for the first time.

</details>

## 🚀 Quick start

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
| --- | --- | --- |
| `openclaw` | ✅ default | OpenClaw CLI on `PATH` + `openclaw onboard`. Setup: [`docs/openclaw-setup.md`](./docs/openclaw-setup.md) |
| `claude-code` | ✅ shipped | install peer dep `@anthropic-ai/claude-agent-sdk` + `ANTHROPIC_API_KEY`. Setup: [`docs/claude-code-setup.md`](./docs/claude-code-setup.md) |
| `codex` | ✅ shipped | OpenAI Codex CLI on `PATH`. Install: `npm i -g @openai/codex`. Override binary with `PYANCHOR_CODEX_BIN`. |
| `aider` | ✅ shipped | aider-chat CLI on `PATH`. Install: `pip install aider-chat`. Workspace should be a git repo. Override binary with `PYANCHOR_AIDER_BIN`. |
| Goose, Cline, custom | 🟡 | implement the [`AgentRunner`](./src/agents/types.ts) interface — see [`docs/adapters.md`](./docs/adapters.md) |

The interface is ~70 lines; a working adapter is typically ~100-200.

## Supported frameworks

Pick a framework profile with `PYANCHOR_FRAMEWORK` (default: `nextjs`).
The profile drives default install/build commands, rsync excludes, and
agent route hints.

| `PYANCHOR_FRAMEWORK` | Status | Default install | Default build | Workspace excludes |
| --- | --- | --- | --- | --- |
| `nextjs` | ✅ default | `corepack yarn install --frozen-lockfile` | `next build` (telemetry off) | `.next` |
| `vite` | ✅ shipped | `npm install` | `npm run build` | `dist`, `.vite` |
| Astro / Remix / SvelteKit / CRA / your own | 🟡 | set explicitly | set explicitly | falls through to `nextjs` profile route hints |

For frameworks we don't ship a profile for, you usually only need:

```bash
export PYANCHOR_INSTALL_COMMAND="pnpm install --frozen-lockfile"
export PYANCHOR_BUILD_COMMAND="pnpm run build"
```

Anything more (route-hint heuristics, custom rsync excludes) lives in
[`src/frameworks/`](./src/frameworks/) — adding a new profile is ~50 lines.
PRs welcome.

## ⚙️ Configuration

Required (sidecar refuses to start without these):

| Variable | What it points at |
| --- | --- |
| `PYANCHOR_TOKEN` | Bearer token for the API. `openssl rand -hex 32`. |
| `PYANCHOR_APP_DIR` | Your app's project root (Next.js / Vite / etc.). |
| `PYANCHOR_WORKSPACE_DIR` | Scratch dir the agent mutates before sync-back. |
| `PYANCHOR_RESTART_SCRIPT` | Executable that restarts your frontend. |
| `PYANCHOR_HEALTHCHECK_URL` | URL that returns 2xx once the frontend is back up. |

Common optional knobs: `PYANCHOR_AGENT`, `PYANCHOR_FRAMEWORK`,
`PYANCHOR_INSTALL_COMMAND`, `PYANCHOR_BUILD_COMMAND`, `PYANCHOR_PORT`
(default 3010), `PYANCHOR_HOST` (default 127.0.0.1),
`PYANCHOR_RUNTIME_BASE_PATH` (default `/_pyanchor`),
`PYANCHOR_ALLOWED_ORIGINS` (CSRF allowlist).
Full list in [`.env.example`](./.env.example).

## 🛡️ Security

Pyanchor is a **self-hosted developer tool**, not a SaaS. Anyone with
the bearer token can mutate your code and restart your frontend. Treat
the token like an SSH key.

Defaults that protect you out of the box:

- Sidecar binds to `127.0.0.1` — front it with nginx/Caddy + TLS.
- Every `/api/*` route and the admin index require `PYANCHOR_TOKEN`.
  `/healthz` and the static runtime bundles stay public.
- Per-IP token-bucket rate limits on the write APIs:
  `POST /api/edit` (6 / min default), `POST /api/cancel` (30 / min default).
- Bootstrap injection is opt-in via your own env flag (the example
  above uses `NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED`).
- **Bootstrap self-disables on untrusted hosts.** By default it only
  loads on `localhost` / `127.0.0.1` / `*.local`. Override per-page
  with `data-pyanchor-trusted-hosts="staging.example.com,..."`.
- **Origin allowlist (opt-in).** Set `PYANCHOR_ALLOWED_ORIGINS=...` to
  reject `/api/edit` calls whose `Origin` header isn't in the list.

Full threat model and reporting policy: [`SECURITY.md`](./SECURITY.md).

### Production safety checklist

Before deploying to anything reachable from the public internet:

- [ ] `NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED=false` (or unset) in your
      prod build env. **Verify with**: `grep -r "_pyanchor/bootstrap.js" .next/`
      after `next build` — should return zero matches.
- [ ] `PYANCHOR_HOST=127.0.0.1` (default). Do not bind `0.0.0.0`.
- [ ] nginx `location /_pyanchor/` block is gated by IP allowlist,
      basic auth, or the same auth your admin pages use.
- [ ] `PYANCHOR_TOKEN` is ≥32 bytes, unique per environment, and
      stored in a secret manager (not committed).
- [ ] `PYANCHOR_ALLOWED_ORIGINS` is set to your trusted dev / staging
      origins.
- [ ] `data-pyanchor-trusted-hosts` on the `<script>` tag (when not
      using a default trusted host) lists only the host you actually
      use the overlay on.
- [ ] Restart script (`PYANCHOR_RESTART_SCRIPT`) is owned by you and
      runs only the restart command — no shell injection surface.

## 👥 Multi-user

`v0.1.0` is **single-tenant by design**: one bearer token, one queue,
one workspace, one Next.js app. Anyone holding `PYANCHOR_TOKEN` has the
same capabilities as the maintainer. This matches the "personal /
small-team self-hosted" use case and keeps the threat model tight.

Multi-user is on the roadmap if there's demand:

| Level | What it adds | Tracked for |
| --- | --- | --- |
| 1 | Multiple named tokens + per-user audit log; shared workspace and queue | `v0.3.0` |
| 2 | Per-user queues + simple route-level locking when two users target the same page | `v0.4.0` |
| 3 | Per-user branches + PR-style approval flow (effectively a Git review platform) | likely a separate fork (`pyanchor-team`) |
| 4 | Multi-tenant SaaS (multiple apps, multiple orgs, billing) | out of scope; that's a different product |

If you need any of these, open an issue describing your workflow — the
`v0.3.0` design will be informed by what people actually ask for, not
by what I think the abstraction should be.

## 📚 Documentation

| | |
| --- | --- |
| [`docs/integrate-with-nextjs.md`](./docs/integrate-with-nextjs.md) | Wire pyanchor into your existing Next.js app |
| [`docs/openclaw-setup.md`](./docs/openclaw-setup.md) | Install OpenClaw and point pyanchor at it |
| [`docs/claude-code-setup.md`](./docs/claude-code-setup.md) | Install the Anthropic Agent SDK and route pyanchor through Claude |
| [`docs/adapters.md`](./docs/adapters.md) | Build your own agent adapter |
| [`SECURITY.md`](./SECURITY.md) | Threat model + reporting |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Local dev, build, release flow |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release notes |
| [`examples/nextjs-minimal/`](./examples/nextjs-minimal) | A 5-file Next.js app wired to pyanchor |
| [`examples/vite-react-minimal/`](./examples/vite-react-minimal) | A 6-file Vite + React app wired to pyanchor (`PYANCHOR_FRAMEWORK=vite`) |

## 🔭 Status

`v0.x` is early. Expect API and config breaks between minor versions
until `v1.0.0`.

Shipped highlights so far:

- `v0.2.x` — `AgentRunner` interface, codex / aider / claude-code adapters,
  cookie-based sessions, atomic state writes, fast-reload mode, persistent
  workspace caches.
- `v0.4.0` — `PYANCHOR_FRAMEWORK` profile system + `PYANCHOR_BUILD_COMMAND` /
  `PYANCHOR_INSTALL_COMMAND` overrides. Vite shipped as the second profile;
  Astro / Remix / SvelteKit work today via the two command env vars.

Coming:

- `v0.5.0` — test coverage push (Playwright e2e for the overlay,
  integration tests for `worker/runner.ts`, mocked adapter tests).
- Multi-user roadmap (see [Multi-user](#-multi-user)).
- More framework profiles (PRs welcome — `src/frameworks/` is ~50 LOC each).

## License

[MIT](./LICENSE) © 2026 PYAN
