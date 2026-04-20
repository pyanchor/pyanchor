# nextjs-multi-agent

Demonstrates pyanchor's **agent-agnostic** core: the same Next.js host
code runs against any of the 5 built-in adapters. You change exactly
one env var on the sidecar (`PYANCHOR_AGENT`) and restart it — the host
app is untouched.

This is the simplest way to A/B compare agents on the same workspace,
or to migrate from one provider to another without rewriting your
integration.

## What this proves

Pyanchor's host integration is **3 things only**:

1. A `<script src="/_pyanchor/bootstrap.js">` tag in your HTML
2. A reverse proxy from `/_pyanchor/*` to the sidecar
3. A `PYANCHOR_TOKEN` shared between host and sidecar

None of those care which agent the sidecar talks to. Look at
[`app/layout.tsx`](./app/layout.tsx) — it has no agent-specific code.
The `data-active-agent` attribute is **purely cosmetic** so the
landing page can render a label.

## The 5 adapters

| `PYANCHOR_AGENT` | CLI binary       | Provider              | Auth setup                        |
| ---------------- | ---------------- | --------------------- | --------------------------------- |
| `openclaw`       | `openclaw`       | Anthropic Claude      | `openclaw onboard` (OAuth)        |
| `claude-code`    | `claude`         | Anthropic Claude      | `claude /login`                   |
| `codex`          | `codex`          | OpenAI                | `codex login`                     |
| `aider`          | `aider`          | Any (litellm)         | `OPENAI_API_KEY` / etc            |
| `gemini`         | `gemini`         | Google Gemini         | `GEMINI_API_KEY` or OAuth         |

Detailed setup per adapter:

- [openclaw](../../docs/openclaw-setup.md)
- [claude-code](../../docs/claude-code-setup.md)
- [gemini](../../docs/gemini-setup.md)
- codex/aider: install the upstream CLI and auth per its docs

## Layout

```
nextjs-multi-agent/
  app/
    layout.tsx        ← agent-agnostic bootstrap (only data-active-agent label is cosmetic)
    page.tsx          ← renders adapter badge from NEXT_PUBLIC_PYANCHOR_AGENT_LABEL
  scripts/
    restart.sh        ← stub PYANCHOR_RESTART_SCRIPT
  next.config.mjs     ← /_pyanchor proxy
  package.json
```

## Run it — pick an adapter

Boot the host once, then restart **only the sidecar** between
adapters. Don't forget to update `NEXT_PUBLIC_PYANCHOR_AGENT_LABEL` if
you want the host badge to match.

### Common host setup

```bash
pnpm install

# Same in every variant
export NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED=true
export NEXT_PUBLIC_PYANCHOR_TOKEN=$(openssl rand -hex 32)
export PYANCHOR_TOKEN=$NEXT_PUBLIC_PYANCHOR_TOKEN

pnpm dev   # http://localhost:3000
```

### Variant 1 — openclaw

```bash
# One-time
openclaw onboard

# Sidecar
export NEXT_PUBLIC_PYANCHOR_AGENT_LABEL=openclaw
export PYANCHOR_AGENT=openclaw
export PYANCHOR_AGENT_MODEL=openai-codex/gpt-5.4   # optional override
export PYANCHOR_APP_DIR=$(pwd)
export PYANCHOR_WORKSPACE_DIR=/tmp/pyanchor-multi-workspace
export PYANCHOR_RESTART_SCRIPT=$(pwd)/scripts/restart.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:3000/
export PYANCHOR_ALLOWED_ORIGINS=http://localhost:3000
pyanchor
```

### Variant 2 — claude-code

```bash
# One-time
claude /login

# Sidecar
export NEXT_PUBLIC_PYANCHOR_AGENT_LABEL=claude-code
export PYANCHOR_AGENT=claude-code
# ...rest identical to variant 1
pyanchor
```

### Variant 3 — codex

```bash
# One-time
codex login

# Sidecar
export NEXT_PUBLIC_PYANCHOR_AGENT_LABEL=codex
export PYANCHOR_AGENT=codex
export PYANCHOR_AGENT_MODEL=gpt-5.4   # optional
# ...rest identical
pyanchor
```

### Variant 4 — aider

```bash
# One-time (pick any litellm-supported provider)
export OPENAI_API_KEY=sk-...
# or ANTHROPIC_API_KEY, GROQ_API_KEY, etc

# Sidecar
export NEXT_PUBLIC_PYANCHOR_AGENT_LABEL=aider
export PYANCHOR_AGENT=aider
export PYANCHOR_AGENT_MODEL=gpt-4o   # usually set — aider needs a provider/model pick
# ...rest identical
pyanchor
```

### Variant 5 — gemini

```bash
# One-time
export GEMINI_API_KEY=...   # from https://aistudio.google.com/apikey
# or: sudo -u $(whoami) gemini auth login

# Sidecar
export NEXT_PUBLIC_PYANCHOR_AGENT_LABEL=gemini
export PYANCHOR_AGENT=gemini
export PYANCHOR_AGENT_MODEL=gemini-2.5-pro   # optional
# ...rest identical
pyanchor
```

## Switching adapters mid-session

```bash
# Kill the sidecar (Ctrl-C in its terminal)
# Update env:
export NEXT_PUBLIC_PYANCHOR_AGENT_LABEL=gemini
export PYANCHOR_AGENT=gemini
# Restart:
pyanchor
```

The host doesn't need to restart — Next.js dev server keeps running.
You'll need to hard-reload the browser to pick up the new
`NEXT_PUBLIC_PYANCHOR_AGENT_LABEL` (since `NEXT_PUBLIC_*` vars are
inlined at build/dev-server boot).

## What stays identical across adapters

- `/_pyanchor/bootstrap.js` payload (same JS, fetched same way)
- Overlay UI, locale handling, edit request format
- `PYANCHOR_TOKEN` auth, gate cookie support, audit log format
- Webhook events (`edit_requested` / `edit_applied` / `pr_opened`)
- Output modes (`apply` / `pr` / `dryrun`) — orthogonal to agent

## What changes per adapter

- The CLI binary the worker shells out to
- Auth surface (env var vs OAuth on disk)
- Available models (and their default)
- Streaming format the agent emits (handled inside the adapter)
- Error message style (the classifier normalizes the common ones —
  see [`docs/PRODUCTION-HARDENING.md`](../../docs/PRODUCTION-HARDENING.md))

## See also

- [`docs/API-STABILITY.md`](../../docs/API-STABILITY.md) — agent
  adapter contract is the only public surface that matters here
- Other examples in [`../`](../) for gating, PR mode, frameworks
  other than Next.js
