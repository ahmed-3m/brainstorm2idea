# AGENTS.md — Development guide for brainstorm2idea

Welcome to `brainstorm2idea` (`b2i`).

## Architecture & Tenets

- **Zero dependencies:** Never add external npm dependencies. Pure Node.js (>= 18.17) built-ins only (`node:fs`, `node:path`, `node:child_process`, `node:test`).
- **Single engine:** The CLI logic lives in `skills/brainstorm2idea/scripts/brainstorm2idea.mjs` and is exported via `bin/b2i.mjs`.
- **Contract-coupled with idea2prototype:** Communicates with `idea2prototype` via `i2p new` CLI and the versioned brief schema (`b2i-brief@1`).
- **Token discipline:** Output compact verdicts, limit errors to <= 3 notes, use diff-sized edits.

## Commands

- Run tests: `npm test` or `node --test tests/engine.test.mjs tests/consistency.test.mjs tests/stress.test.mjs`
- Run check on a brief: `node bin/b2i.mjs check [path|-]`
- Run doability scorer: `node bin/b2i.mjs score [path|-]`
- Run idea spark discovery: `node bin/b2i.mjs spark [category] [--seed <id>] [--output <path>]`
- Run list: `node bin/b2i.mjs list`
- Run handoff: `node bin/b2i.mjs handoff <dir> [--target i2p|raw] [--brief <path>] [--i2p <path>] [--dry-run]`
