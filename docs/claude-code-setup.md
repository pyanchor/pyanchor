# Claude Code adapter setup

Use this if you want pyanchor to drive
[`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
instead of OpenClaw. The two backends are interchangeable — pick by
setting `PYANCHOR_AGENT`.

## 1. Install the SDK

The Claude Agent SDK is declared as an **optional peer dependency** of
pyanchor, so it does not auto-install. Add it to the project that runs
the sidecar:

```bash
pnpm add @anthropic-ai/claude-agent-sdk
# or: npm i @anthropic-ai/claude-agent-sdk / yarn add @anthropic-ai/claude-agent-sdk
```

If you forget this step and start the sidecar with
`PYANCHOR_AGENT=claude-code`, pyanchor will throw a clear error
pointing at the install command.

## 2. Set credentials

The SDK uses your Anthropic API key. Export it in the same shell that
starts pyanchor:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

(Bedrock / Vertex routing is supported by the SDK — see its README. The
adapter just passes the workspace + prompt through.)

## 3. Point pyanchor at it

```bash
export PYANCHOR_AGENT=claude-code
# Optional: pin a specific Claude model
export PYANCHOR_AGENT_MODEL=claude-sonnet-4-6
```

`PYANCHOR_AGENT_MODEL` is forwarded straight to the SDK as the `model`
option; leave it unset to take the SDK's default.

## 4. Test the wiring

With pyanchor's required env set (see
[`integrate-with-nextjs.md`](./integrate-with-nextjs.md)), start it
and hit the edit endpoint manually:

```bash
curl -X POST http://127.0.0.1:3010/_pyanchor/api/edit \
  -H "Authorization: Bearer $PYANCHOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"add a comment to app/page.tsx saying hi","targetPath":"/","mode":"edit"}'
```

Poll `/api/status` to watch the run progress. The adapter uses
`permissionMode: "acceptEdits"` in edit mode so the SDK auto-approves
file writes scoped to your workspace.

## What the adapter actually does

Source: [`src/agents/claude-code.ts`](../src/agents/claude-code.ts).

For each user request the adapter:

1. Builds a structured prompt: `Target route`, `Mode`, last 6
   conversation turns, then the user's text, then a short instruction
   block keyed on edit-vs-chat mode.
2. Calls `query({ prompt, options: { cwd: workspaceDir, permissionMode,
   model, abortController } })` from the SDK.
3. Iterates the async stream of messages, accumulating assistant
   `text` blocks into the summary and `thinking` blocks into the
   reasoning trace. `result` messages override the accumulated
   summary if present.
4. Wires `ctx.signal` to the SDK's `abortController` so that pressing
   Cancel in the overlay aborts the in-flight Claude turn promptly.
5. Yields a single `{ type: "result", summary, thinking }` event when
   the stream resolves.

Workspace lifecycle (rsync from app dir, install, build, sync back,
restart) stays in pyanchor's worker — the adapter only owns the
agentic step.

## Common issues

**`PYANCHOR_AGENT=claude-code requires @anthropic-ai/claude-agent-sdk`.**
The dynamic import failed. Install the SDK in the same project that
runs pyanchor (not in your Next.js app).

**SDK errors with `401`.** `ANTHROPIC_API_KEY` is missing or invalid.
The adapter doesn't read the key directly; the SDK does. Check it's in
pyanchor's process env, not your shell only.

**The agent edits files outside the workspace.** Pyanchor passes
`cwd: workspaceDir` and uses `permissionMode: "acceptEdits"`, which
restricts the SDK's tool reach to that directory. If you see edits
elsewhere, file an issue with reproduction steps — that's a bug.
