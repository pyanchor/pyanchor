# Contributing to pyanchor

Thanks for considering a contribution. Pyanchor is a small project; the
maintenance bar is "ship the next minor without breaking anyone's
prod". The notes below cover local dev, adapter PRs, and release flow.

## Quick local loop

```bash
git clone https://github.com/pyanchor/pyanchor.git
cd pyanchor
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm build       # esbuild → dist/{server.cjs, worker/runner.cjs, public/{bootstrap,overlay}.js}
```

To run the sidecar against a real Next.js app, see
[`docs/integrate-with-nextjs.md`](./docs/integrate-with-nextjs.md). For
fast iteration on the overlay UI, edit `src/runtime/overlay.ts`,
`pnpm build`, and reload the host page.

## Source map (where things live)

```
src/
  server.ts             ← Express app, route wiring, validateConfig() at startup
  state.ts              ← single-process state machine (read/write JSON)
  config.ts             ← env → typed config + validateConfig()
  auth.ts               ← bearer-token middleware (timing-safe compare)
  rate-limit.ts         ← in-memory token bucket
  admin.ts              ← server-side rendered admin HTML
  shared/types.ts       ← shared types (state, messages, modes)
  agents/
    types.ts            ← AgentRunner contract
    index.ts            ← selectAgent() registry
    claude-code.ts      ← reference adapter using @anthropic-ai/claude-agent-sdk
  runtime/              ← browser-side bundles (compiled to dist/public/)
    bootstrap.ts        ← injected via <script>; loads overlay.js
    overlay.ts          ← Shadow DOM UI; talks to /_pyanchor/api/*
  worker/
    runner.ts           ← long-running child process; orchestrates a single job
```

## Adding an agent adapter

The full contract is in [`docs/adapters.md`](./docs/adapters.md).
TL;DR:

1. Create `src/agents/<name>.ts` exporting a class implementing
   [`AgentRunner`](./src/agents/types.ts).
2. Register it in `src/agents/index.ts`.
3. If the adapter needs an external SDK, add it as an
   `optionalPeerDependency` and dynamic-import it.
4. Update `README.md` and `.env.example`.
5. Add a brief entry to `CHANGELOG.md` under `[Unreleased]`.

PRs that add an adapter are easier to land if they include a small
integration note in the PR body explaining the agent's permissions
model (does it sandbox file ops? does it auto-commit?).

## Style

- TypeScript strict. No `any` unless interfacing with an untyped lib.
- Prefer functions over classes except where you genuinely need state
  (the AgentRunner adapters are an exception).
- Comments explain *why*, not *what*. Names should carry the *what*.
- One-shot scripts / utilities go in `scripts/` (gitignored unless
  reusable).

## Commits

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`,
  `chore:`. The release workflow keys off these.
- Subject ≤72 chars; body wraps at ~80; explain *why*.
- One logical change per commit. Squash-merge is fine for noisy PRs.

## Tests

Real test scaffold is on the v0.2.0 list. Until then, smoke-test by:

- Running `pnpm typecheck && pnpm build`.
- Starting the sidecar with all required env and pointing the
  `examples/nextjs-minimal` example at it.
- Hitting `POST /_pyanchor/api/edit` and watching `GET /api/admin/state`.

If your change is non-trivial and lands before the test scaffold, please
add a manual test plan to the PR description (commands + expected
output).

## Releases

Maintainer-only:

```bash
# bump version + tag
pnpm version <patch|minor|major>     # creates "vX.Y.Z" tag
pnpm build
npm publish --access public          # publishes pyanchor@X.Y.Z
git push origin main --follow-tags
gh release create vX.Y.Z --notes "..."
```

CI publishes on tag pushes once the npm token is wired up.

## Code of conduct

Be kind. No further policy needed at this size — escalate to
shkm1420@gmail.com if anything happens that isn't.

## License

By contributing you agree your contribution is licensed under the
[MIT License](./LICENSE).
