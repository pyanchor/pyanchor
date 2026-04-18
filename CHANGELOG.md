# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial import of the sidecar source from the AIG project (3,267 LOC across 8 TypeScript files).
- MIT license, project metadata, and `.gitignore`.

### Planned for `v0.1.0`
- Decouple AIG-specific defaults; introduce `PYANCHOR_*` env vars and `.env.example`.
- Bearer-token auth on runtime endpoints, basic rate limiting, threat-model doc.
- `AgentRunner` interface; ship OpenClaw + Claude Code adapters.
- OS-grade README, integration guide, minimal Next.js example.
- npm publish, CI, GitHub release.
