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

> Pyanchor is a small Express sidecar you bolt on to a running web app
> (Next.js, Vite, Astro, or anything with an install + build command).
> A one-line `<script>` tag injects an in-page overlay (Shadow DOM, no
> styling collisions). You point at any UI element, describe a change in
> plain language, and your AI coding agent of choice does the edit, builds
> the project, and either restarts the frontend or opens a PR — all without
> anyone leaving the browser.

Designed for **self-hosted, prod-attached** workflows. Not a SaaS, not
an IDE plugin.

## Who is this for?

Three overlapping use cases. Pyanchor is one tool for all three because
the wedge is **the page itself becomes the editor** — no IDE required.

- **Solo devs dogfooding their own deploy.** Fastest "see → click →
  ship" loop. `apply` mode rsyncs straight to the live app.
- **Frontend devs tired of being a "can you change this copy" service
  desk.** Hand the requester a token, point at the page, let them
  self-serve. Set `PYANCHOR_OUTPUT_MODE=pr` and every edit lands as a
  PR you review on your normal cadence — no surprise prod writes.
- **Designers, PMs, backend devs** who want to make a small UI tweak
  themselves without poking the frontend team. Open the page, click
  the floating button, type *"make this button purple and add a
  loading spinner"*, get a PR within a minute.

That last one is the actual reason pyanchor exists. The author got
tired of *"hey can you change the copy on the about page"* Slack
pings. Now the requester does it; the frontend reviews the PR.

## Why not just use Cursor / v0 / Lovable?

|                         | Where it lives             | What it edits                 | Who can edit                                        |
| ----------------------- | -------------------------- | ----------------------------- | --------------------------------------------------- |
| Cursor / Windsurf       | Your editor                | Files in a workspace          | The dev who has the IDE open                        |
| v0 / Lovable / bolt.new | The vendor's cloud         | Brand-new apps                | Whoever owns the vendor account                     |
| **Pyanchor**            | The page you're looking at | The app you already shipped   | **Anyone with a token + (optional) PR review gate** |

If you want to point at the live login page on your staging server and
say *"make this dark mode"*, and you don't want your code to ever leave
your infra **or** be limited to people who own a Cursor seat, this is
for you.

## How it works

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  Your web app           │     │  Pyanchor sidecar        │
│  (Next.js / Vite /      │     │  (port 3010, localhost)  │
│   Astro / your stack)   │     │                          │
│                         │     │  Express server          │
│  layout/index injects:  │     │   /_pyanchor/bootstrap.js│
│   <script               │ ──> │   /_pyanchor/overlay.js  │
│     src="/_pyanchor/    │     │   /_pyanchor/api/edit    │
│     bootstrap.js"       │     │   /api/admin/*           │
│     defer />            │     │   /healthz + /readyz     │
│                         │     │                          │
│  Reverse-proxy /_pyanchor/* to the sidecar in nginx.     │
└─────────────────────────┘     └──────────────┬───────────┘
                                               │ spawns worker
                                               ▼
                            ┌──────────────────────────────┐
                            │  Agent (any of 5 built-in:   │
                            │   openclaw / claude-code /   │
                            │   codex / aider / gemini)    │
                            │                              │
                            │  1. mutate code in workspace │
                            │  2. install + build          │
                            │  3. EITHER:                  │
                            │     apply → rsync + restart  │
                            │     pr → git push + open PR  │
                            │     dryrun → stop here       │
                            └──────────────────────────────┘
```

**Output mode is the difference between a solo dev tool and a
collaboration tool.** `apply` is for you-on-your-own-deploy. `pr` is
for "let other team members propose changes via the overlay; I review
on GitHub". Switch with one env var (`PYANCHOR_OUTPUT_MODE`).

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
export PYANCHOR_APP_DIR=/abs/path/to/your/app          # Next.js, Vite, Astro, anything
export PYANCHOR_WORKSPACE_DIR=/abs/path/to/scratch-workspace
export PYANCHOR_RESTART_SCRIPT=/abs/path/to/restart-frontend.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:3000/
export PYANCHOR_AGENT=openclaw   # or claude-code | codex | aider | gemini
export PYANCHOR_FRAMEWORK=nextjs # or vite. Anything else: see step 5c.

pyanchor
```

The sidecar refuses to start if anything required is missing and
tells you exactly which env var is wrong. Full env reference:
[`.env.example`](./.env.example).

### 5. Wire the bootstrap into your app

The bootstrap is one `<script>` tag. Place it in whatever the
"render every page" template is for your framework.

<details open>
<summary><strong>5a. Next.js (App Router)</strong></summary>

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

For Next.js dev, also add a `/_pyanchor/*` rewrite in `next.config.mjs`:

```js
async rewrites() {
  return [{ source: "/_pyanchor/:path*", destination: "http://127.0.0.1:3010/_pyanchor/:path*" }];
}
```

</details>

<details>
<summary><strong>5b. Vite + React</strong></summary>

```html
<!-- index.html -->
<script src="/_pyanchor/bootstrap.js" defer data-pyanchor-token="<your-token>"></script>
```

```ts
// vite.config.ts — add a dev proxy
export default defineConfig({
  server: {
    proxy: { "/_pyanchor": { target: "http://127.0.0.1:3010", changeOrigin: false } }
  }
});
```

Full example: [`examples/vite-react-minimal/`](./examples/vite-react-minimal/).

</details>

<details>
<summary><strong>5c. Astro / SvelteKit / Remix / Nuxt / anything else</strong></summary>

Pyanchor only ships built-in framework profiles for `nextjs` and
`vite`. For everything else, set the install + build commands
explicitly — the rest of the integration is identical:

```bash
export PYANCHOR_INSTALL_COMMAND="pnpm install --frozen-lockfile"
export PYANCHOR_BUILD_COMMAND="astro build"   # or whatever
```

Then add the `<script>` tag to your global layout and a
`/_pyanchor/*` proxy to your dev server (Astro and SvelteKit both
use Vite's proxy under the hood; Remix has its own server config).
Full Astro walk-through: [`examples/astro-minimal/`](./examples/astro-minimal/).

</details>

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

## 👥 Multi-user / team collaboration

Pyanchor is **single-token by default** — anyone holding
`PYANCHOR_TOKEN` can do everything. That sounds scary for team use,
but combined with the building blocks below you get a workable
"non-frontend stakeholders self-serve, frontend reviews" flow today,
without any per-user account system to maintain.

| Building block | Since | What it gives you |
| --- | --- | --- |
| **`PYANCHOR_OUTPUT_MODE=pr`** | v0.19.0 | Every edit becomes a reviewable GitHub PR via `git push` + `gh pr create`. Reuses your existing PR review process — no surprise prod writes. |
| **`X-Pyanchor-Actor` header passthrough** | v0.19.0 | Host app injects identifier; pyanchor records it in audit + PR body so you know which teammate proposed each edit. |
| **HMAC-signed actor headers** (opt-in) | v0.27.0 | Set `PYANCHOR_ACTOR_SIGNING_SECRET` and the actor field becomes tamper-proof — a leaked pyanchor token can't fabricate audit lines for arbitrary teammates. |
| **Append-only audit log** | v0.18.0 | JSONL of every edit outcome (actor, prompt hash, diff hash, mode, duration, PR URL). Ship to Datadog / Splunk / Loki via tail. |
| **Gate cookie + existing-auth integration** | v0.17.0 | Tie pyanchor's overlay availability to your existing OAuth / NextAuth / SSO + email allowlist. Anonymous traffic can't even fetch the bootstrap. See [`examples/nextjs-nextauth-gate/`](./examples/nextjs-nextauth-gate/). |
| **Slack / Discord webhooks** | v0.20.0 | Real-time pings on `edit_requested` / `edit_applied` / `pr_opened`. The reviewer sees the request in the same channel where the requester would have asked. |

The recommended team setup:

```
designer / PM / backend dev          reviewer (frontend)
        │                                    │
        ▼ click overlay on staging           ▼ Slack webhook fires
        │ describe change in plain text      │ ↓
        │                                    │ open PR on GitHub
        ▼                                    ▼ review + merge
PR opens, signed actor in body          deploy via normal pipeline
```

You get who-can-edit (gate cookie + allowlist), who-did-edit (signed
actor + audit), and who-approves-edit (PR review) without writing a
single line of pyanchor-specific user management.

Full multi-tenancy (one sidecar serving multiple workspaces, per-
tenant tokens, etc.) is **designed but not implemented**. See
[`docs/MULTI-TENANCY-DESIGN.md`](./docs/MULTI-TENANCY-DESIGN.md) +
[`docs/roadmap.md`](./docs/roadmap.md). For 5–30 teammates on one
app the building blocks above are usually enough; per-tenant
isolation kicks in when you have multiple apps.

## 📚 Documentation

| | |
| --- | --- |
| [`examples/`](./examples/) | **Start here** — index of all 8 runnable examples (Next.js / Vite / Astro / NextAuth gate / multi-agent / PR mode) |
| [`docs/integrate-with-nextjs.md`](./docs/integrate-with-nextjs.md) | Detailed Next.js integration walk-through (most common stack) |
| [`docs/openclaw-setup.md`](./docs/openclaw-setup.md) | Install OpenClaw and point pyanchor at it |
| [`docs/claude-code-setup.md`](./docs/claude-code-setup.md) | Install the Anthropic Agent SDK and route pyanchor through Claude |
| [`docs/gemini-setup.md`](./docs/gemini-setup.md) | Install the Google Gemini CLI + 3 auth options |
| [`docs/adapters.md`](./docs/adapters.md) | Build your own agent adapter (~70 LOC interface, ~150 LOC adapter) |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Threat model + 3 deployment recipes (loopback / production gate cookie / existing auth) |
| [`docs/PRODUCTION-HARDENING.md`](./docs/PRODUCTION-HARDENING.md) | Operator playbook: separate Unix user, systemd sandbox, bubblewrap, sudoers, restart-script lockdown, audit log shipping |
| [`docs/MULTI-TENANCY-DESIGN.md`](./docs/MULTI-TENANCY-DESIGN.md) | One-sidecar-many-workspaces design (not yet implemented) |
| [`docs/API-STABILITY.md`](./docs/API-STABILITY.md) | Public surface contract — what's `Stable @ 1.0` vs `Pre-1.0` vs `Internal` |
| [`docs/roadmap.md`](./docs/roadmap.md) | What's coming + open questions |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Local dev, build, release flow |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release notes |
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

**Shipped highlights** (cumulative through v0.27.0):

- **Adapters**: `openclaw` (default), `claude-code`, `codex`, `aider`,
  `gemini`, pluggable third-party via the `AgentRunner` interface
- **Frameworks**: `nextjs` (default), `vite`, with two-env override
  (`PYANCHOR_INSTALL_COMMAND` / `PYANCHOR_BUILD_COMMAND`) for Astro /
  SvelteKit / Remix / Nuxt / anything else
- **i18n**: 21 built-in locales (LTR + RTL: ko / ja / zh-cn / es / de
  / fr / pt-br / vi / id / ru / hi / th / tr / nl / pl / sv / it / ar /
  he / fa / ur), code-split so the default English path is fetch-free
- **Output modes**: `apply` (default rsync+restart), `pr` (git +
  `gh pr create`), `dryrun`
- **Production gating**: `PYANCHOR_REQUIRE_GATE_COOKIE` + bootstrap
  fail-safe — anonymous traffic can't even fetch the bootstrap script
- **Audit log**: append-only JSONL with documented schema
  ([`AuditEvent`](./src/audit.ts))
- **Identity passthrough**: `X-Pyanchor-Actor` header — v0.27.0+
  optional HMAC verification (`PYANCHOR_ACTOR_SIGNING_SECRET`) makes
  the audit-trail actor field tamper-proof
- **Liveness + readiness probes**: `/healthz` (always 200 if alive)
  and `/readyz` (200 only when workspace + agent CLI all resolve);
  k8s/orchestrator-friendly out of the box
- **Webhooks**: fire-and-forget Slack / Discord / raw JSON
  notifications on `edit_requested` / `edit_applied` / `pr_opened`
- **Agent error classifier**: detects transient OAuth race / rate
  limit / timeout / network errors and appends actionable hints
- **Operations templates**: production-hardened systemd unit +
  EnvironmentFile in [`examples/systemd/`](./examples/systemd/)
- **Tests**: 743 unit + 69 e2e + Node 18/20/22 matrix on every commit;
  `examples-smoke` CI lane verifies every example's dependency graph
  and that the index doesn't drift

**Coming next** (no firm version commitment yet):

- `npx pyanchor init` — interactive scaffolder that detects your
  framework + agent and writes the env / restart script / layout
  patch in one step (replaces the current 5-step quickstart with
  one command + a few prompts)
- Multi-tenancy implementation — design at
  [`docs/MULTI-TENANCY-DESIGN.md`](./docs/MULTI-TENANCY-DESIGN.md);
  shipping when there's demand from a multi-app adopter
- Visual regression + axe-core a11y in CI
- More framework profiles (PRs welcome — `src/frameworks/` is ~50
  LOC each)

**1.0**: targeted ~2026-05-20 once the first non-author production
adopter window (in progress, started 2026-04-20) closes cleanly.
Docs/code blockers all closed; only the adoption signal remains.

## License

[MIT](./LICENSE) © 2026 PYAN
