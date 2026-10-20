# Changelog

## [Unreleased]

### Added
- `b2i init <name> [--template web|api|cli|worker|library|none] [--output <path>] [--json]` — scaffold a schema-valid starter brief with TODO sections for humans working outside an agent; refuses to overwrite an existing `brief.md`.
- `skills/brainstorm2idea/scripts/parser.mjs` — reusable parser module (`parseFrontmatter`, `parseSections`, `extractListItems`, `readBriefFile`, `quoteFrontmatterValue`) extracted from the engine for external consumers; the engine re-exports it for backward compatibility.
- `CLI_COMMANDS` export — single source of truth for the CLI router surface, asserted against `SKILL.md` and `AGENTS.md` by the consistency test suite.

### Changed
- README redesigned: SVG hero with real terminal proof, workflow diagram, badges, and restructured story.
- `b2i init --template library` now emits the `## Public API` section (matching `b2i spark` and the library template contract) instead of `## Core flows`, which previously triggered a spurious alignment penalty and notice in `b2i score`.
- `b2i init` and `b2i dump` are now documented in the `SKILL.md` and `AGENTS.md` command lists.

### Fixed
- `b2i init` and `b2i dump` no longer truncate the `distilled` value when the input contains a double quote — the frontmatter parser stops at the first interior quote, so values are now escaped before interpolation.
- `b2i dump` no longer discards an entire line that merely *starts* with conversational filler; the filler prefix is stripped and the remainder of the line is preserved.

## [v0.4.1] — 2026-10-20

### Added
- `b2i dump [file|-] [--output <path>] [--json]` — mechanical de-noiser for raw voice transcripts and brain dumps: strips conversational filler, extracts the first substantive sentence as `distilled`, and emits a `template: none` TODO draft brief.

### Changed
- Rabbit-hole detection patterns in `b2i score` now match the documented README set: broadened auth (any `auth`/`authentication`/`authorization`, plus OAuth/OIDC/SAML/SSO) and payment (generic `payment`) patterns; added multi-tenancy, native/mobile app (iOS/Android), and real-time video/audio (live stream, video call) patterns.

## [v0.4.0] — 2026-10-20

### Added
- `b2i export [brief|-] [--format prompt|issues|prd|json] [--output <path>] [--json]` — export approved briefs to Agent Kickoff Prompt, GitHub Task Checklist, One-page PRD, or machine-readable JSON.
- `/b2i-export` slash command skill instruction.
- Pure Node.js zero-dependency ANSI terminal styling (`c.green`, `c.red`, `c.yellow`, `c.cyan`, `c.bold`) respecting `NO_COLOR`, `FORCE_COLOR`, and `isTTY`.
- Automated benchmark test suite (`tests/benchmarks.test.mjs`) executing all 5 canonical scenarios from `benchmarks/specs.md` (PlantPulse, PawsOnDemand, CollabMark, kv-log-parse, Kreuzberg Book Swap Cafe).
- Rabbit-hole patterns for full-text search (Elasticsearch, fuzzy/semantic search).

### Changed
- `bin/b2i.mjs` entry point now loads engine from `skills/brainstorm2idea/scripts/` (single source of truth shared with agent plugins).

## [v0.3.0] — 2026-10-20

### Added
- `b2i spark [category] [--seed <id>] [--output <path>] [--json]` — 24 curated prototype archetypes across devtools, productivity, local-ai, automation, cli, and web.
- `/b2i-spark` slash command skill instruction for blank-canvas developers.
- Stdin piping support: `b2i check -` and `b2i score -`.
- Windows Notepad UTF-8 BOM (`\uFEFF`) and CRLF resilience.
- Heading trailing colon normalization (`## Goal:` → `Goal`).
- Bullet style flexibility (`+`, `*`, `-`) and flow numbering variants (`1)`, `1.`).
- Directory name security: Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) and illegal filesystem character protections in `b2i handoff`.
- Comprehensive stress test suite (`tests/stress.test.mjs`).

## [v0.2.0] — 2026-10-20

### Added
- `b2i score [brief|-] [--json]` — 0–100 Doability & Rabbit-Hole detector with letter grades (A–F) and pattern quarantine.
- `b2i handoff --target raw` — zero-dependency markdown brief scaffolding for non-JS / polyglot stacks (Python, Go, Rust, etc.).
- `/b2i-dump` slash command skill instruction — voice memo / raw stream-of-consciousness fast de-noiser protocol.
- Pre-registered ideation benchmarks (`benchmarks/specs.md`).
- Interactive modal questions via `ask_question` in agent environments.

## [v0.1.0] — 2026-10-20

### Added
- Schema contract `b2i-brief@1`.
- 7 hard lint checks (`b2i check`): schema, name, template, goal, flows, out-of-scope, distilled.
- Deterministic shell-safe scaffolding handoff into `idea2prototype` (`b2i handoff`).
- Token-budgeted dialogue protocol (`skills/brainstorm2idea/SKILL.md`).
- `b2i list [--json]` — print schema version and supported templates.
- Zero npm dependencies; pure Node.js (`node:fs`, `node:path`, `node:child_process`, `node:test`).

[unreleased]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.4.1...HEAD
[v0.4.1]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.4.0...v0.4.1
[v0.4.0]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.3.0...v0.4.0
[v0.3.0]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.2.0...v0.3.0
[v0.2.0]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/ahmed-3m/brainstorm2idea/releases/tag/v0.1.0