# Gemini setup

Wire pyanchor to Google's Gemini CLI as the agent backend
(`PYANCHOR_AGENT=gemini`, shipped in v0.25.0).

## When to pick Gemini

- You want a 1M-token context window for large codebases
- You already have Google Cloud / Vertex AI credentials
- You want Apache 2.0 licensed CLI tooling
- You want to compare a Google-backed agent against
  openclaw/codex/aider on the same workspace

## Prerequisites

```bash
# 1. Install the Gemini CLI
npm i -g @google/gemini-cli

# Verify
gemini --version
```

## Authentication — pick one

### Option A: API key (simplest, scriptable)

```bash
# Get a key from https://aistudio.google.com/apikey
export GEMINI_API_KEY="..."
```

The `pyanchor` worker inherits this from its parent process env.
If you're running pyanchor under systemd/pm2, put it in your
EnvironmentFile / ecosystem env block.

### Option B: OAuth (interactive, persists)

```bash
# One-time browser flow as the pyanchor user
sudo -u pyanchor gemini auth login
```

OAuth credentials persist in `~/.config/gemini/`. The pyanchor
user's home must be writable for this to work.

### Option C: Vertex AI (Google Cloud Project)

```bash
export GOOGLE_API_KEY="..."
export GOOGLE_GENAI_USE_VERTEXAI=true
```

For deployments where you want billing + audit through your
GCP project rather than an aistudio key.

## Wire pyanchor

```bash
export PYANCHOR_AGENT=gemini

# Optional: override the binary path (default: `gemini` on PATH)
export PYANCHOR_GEMINI_BIN=/path/to/gemini

# Optional: pin a specific model (default: whatever the CLI ships)
export PYANCHOR_AGENT_MODEL=gemini-2.5-pro
```

Restart the sidecar. That's it.

## What pyanchor sends to Gemini

For every edit job, the worker invokes:

```
gemini -p "<brief>" --output-format stream-json --yolo [-m <model>]
```

with `cwd` set to the workspace dir. The `<brief>` is the same
backend-agnostic shape every adapter receives — target route,
mode, recent conversation, the user prompt, and a framework-
specific build hint. See `src/agents/gemini.ts` for the full
schema.

The CLI's NDJSON event stream is parsed line-by-line: assistant
text becomes the job summary, `thought` events stream into the
overlay's "thinking" indicator.

### Why `--yolo`?

Gemini CLI's "yes-to-everything" mode (analogous to Codex's
`--full-auto`). Without it, the CLI asks for tool permission
interactively, which would hang in a headless worker.

The brief itself constrains the agent — edit mode only modifies
files in the workspace dir; chat mode explicitly forbids file
modification. The `--yolo` trade-off is safe inside that contract,
matching the same reasoning as the codex `--full-auto` flag.

## Sandboxing

Like every other agent backend, pyanchor strongly recommends
running the worker as a separate Unix user with restricted sudo
grants and (optionally) a systemd / bubblewrap sandbox. Same
playbook regardless of agent — see
[`docs/PRODUCTION-HARDENING.md`](./PRODUCTION-HARDENING.md).

The Gemini CLI's own auth credentials live in the pyanchor user's
home and never enter the host app's process; same isolation story
as openclaw / codex / aider.

## Troubleshooting

- **"gemini: command not found"** — install the CLI globally
  (`npm i -g @google/gemini-cli`) and verify `which gemini`. Or
  set `PYANCHOR_GEMINI_BIN=/abs/path/to/gemini` if it's not on
  the worker's PATH.
- **"Auth failed"** — the v0.21.0 classifier appends a hint:
  *"often a transient OAuth token-refresh race; try once more
  before re-authenticating (`openclaw onboard` / `codex login`)."*
  For Gemini specifically, run `gemini auth status` as the
  pyanchor user; if expired, `gemini auth login` again or set
  `GEMINI_API_KEY` in the env.
- **Hangs forever** — likely the `--yolo` flag isn't recognized
  by your CLI version. Update: `npm i -g @google/gemini-cli@latest`.
- **"Workspace exceeds context"** — Gemini supports 1M tokens but
  the CLI may load extra context by default. Pass
  `PYANCHOR_AGENT_MODEL=gemini-2.5-pro` (or larger) and trim the
  workspace if needed.

## Comparison with other backends

| Adapter | Pattern | Auth | Workspace context |
|---|---|---|---|
| `openclaw` | CLI shell-out | OAuth (per-agent profiles) | sized by openclaw config |
| `claude-code` | JS SDK in-process | `ANTHROPIC_API_KEY` env | full workspace, configurable |
| `codex` | CLI shell-out (`exec --json`) | `codex login` (OAuth) | full workspace |
| `aider` | CLI shell-out | `OPENAI_API_KEY` etc. | full workspace, git-aware |
| **`gemini`** | **CLI shell-out (`-p --output-format stream-json --yolo`)** | **`GEMINI_API_KEY` / OAuth / Vertex AI** | **full workspace, 1M tokens** |

Pick the one whose model + auth story fits your team. All five
share the same `AgentRunner` interface and the same
`docs/PRODUCTION-HARDENING.md` operator playbook.
