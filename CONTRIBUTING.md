# Contributing to brainstorm2idea (`b2i`)

Thanks for helping out! `b2i` is deliberately small: one zero-dependency Node engine that turns fuzzy ideas into machine-linted briefs and hands them off to [idea2prototype](https://github.com/ahmed-3m/idea2prototype). This file is the 3-minute orientation.

## Getting started

```bash
git clone https://github.com/ahmed-3m/brainstorm2idea.git
cd brainstorm2idea
node --version   # must be >= 18.17
npm test         # that's it — there is no install step, ever
```

The project has **zero npm dependencies**, so there is nothing to `npm install`, no build step, and no lint config. If a change needs a package, the change is wrong (see constraints below).

## Running the tests

Always via npm:

```bash
npm test   # engine + consistency + stress + benchmarks suites
```

Do not invoke `node --test tests/` directly — the npm script pins the exact suite order and file list, and the consistency suite enforces repo-wide invariants that assume it.

## Architecture map

| Path | Role |
|---|---|
| `skills/brainstorm2idea/scripts/brainstorm2idea.mjs` | **The engine.** All CLI logic: check, score, spark, init, dump, export, handoff, list |
| `skills/brainstorm2idea/scripts/parser.mjs` | Pure frontmatter/section parser, reusable by external consumers |
| `bin/b2i.mjs` | npm bin entry; loads the engine (single source of truth) |
| `skills/brainstorm2idea/SKILL.md` | Agent-facing dialogue protocol (Socratic, token-budgeted) |
| `commands/*.md` | Slash-command skill instructions |
| `tests/*.test.mjs` | 4 suites; `consistency.test.mjs` guards docs/version/workflow contracts |
| `benchmarks/specs.md` | Pre-registered ideation benchmark scenarios |
| `assets/readme/` | README artwork; `generate-demo.mjs` regenerates the animated demo |

## Hard constraints (non-negotiable)

1. **Zero dependencies forever.** Pure `node:*` built-ins only (`node:fs`, `node:path`, `node:child_process`, `node:test`, `node:url`). No exceptions, including dev dependencies.
2. **Spawn safety.** Never spawn `.cmd`/`.bat` executables (e.g. bare `npx` on Windows) without `shell: true` (CVE-2024-27980); always pass argv arrays, never a shell string, everywhere else.
3. **Schema stability.** `b2i-brief@1` and the 7 hard checks must not break. `VALID_TEMPLATES` (`web|api|cli|worker|library|none`) is the contract with `i2p new` — new idea archetypes belong in the `b2i spark` catalog, not in the template list.
4. **Token discipline.** Compact verdicts; at most 3 failure notes per run; diff-sized edits.
5. **Handoff safety.** Windows reserved-name/illegal-character guards on handoff dirs; the source brief is deleted only after a fully successful handoff.
6. **Version consistency is test-enforced.** When releasing, bump together: engine `VERSION`, `package.json`, `.zcode-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and (if present) `../marketplace.json`.

## Commit & PR conventions

- Conventional Commits (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`, `test:`) — see `git log` for examples.
- Update `CHANGELOG.md` under `[Unreleased]` in the same commit as the change.
- Add tests for anything the engine does differently than before; the suite must stay green on Node 18/22/24 for both Linux and Windows (CI runs the matrix).
- Direct pushes to `main` are allowed for maintainers, but a PR is preferred for anything non-trivial — CI runs the full matrix plus the packed-tarball smoke test.

## Good first contributions

- **New spark archetypes** (`SPARK_CATALOG` in the engine): add an entry, bump the pinned count in `tests/stress.test.mjs`, update the "30 curated archetypes" mentions in README/SKILL.md. Every archetype must pass `b2i check` 7/7 and score 100/100 — the stress suite enforces it.
- **Rabbit-hole patterns** (`RABBIT_HOLES`): new patterns need a matching test brief and must not regress existing scores.
- **Docs and examples**: clearer README flows, more `b2i dump`/`b2i export` examples, translations of the SKILL protocol.

Look for the [`good first issue`](https://github.com/ahmed-3m/brainstorm2idea/labels/good%20first%20issue) label, or ask in [Discussions](https://github.com/ahmed-3m/brainstorm2idea/discussions).

## Questions & ideas

Open a [Discussion](https://github.com/ahmed-3m/brainstorm2idea/discussions) for ideas and questions, an [issue](https://github.com/ahmed-3m/brainstorm2idea/issues) for bugs. Security reports: please open a private security advisory rather than a public issue.
