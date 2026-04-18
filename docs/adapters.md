# Agent adapters

Pyanchor is **agent-agnostic**. The sidecar handles the workspace
lifecycle (rsync from app dir, install, build, sync back, restart);
the adapter handles the agentic step in between.

Built-in backends:

| `PYANCHOR_AGENT` | Status | Notes |
|---|---|---|
| `openclaw` | ✅ default | Inline implementation in `src/worker/runner.ts`. The OpenClaw CLI must be on `PATH` (or pointed at via `PYANCHOR_OPENCLAW_BIN`). |
| `claude-code` | ✅ shipped | Requires `@anthropic-ai/claude-agent-sdk` to be installed in the host project (declared as an optional peer dep). Source: [`src/agents/claude-code.ts`](../src/agents/claude-code.ts). |
| `codex` | ✅ shipped | Shells out to the OpenAI Codex CLI (`codex exec --json`). Install: `npm i -g @openai/codex`. Override binary with `PYANCHOR_CODEX_BIN`. Source: [`src/agents/codex.ts`](../src/agents/codex.ts). |
| `aider` | ✅ shipped | Shells out to aider-chat (`aider --no-stream --yes --message`). Install: `pip install aider-chat`. Workspace should be a git repo. Override binary with `PYANCHOR_AIDER_BIN`. Source: [`src/agents/aider.ts`](../src/agents/aider.ts). |

Future adapters (`goose`, `cline`, custom) implement the same interface
defined below. The OpenClaw path predates the interface and is slated to
be moved behind it in `v0.2.0` for symmetry.

## The `AgentRunner` interface

Defined in [`src/agents/types.ts`](../src/agents/types.ts).

```ts
interface AgentRunner {
  readonly name: string;

  prepare?(context: AgentRunContext): Promise<void>;

  run(input: AgentRunInput, context: AgentRunContext): AsyncIterable<AgentEvent>;
}
```

### Inputs

`AgentRunInput` carries the user request:

| Field | Description |
|---|---|
| `prompt` | Raw user prompt. |
| `targetPath` | Hint about which route/file the user is on. May be empty. |
| `mode` | `"edit"` (mutate files) or `"chat"` (read-only answer). |
| `recentMessages` | Last few conversation turns, oldest first. |
| `jobId` | Stable id; use as session/correlation id. |

`AgentRunContext` carries the environment:

| Field | Description |
|---|---|
| `workspaceDir` | Absolute path to the scratch dir to mutate. |
| `timeoutMs` | Configured timeout for this single run. |
| `model` | Free-form model hint from `PYANCHOR_AGENT_MODEL`. |
| `thinking` | Reasoning level hint from `PYANCHOR_AGENT_THINKING`. |
| `signal` | Aborted when the user clicks cancel. **Adapters MUST observe this.** |

### Outputs

Yield progress events as you go. They drive the in-page overlay.

```ts
type AgentEvent =
  | { type: "log"; text: string }
  | { type: "thinking"; text: string }
  | { type: "step"; label: string; description?: string }
  | { type: "result"; summary: string; thinking?: string | null };
```

- `log` — short status lines (rendered in the activity feed).
- `thinking` — reasoning trace (collapsed in UI by default).
- `step` — coarse-grained status update with a label like `"Building"`.
- `result` — emit once, at the end, with the user-facing summary.

An adapter that emits no events still works; the user sees a spinner
until the run resolves.

## Writing your own adapter

1. **Create `src/agents/<name>.ts`** exporting a class that implements
   `AgentRunner`.
2. **Register it** in [`src/agents/index.ts`](../src/agents/index.ts) by
   adding an entry to the `adapters` map.
3. **Pick it up via env**: users set `PYANCHOR_AGENT=<name>`.

Minimal skeleton:

```ts
import type { AgentRunner, AgentRunInput, AgentRunContext, AgentEvent } from "./types";

export class MyAgentRunner implements AgentRunner {
  readonly name = "my-agent";

  async *run(input: AgentRunInput, ctx: AgentRunContext): AsyncIterable<AgentEvent> {
    // 1. Send the prompt to your agent, scoped to ctx.workspaceDir.
    // 2. Stream events as they arrive.
    // 3. Honour ctx.signal — abort the underlying call when it fires.
    // 4. Yield a single `{ type: "result", summary, thinking }` at the end.

    yield { type: "step", label: "Thinking" };
    // ... do the work ...
    yield { type: "result", summary: "Done." };
  }
}
```

## Cancellation

When the user cancels:

1. The sidecar sends `SIGTERM` to the worker process.
2. The worker aborts its module-level `AbortController`.
3. The `signal` you receive in `AgentRunContext` fires.
4. Your adapter must stop and return promptly. The `for await` loop
   in the sidecar dispatcher checks `signal.aborted` between events,
   so even if you can't abort the underlying call cleanly, the user
   won't be stuck once the next event arrives.

The Claude Code adapter wires `ctx.signal` straight into the SDK's
`abortController` option — see
[`src/agents/claude-code.ts`](../src/agents/claude-code.ts) for the
canonical pattern.

## Optional peer dependencies

If your adapter needs an external SDK, declare it as an **optional peer
dependency** in `package.json`:

```jsonc
"peerDependencies": {
  "your-sdk": "^1.0.0"
},
"peerDependenciesMeta": {
  "your-sdk": { "optional": true }
}
```

Then import it dynamically in the adapter so users without the dep
installed can still run the other backends:

```ts
async function loadSdk() {
  try {
    return await import("your-sdk");
  } catch {
    throw new Error("PYANCHOR_AGENT=your-name requires `your-sdk`. Install it.");
  }
}
```

Mark the package as `external` in `build.mjs` so esbuild leaves the
runtime `require()` alone.
