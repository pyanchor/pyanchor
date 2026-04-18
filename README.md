# Pyanchor

> Agent-agnostic AI live-edit sidecar for Next.js. Anchor edits straight into your running app.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Status:** `v0.1.0` in active development. API, config, and folder layout will change before the first tagged release.

---

## What is this

Pyanchor is a small Express sidecar that attaches to a running Next.js app via a `<script src="/_pyanchor/bootstrap.js">` injection. It opens an in-page overlay (Shadow DOM, no styling collisions) where you can describe a UI change in plain language. The sidecar dispatches the request to your AI coding agent of choice, validates the build, and restarts the frontend — without you ever leaving the browser.

Designed for **self-hosted, prod-attached** workflows. Not a SaaS, not an IDE plugin.

## Why not just use Cursor / v0 / Lovable

- **Cursor** lives in your editor. Pyanchor lives in the *running app* you're looking at.
- **v0 / Lovable / bolt.new** generate apps from scratch. Pyanchor edits the one you already shipped.
- **Self-hosted, BYO-agent.** Your code never leaves your server.

## Supported agents

Plug in any agentic coding tool by implementing the `AgentRunner` interface.

| `PYANCHOR_AGENT` | Status | Notes |
|---|---|---|
| `openclaw` | ✅ default | OpenClaw CLI on `PATH` |
| `claude-code` | ✅ shipped | install peer dep `@anthropic-ai/claude-agent-sdk` |
| `codex` | 🟡 v0.2.0 | community adapter welcome |
| `aider` | 🟡 v0.2.0 | community adapter welcome |
| Goose, Cline, custom | 🟡 | see [`docs/adapters.md`](./docs/adapters.md) for the contract |

## Quick start

```bash
pnpm add pyanchor
# or: npm install pyanchor / yarn add pyanchor / bun add pyanchor
```

(Full Next.js integration guide will land in `docs/integrate-with-nextjs.md` before v0.1.0.)

## Documentation

| | |
|---|---|
| Integration | `docs/integrate-with-nextjs.md` *(TBD)* |
| OpenClaw setup | `docs/openclaw-setup.md` *(TBD)* |
| Building adapters | `docs/adapters.md` *(TBD)* |
| Security | [`SECURITY.md`](./SECURITY.md) *(TBD)* |
| Contributing | [`CONTRIBUTING.md`](./CONTRIBUTING.md) *(TBD)* |

## License

[MIT](./LICENSE) © 2026 PYAN
