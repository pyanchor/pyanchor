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

Five steps, ~5 minutes if your agent is already set up.

### 1. Install

```bash
pnpm add pyanchor
# or: npm i pyanchor / yarn add pyanchor / bun add pyanchor
```

### 2. Generate a token + create scratch dir

```bash
export PYANCHOR_TOKEN=$(openssl rand -hex 32)
mkdir -p /abs/path/to/scratch-workspace
```

### 3. Write the restart script

`restart-frontend.sh` — replace with your actual frontend reload
command (e.g. `pm2 reload my-app`, `systemctl restart my-app`).
For local `next dev`, a no-op is fine since dev server hot-reloads.

```bash
cat > /abs/path/to/restart-frontend.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec /usr/bin/pm2 reload my-frontend
EOF
chmod +x /abs/path/to/restart-frontend.sh
```

### 4. Start the sidecar

```bash
export PYANCHOR_APP_DIR=/abs/path/to/your/nextjs-app
export PYANCHOR_WORKSPACE_DIR=/abs/path/to/scratch-workspace
export PYANCHOR_RESTART_SCRIPT=/abs/path/to/restart-frontend.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:3000/
export PYANCHOR_AGENT=openclaw   # or claude-code | codex | aider

pyanchor
```

The sidecar refuses to start if anything required is missing and
tells you exactly which env var is wrong. Full env reference:
[`.env.example`](./.env.example).

### 5. Wire the bootstrap into your app

```tsx
// app/layout.tsx — Next.js example
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

For Next.js dev, also add a `/_pyanchor/*` rewrite in `next.config.mjs`:

```js
async rewrites() {
  return [{ source: "/_pyanchor/:path*", destination: "http://127.0.0.1:3010/_pyanchor/:path*" }];
}
```

For production, reverse-proxy via nginx (snippet below) AND read
[`docs/SECURITY.md`](./docs/SECURITY.md) for the production gate
cookie pattern that stops anonymous traffic from seeing the overlay.

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

That's it. Open your app, you should see the floating Pyanchor
trigger button at bottom-right. Click → describe a change → wait
~30s for the agent to apply + build + restart.

Full integration walk-through: [`docs/integrate-with-nextjs.md`](./docs/integrate-with-nextjs.md).
Browse all 8 runnable examples: [`examples/`](./examples/) (Next.js, Vite, Astro,
NextAuth gate, multi-agent swap, PR mode, …).

## Supported agents

Pick a backend with `PYANCHOR_AGENT`:

| `PYANCHOR_AGENT` | Status | Notes |
| --- | --- | --- |
| `openclaw` | ✅ default | OpenClaw CLI on `PATH` + `openclaw onboard`. Setup: [`docs/openclaw-setup.md`](./docs/openclaw-setup.md) |
| `claude-code` | ✅ shipped | install peer dep `@anthropic-ai/claude-agent-sdk` + `ANTHROPIC_API_KEY`. Setup: [`docs/claude-code-setup.md`](./docs/claude-code-setup.md) |
| `codex` | ✅ shipped | OpenAI Codex CLI on `PATH`. Install: `npm i -g @openai/codex`. Override binary with `PYANCHOR_CODEX_BIN`. |
| `aider` | ✅ shipped | aider-chat CLI on `PATH`. Install: `pip install aider-chat`. Workspace should be a git repo. Override binary with `PYANCHOR_AIDER_BIN`. |
| `gemini` | ✅ shipped | Google Gemini CLI on `PATH`. Install: `npm i -g @google/gemini-cli`. Auth: `GEMINI_API_KEY` env, `gemini auth login` (OAuth), or Vertex AI. Setup: [`docs/gemini-setup.md`](./docs/gemini-setup.md) |
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

Full threat model + 3 deployment recipes: [`docs/SECURITY.md`](./docs/SECURITY.md).
Operator hardening playbook (separate Unix user, systemd sandbox,
audit shipping): [`docs/PRODUCTION-HARDENING.md`](./docs/PRODUCTION-HARDENING.md).
Vulnerability reporting policy: [`SECURITY.md`](./SECURITY.md).

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

## 👥 Multi-user / team adoption

Pyanchor is **single-tenant by default** — one bearer token, one
queue, one workspace, one app. Anyone holding `PYANCHOR_TOKEN` can
do everything. This matches the "personal / small-team self-hosted"
use case and keeps the threat model tight.

For team usage we ship two **opt-in** building blocks instead of a
full multi-user system:

- **`X-Pyanchor-Actor` header passthrough** (since v0.19.0) — your
  host app's auth middleware injects an actor identifier; pyanchor
  records it in the audit log + the PR body. Pyanchor doesn't
  verify identity (your host owns auth); it records what it's told.
- **`PYANCHOR_OUTPUT_MODE=pr`** (since v0.19.0) — agent edits land
  as a reviewable GitHub PR via `git push` + `gh pr create` instead
  of being rsynced to the live app. Reuses your existing git review
  process for who-approves-what.

Combined: **agent edit → PR opened with actor in body → existing
git/GitHub review → merge → deploy via your normal pipeline**.

Full multi-tenancy (one sidecar serving multiple workspaces, per-
tenant tokens, etc.) is on the roadmap as v0.22+. See
[`docs/roadmap.md`](./docs/roadmap.md).

## 📚 Documentation

| | |
| --- | --- |
| [`docs/integrate-with-nextjs.md`](./docs/integrate-with-nextjs.md) | Wire pyanchor into your existing Next.js app |
| [`docs/openclaw-setup.md`](./docs/openclaw-setup.md) | Install OpenClaw and point pyanchor at it |
| [`docs/claude-code-setup.md`](./docs/claude-code-setup.md) | Install the Anthropic Agent SDK and route pyanchor through Claude |
| [`docs/adapters.md`](./docs/adapters.md) | Build your own agent adapter |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Threat model + 3 deployment recipes (loopback / production gate cookie / existing auth) |
| [`docs/PRODUCTION-HARDENING.md`](./docs/PRODUCTION-HARDENING.md) | Operator playbook: separate Unix user, systemd sandbox, bubblewrap, sudoers, restart-script lockdown, audit log shipping |
| [`docs/API-STABILITY.md`](./docs/API-STABILITY.md) | Public surface contract — what's `Stable @ 1.0` vs `Pre-1.0` vs `Internal` |
| [`docs/roadmap.md`](./docs/roadmap.md) | What's coming + open questions |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Local dev, build, release flow |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release notes |
| [`examples/`](./examples/) | Index of all 8 runnable examples (start here) |
| [`examples/nextjs-minimal/`](./examples/nextjs-minimal) | 5-file Next.js app wired to pyanchor (env-flag gate) |
| [`examples/vite-react-minimal/`](./examples/vite-react-minimal) | 6-file Vite + React equivalent (`PYANCHOR_FRAMEWORK=vite`) |
| [`examples/astro-minimal/`](./examples/astro-minimal) | Non-built-in framework via `PYANCHOR_INSTALL_COMMAND` / `PYANCHOR_BUILD_COMMAND` overrides |
| [`examples/nextjs-portfolio-gate/`](./examples/nextjs-portfolio-gate) | Production gate cookie pattern for live-editing deployed sites |
| [`examples/vite-react-portfolio-gate/`](./examples/vite-react-portfolio-gate) | Vite + standalone Node gate server (5174 → 5173) |
| [`examples/nextjs-nextauth-gate/`](./examples/nextjs-nextauth-gate) | Recipe C — NextAuth + email allowlist as the gate |
| [`examples/nextjs-multi-agent/`](./examples/nextjs-multi-agent) | Same host, 5 interchangeable agents (one env var swap) |
| [`examples/nextjs-pr-mode/`](./examples/nextjs-pr-mode) | `PYANCHOR_OUTPUT_MODE=pr` — edits land as reviewable GitHub PRs |
| [`examples/systemd/`](./examples/systemd) | Production-hardened systemd unit + EnvironmentFile template |

## 🔭 Status

`v0.x` is pre-1.0. Public surfaces are documented in
[`docs/API-STABILITY.md`](./docs/API-STABILITY.md) — items marked
`Stable @ 1.0` will become the contract at the 1.0 cut. Items
marked `Pre-1.0` are still under iteration.

**Shipped highlights** (cumulative through v0.21.1):

- **Adapters**: `openclaw` (default), `claude-code`, `codex`, `aider`,
  pluggable third-party via the `AgentRunner` interface
- **Frameworks**: `nextjs` (default), `vite`, with two-env override
  (`PYANCHOR_INSTALL_COMMAND` / `PYANCHOR_BUILD_COMMAND`) for any other
- **i18n**: 21 built-in locales (LTR + RTL: ko / ja / zh-cn / es / de
  / fr / pt-br / vi / id / ru / hi / th / tr / nl / pl / sv / it / ar /
  he / fa / ur), code-split so the default English path is fetch-free
- **Production gating**: `PYANCHOR_REQUIRE_GATE_COOKIE` + bootstrap
  fail-safe — anonymous traffic can't even fetch the bootstrap script
- **Audit log**: append-only JSONL with documented schema
  ([`AuditEvent`](./src/audit.ts))
- **Output modes**: `apply` (default rsync+restart), `pr` (git +
  `gh pr create`), `dryrun`
- **Identity passthrough**: `X-Pyanchor-Actor` header for team auth
  flows; recorded in audit + PR body, not verified (host owns auth)
- **Webhooks**: fire-and-forget Slack / Discord / raw JSON
  notifications on `edit_requested` / `edit_applied` / `pr_opened`
- **Agent error classifier**: detects transient OAuth race / rate
  limit / timeout / network errors and appends actionable hints
- **Tests**: 677 unit + 69 e2e + Node 18/20/22 matrix on every commit

**Coming next** (no firm version commitment yet):

- Multi-tenancy — one sidecar serving multiple workspaces (open
  design questions; see [`docs/roadmap.md`](./docs/roadmap.md))
- Visual regression + axe-core a11y in CI
- More framework profiles (PRs welcome — `src/frameworks/` is ~50
  LOC each)

**1.0**: targeted once the README quickstart, API stability doc,
and production-hardening docs all stabilize and at least one
non-author production deployment runs cleanly for a calendar
month. We're at the docs/adoption stage, not the code stage.

## License

[MIT](./LICENSE) © 2026 PYAN
