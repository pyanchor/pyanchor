# OpenClaw setup

This guide gets you from "OpenClaw not installed" to "pyanchor calls
OpenClaw to edit your Next.js app". Skip this if you're using the
`claude-code` adapter (see [`adapters.md`](./adapters.md) instead).

## What pyanchor expects

The OpenClaw adapter shells out to the `openclaw` CLI to:

1. List existing agents (`openclaw agents list --json`).
2. Register a new agent if `PYANCHOR_AGENT_ID` (default `"pyanchor"`)
   isn't there yet.
3. Run a turn (`openclaw agent --agent <id> --session-id <jobId>
   --thinking <level> --timeout <seconds> --json -m <prompt>`).
4. Stream the JSON event log from stdout.

That's it — no MCP servers, no skills, no SOUL.md required for the
basic flow. The agent runs in your `PYANCHOR_WORKSPACE_DIR` and pyanchor
handles the workspace lifecycle around it.

## 1. Install OpenClaw

Follow the official guide at <https://docs.openclaw.ai>. Quick path on
macOS / Linux:

```bash
curl -fsSL https://openclaw.ai/install.sh | sh
openclaw onboard   # interactive, sets up gateway + workspace
```

Verify:

```bash
which openclaw
openclaw --version
```

## 2. Decide which user runs the agent

Two patterns:

### a) Same user as pyanchor (simple, recommended)

`PYANCHOR_OPENCLAW_USER` defaults to the user running pyanchor.
The adapter uses `sudo -u <user>` to invoke the CLI, but if it matches
the current user this is effectively a no-op (`sudo` still runs unless
you give that user passwordless self-sudo).

To skip sudo entirely, point `PYANCHOR_OPENCLAW_BIN` at a wrapper that
plain-execs `openclaw` (no sudo). Future v0.2.0 will detect "same user"
and skip sudo automatically.

### b) Dedicated agent user (production, multi-tenant)

Create a separate Unix user that owns the workspace and runs OpenClaw.
Pyanchor (running as your service user) calls it via `sudo -u`.

```bash
sudo useradd -m openclaw-agent
sudo -u openclaw-agent openclaw onboard
```

Allow your service user to sudo as `openclaw-agent` for OpenClaw
commands only:

```sudoers
# /etc/sudoers.d/pyanchor
my-service ALL=(openclaw-agent) NOPASSWD: /usr/local/bin/openclaw, /usr/bin/rsync, /usr/bin/tee
```

Set:

```bash
export PYANCHOR_OPENCLAW_USER=openclaw-agent
export PYANCHOR_OPENCLAW_BIN=/usr/local/bin/openclaw
```

## 3. Pick a model and reasoning level

```bash
export PYANCHOR_AGENT_MODEL=openai-codex/gpt-5.4   # or any model OpenClaw routes to
export PYANCHOR_AGENT_THINKING=medium               # low | medium | high | xhigh
```

The model string is passed straight to OpenClaw — see `openclaw
agents add --help` for what your install supports.

## 4. Test the wiring

With pyanchor's required env set (see
[`integrate-with-nextjs.md`](./integrate-with-nextjs.md)), start it and
hit the edit endpoint manually:

```bash
curl -X POST http://127.0.0.1:3010/_pyanchor/api/edit \
  -H "Authorization: Bearer $PYANCHOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"add a comment to app/page.tsx saying hi","targetPath":"/","mode":"edit"}'
```

Then poll status:

```bash
curl -H "Authorization: Bearer $PYANCHOR_TOKEN" \
  http://127.0.0.1:3010/_pyanchor/api/status | jq .
```

You should see `status: "running"` → `"running"` (during build) →
`"done"`. Check your app dir; the comment should be there.

## Common issues

**`openclaw: command not found`.** `PATH` doesn't include OpenClaw's
install prefix when pyanchor runs. Set `PYANCHOR_OPENCLAW_BIN` to the
absolute path.

**`sudo: a password is required`.** Your sudoers entry isn't matching.
Run `sudo -l -U <pyanchor-user>` to check what's allowed.

**`agents list` returns an empty array forever.** Make sure the user in
`PYANCHOR_OPENCLAW_USER` has actually run `openclaw onboard` themselves.
Each Unix user has their own OpenClaw config under `~/.openclaw`.

**Agent starts but never produces a result.** Increase
`PYANCHOR_AGENT_TIMEOUT_S` (default 900). Some refactors need 20-30
minutes of agent time on first run.
