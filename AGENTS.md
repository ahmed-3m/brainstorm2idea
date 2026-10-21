# AGENTS.md — Development guide for brainstorm2idea

Welcome to `brainstorm2idea` (`b2i`).

## Architecture & Tenets

- **Zero dependencies:** Never add external npm dependencies. Pure Node.js (>= 18.17) built-ins only (`node:fs`, `node:path`, `node:child_process`, `node:test`).
- **Single engine:** The CLI logic lives in `skills/brainstorm2idea/scripts/brainstorm2idea.mjs` and is exported via `bin/b2i.mjs`.
- **Contract-coupled with idea2prototype:** Communicates with `idea2prototype` via `i2p new` CLI and the versioned brief schema (`b2i-brief@1`).
- **Token discipline:** Output compact verdicts, limit errors to <= 3 notes, use diff-sized edits.

## Commands

- Run tests: `npm test` (executes all 4 suites: `engine`, `consistency`, `stress`, `benchmarks`)
- Run check on a brief: `node bin/b2i.mjs check [path|-] [--fix]` (`--fix` repairs mechanical issues: frontmatter quoting, missing schema, whitespace)
- Run doability scorer: `node bin/b2i.mjs score [path|-] [--json]` (`--json` includes per-category sub-scores)
- Run idea spark discovery: `node bin/b2i.mjs spark [category] [--seed <id>] [--output <path>]`
- Scaffold a starter brief (TODO sections): `node bin/b2i.mjs init <name> [--template web|api|cli|worker|library|none] [--output <path>]`
- De-noise a raw transcript into a draft brief: `node bin/b2i.mjs dump [file|-] [--output <path>]`
- Run export to prompt/issues/prd/json: `node bin/b2i.mjs export [path|-] [--format prompt|issues|prd|json] [--output <path>]`
- Run list: `node bin/b2i.mjs list`
- Run handoff: `node bin/b2i.mjs handoff <dir> [--target i2p|raw] [--brief <path>] [--i2p <path>] [--dry-run]`
