# Pollinations setup

This guide gets you from "no agent installed" to "pyanchor calls
[Pollinations.AI](https://pollinations.ai) to edit your app". Skip this
if you're using one of the CLI-backed adapters (`openclaw`,
`claude-code`, `codex`, `aider`, `gemini`) — see
[`adapters.md`](./adapters.md).

## What pyanchor expects

The Pollinations adapter is **HTTP-only**. There is no binary to
install, no SDK to add to your project. The adapter calls the
OpenAI-compatible endpoint:

```
POST https://text.pollinations.ai/openai
```

with `tools: auto` and runs its own loop, executing the model's
function calls (`list_files`, `read_file`, `write_file`, `done`)
against `PYANCHOR_WORKSPACE_DIR`. Same workspace lifecycle as every
other adapter — pyanchor still rsyncs from your app dir, installs,
builds, syncs back, and restarts the frontend.

## 1. Decide on attribution

Three modes, in increasing order of useful:

### a) Anonymous (zero setup)

```bash
PYANCHOR_AGENT=pollinations
```

That's it. Calls go out without any auth header. Pollinations
rate-limits anonymous traffic per source IP (≈1 pollen/IP/hr at the
time of writing) and only the basic free models are available. Fine
for kicking the tyres; not enough for actual use.

### b) Referrer (web/dev attribution)

```bash
PYANCHOR_AGENT=pollinations
PYANCHOR_POLLINATIONS_REFERRER=https://your-app.example.com
```

The adapter passes both a `Referer` header and a `referrer` body field
on every call. If you've registered that domain on
[`auth.pollinations.ai`](https://auth.pollinations.ai) and the project
has been promoted to a paid tier (Seed / Flower / Nectar), traffic
from this referrer inherits that tier's rate limits and model access.

### c) Backend bearer token (recommended)

```bash
PYANCHOR_AGENT=pollinations
PYANCHOR_POLLINATIONS_TOKEN=sk_xxxxxxxxxxxxxxxxxxxxxxxx
PYANCHOR_POLLINATIONS_REFERRER=https://your-app.example.com   # optional
```

Get a token from <https://auth.pollinations.ai>. The adapter sends it
as `Authorization: Bearer ...`. **Never put this token in
frontend code** — pyanchor runs server-side, so the token only ever
sits in the sidecar's environment.

## 2. Pick a model (optional)

```bash
PYANCHOR_POLLINATIONS_MODEL=openai-fast    # default
```

The default `openai-fast` (GPT-OSS 20B reasoning) supports tool
calling and is available on every tier including anonymous, so it's a
safe baseline. Higher tiers unlock more capable models — see the
live list at <https://text.pollinations.ai/models>. Pyanchor's
`PYANCHOR_AGENT_MODEL` also overrides this if set, so you can swap
models without touching adapter-specific config.

## 3. Other knobs

```bash
PYANCHOR_POLLINATIONS_BASE_URL=https://text.pollinations.ai   # for self-hosting / mirrors
PYANCHOR_POLLINATIONS_MAX_TURNS=12                            # cap on tool-loop iterations
```

`MAX_TURNS` is a safety net — most edits finish in 3–6 turns
(`list_files` → `read_file` → `write_file` → `done`).

## 4. Smoke test

With pyanchor and a target app already wired up
([`integrate-with-nextjs.md`](./integrate-with-nextjs.md) if you
haven't done that yet), run a one-shot edit:

1. Open the app in a browser; the pyanchor overlay should be live.
2. Click any element and type something tiny:
   *"add a TODO comment above the export"*.
3. Watch the activity feed — you should see `read_file` and
   `write_file` steps stream in.
4. Hit save (or apply / pr depending on `PYANCHOR_OUTPUT_MODE`).

If the call fails, the most common causes are:

| Symptom | Fix |
|---|---|
| `HTTP 401` / `403` | Bad token, or referrer not registered for the project. |
| `HTTP 429` / 1 pollen/IP/hr | Anonymous rate limit. Set a token. |
| Long stalls then timeout | Lower-tier models can be slow; raise `PYANCHOR_AGENT_TIMEOUT_S`. |
| Loops without calling `done` | Lower `PYANCHOR_POLLINATIONS_MAX_TURNS` to fail fast, or pick a stronger model. |

## What this adapter doesn't do

- **No streaming.** Each turn is a single non-streaming chat call.
  Steps stream to the UI between turns; reasoning trace, when the
  model emits one, is forwarded as a `thinking` event.
- **No git integration.** Aider's adapter assumes a workspace git
  repo; this one doesn't. PR-mode still works because pyanchor's
  worker handles git separately.
- **No image / audio.** Pollinations also has image and audio
  endpoints, but pyanchor only edits code, so this adapter only
  speaks to the text endpoint.

## Why use it

- **Zero install.** The other agent backends each need a binary or
  SDK on the host machine. This one is just `fetch`.
- **Free tier is real.** Anonymous + a registered referrer is enough
  to dogfood pyanchor without setting up any account.
- **Open / agent-agnostic.** Matches pyanchor's "you bring the
  agent, we run the workspace" thesis. If your team already uses
  Pollinations for other AI features, you can re-use the same token.
