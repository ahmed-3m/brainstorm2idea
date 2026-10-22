# Changelog

## [Unreleased]

### Added
- Claude Code plugin manifest (`.claude-plugin/plugin.json`) and a single-plugin marketplace (`.claude-plugin/marketplace.json`): `/plugin install brainstorm2idea --marketplace ahmed-3m/brainstorm2idea`. The consistency suite pins both versions to the engine's.
- `spark --seed … --output` and `dump --output` take `--force` to overwrite an existing brief.
- `parseSections` also returns `duplicates`: the headings that appear more than once.

### Changed
- `spark --seed … --output` and `dump --output` refuse to overwrite an existing brief, as `init` already did. Pass `--force` to overwrite.
- The host guides moved from `agents/` to `hosts/` (`hosts/AGENTS.md`, `hosts/CLAUDE.md`). Claude Code loads `agents/` as subagents, so the guides showed up as junk agents named AGENTS and CLAUDE. The npm tarball now also ships `.claude-plugin/` and `.zcode-plugin/`.

### Fixed
- `check` fails a brief with a duplicated Goal, Core flows / Public API or Out of scope section and names it. Before, the last copy silently won. Other duplicated sections are a warning.
- Frontmatter after leading blank lines: `check` now says it must start on line 1 (it reported schema, template and distilled as missing), and `check --fix` removes the blank lines.
- `score` recognised a library brief's `## Public API` only with that exact casing.
- Windows: `handoff --i2p <path to a .cmd or .bat>` failed with `EINVAL`. It now runs through the same escaped `cmd.exe` command line as the npx fallback, with the program path escaped too. That line is passed as one string, which also silences Node 24's DEP0190 warning.
- The test suite failed when `FORCE_COLOR` was set in the environment.
- **The npm-installed `b2i` was a silent no-op on Linux/macOS.** npm links the bin as a bare `b2i` symlink, so the engine's `argv[1].endsWith('b2i.mjs')` guard never fired: `npx @ahmed-3m/brainstorm2idea …` and global installs printed nothing and exited 0 — including `check` on an invalid brief. `bin/b2i.mjs` now calls `main()` explicitly and the engine compares real paths. A CI step runs the npm-linked bin.
- `handoff --target raw` dropped Goal/Core flows/Out of scope when headings were not Title-cased (which `check` accepts), wrote a hollow `PROTOTYPE.md`, then deleted the brief. Sections are now matched case-insensitively, and an existing `PROTOTYPE.md` is never overwritten.
- `handoff` rejects an unknown `--target` instead of silently running i2p.
- The i2p merge expanded `$&`, `$$` and similar sequences in brief text (String.replace patterns) into `PROTOTYPE.md`.
- Filesystem errors (a directory as the brief, a missing `--output` parent, a read-only brief under `--fix`) printed a Node stack trace; they now print a one-line FAIL (or `{ok:false}` under `--json`) and exit 1.
- `spark --seed`, `dump` and `init` with `--output <existing dir>` write `<dir>/brief.md` instead of crashing.
- `score --json` exited 0 on an invalid brief.
- `score` reported OAuth or a payment gateway used in Core flows as "Mitigated" when a related term appeared in Out of scope (a 100/100 for a brief that builds the rabbit hole).
- Parser: `export` dropped `+` bullets and treated prose containing "2. " as a list item; a `## Goal` inside a fenced code block counted as the Goal section; a quoted frontmatter value was cut at its first interior quote; `distilled` length counted UTF-16 units, so 101 emoji failed the 200-char limit.
- Windows: the npx fallback in `handoff` passed arguments to `cmd.exe` unquoted.
- `/b2i-export` frontmatter was invalid YAML (`argument-hint: [--format a|b]`), so Claude Code dropped its description and hint. Command docs now use `b2i` consistently (defined in SKILL.md as shorthand for the bundled script), and `/b2i-dump` and SKILL.md now agree with the scorer that grade B means ≥ 80 (SKILL.md said 70).

## [v0.4.2] — 2026-10-22

### Added
- Six new `b2i spark` archetypes (24 → 30), covering the most requested starter shapes: `link-grabber` (browser extension), `csv-cleaner`, `flashcard-forge`, `discord-standup` (chat bot worker), `site-diff-scraper`, and `terminal-snake`. All pass `b2i check` 7/7 and score 100/100; the `b2i-brief@1` template set (`web|api|cli|worker|library|none`) is unchanged — it stays coupled to the `i2p new` contract.
- `b2i check [brief] --fix` — mechanical auto-repair for failing briefs, rewritten in place (file paths only): re-quotes frontmatter `schema`/`template`/`distilled` values that truncate on read-back (interior quotes, unquoted `#`), heals a missing/empty `schema:` key, and normalizes trailing whitespace/final newline while preserving CRLF. Never invents content; reports applied fixes (max 3 shown) and re-validates.
- `b2i score --json` now includes a structured `categories` object — per-category sub-scores with maxima and the evidence behind each (`outOfScopeBullets`, detected rabbit holes with fixes, mitigated labels, `risksTagged`/`notesLean`/`templateMismatch`). The existing `breakdown` field is unchanged.
- `fixBrief` engine export for programmatic consumers.
- `i2p-contract` CI job: seeds a real brief and feeds `b2i handoff` output into the **published** `@ahmed-3m/idea2prototype@latest` on every push/PR plus a weekly schedule, so cross-repo interface drift fails CI instead of user terminals. Guarded by the consistency suite.
- Issue templates (bug report, feature request, spark archetype proposal), a PR template carrying the zero-dependency checklist, and a `dependabot.yml` keeping the SHA-pinned GitHub Actions current.

### Changed
- The npmjs publish job now emits npm provenance attestations (`id-token: write` + `npm publish --provenance`), so releases from v0.4.2 onward carry the "Verified" provenance link on npmjs.org.

## [v0.4.1] — 2026-10-21

### Added
- `b2i dump [file|-] [--output <path>] [--json]` — mechanical de-noiser for raw voice transcripts and brain dumps: strips conversational filler, extracts the first substantive sentence as `distilled`, and emits a `template: none` TODO draft brief.
- `b2i init <name> [--template web|api|cli|worker|library|none] [--output <path>] [--json]` — scaffold a schema-valid starter brief with TODO sections for humans working outside an agent; refuses to overwrite an existing `brief.md`.
- `skills/brainstorm2idea/scripts/parser.mjs` — reusable parser module (`parseFrontmatter`, `parseSections`, `extractListItems`, `readBriefFile`, `quoteFrontmatterValue`, `sanitizeInlineText`) extracted from the engine for external consumers; the engine re-exports it for backward compatibility.
- `CLI_COMMANDS` export — single source of truth for the CLI router surface, asserted against `SKILL.md` and `AGENTS.md` by the consistency test suite.

### Changed
- Rabbit-hole detection patterns in `b2i score` now match the documented README set: broadened auth (any `auth`/`authentication`/`authorization`, plus OAuth/OIDC/SAML/SSO) and payment (generic `payment`) patterns; added multi-tenancy, native/mobile app (iOS/Android), and real-time video/audio (live stream, video call) patterns.
- README redesigned: SVG hero with real terminal proof, workflow diagram, badges, and restructured story.
- `b2i init --template library` now emits the `## Public API` section (matching `b2i spark` and the library template contract) instead of `## Core flows`, which previously triggered a spurious alignment penalty and notice in `b2i score`.
- `b2i init` and `b2i dump` are now documented in the `SKILL.md` and `AGENTS.md` command lists.

### Fixed
- `b2i init` and `b2i dump` no longer truncate the `distilled` value when the input contains a double quote — the frontmatter parser stops at the first interior quote, so values are now escaped before interpolation.
- `b2i dump` no longer discards an entire line that merely *starts* with conversational filler; the filler prefix is stripped and the remainder of the line is preserved.
- `b2i init` no longer rewrites quotes in the project name shown in the `# Title` heading — headings are parsed verbatim, so only the frontmatter value is quote-escaped.
- `b2i init` now rejects a whitespace-only name and self-verifies the generated brief against the 7 check rules before writing it, so it can no longer report success for a brief that fails `b2i check`.
- `b2i dump` now preserves blank lines between ideas instead of discarding them.

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

[unreleased]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.4.2...HEAD
[v0.4.2]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.4.1...v0.4.2
[v0.4.1]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.4.0...v0.4.1
[v0.4.0]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.3.0...v0.4.0
[v0.3.0]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.2.0...v0.3.0
[v0.2.0]: https://github.com/ahmed-3m/brainstorm2idea/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/ahmed-3m/brainstorm2idea/releases/tag/v0.1.0