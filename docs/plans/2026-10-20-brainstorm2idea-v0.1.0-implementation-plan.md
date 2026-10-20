# brainstorm2idea — v0.1.0 Implementation Plan

**Date:** 2026-10-20 · **Spec:** `../specs/2026-10-20-brainstorm2idea-design.md` · **Scope:** v0.1.0 core pipeline only (brief contract, `check`, `handoff` incl. `--target raw`, skill, agents docs, tests, packaging). `score` / `spark` / `export` / stdin-BOM-hardening are **out of scope** — later releases, own plans. · **Status:** awaiting user approval before any code.

---

## Design principles carried into code

1. **Deterministic outside the model, instructions inside** — engine does parse/lint/merge/spawn; the skill does the dialogue.
2. **Zero dependencies, forever** — Node ≥ 18.17 built-ins only (`node:fs`, `node:path`, `node:child_process`, `node:test`).
3. **Verdicts, not logs** — ≤3 failure notes, capped output, `--json` mirrors text.
4. **Single transformation point** — the skill always writes a plain `b2i-brief@1` brief; alias + body-only merge live only in the engine.
5. **TDD per task** — i2p's own discipline: tests written (or fixtures defined) before/with each engine unit; `node --test` green at every task boundary.

---

## Verified facts the code must honor (from i2p source — don't re-derive)

- `i2p new <dir>` flags: `--template` (default `web`), `--name` (default dir basename, `<>` stripped), `--idea` (default placeholder). Refuses non-empty dir via `die()` → exit 1.
- Templates live in `skills/idea2prototype/templates/{web,api,cli,worker,library}/` (+ reserved `features/`); `list` enumerates the dir live.
- Every template's `PROTOTYPE.md` starts `# Prototype spec — {{name}}` + `> Idea: {{idea}}`, sections `## Goal`, `## Core flows` (**except library → `## Public API`**), `## Modules (optional)`, `## Out of scope`, each seeded with `<!-- -->` guidance comments.
- `i2p check` never reads `PROTOTYPE.md` (syntax + `node:test` + boot probe only).
- Node ≥ 18.20/20.12/21.7 (CVE-2024-27980): spawning `.cmd`/`.bat` without `shell:true` throws `EINVAL`.

## Pre-flight repo bootstrap (task 0, non-code)

`git init` in the seed folder `D:\side_hustle\opensources_gh\brainstorm2idea`, add `.gitignore` (`node_modules/`, `*.tmp`, `.DS_Store`), initial commit of `docs/` only. All subsequent tasks commit as they land.

---

## Tasks (each = tests + implementation + green run, in dependency order)

### Task 1 — `parseBrief` + fixtures + `check`
- `tests/fixtures/briefs/` — 16 fixtures: `happy-web`, `happy-none`, `happy-library`, `happy-colon-distilled`, `happy-warn-notes7` (7 Notes bullets), `happy-warn-riskprefix`, `happy-warn-metachars` (shell metachars in name/distilled), `fail-goal4`, `fail-goal0`, `fail-flows0`, `fail-flows4`, `fail-flows-unnumbered`, `fail-oos0`, `fail-distilled201`, `fail-template`, `fail-noh1`.
- Engine unit `parseBrief(text) → { schema, template, distilled, name, sections: { goal:[], flows:[], outOfScope:[], risks:[], notes:[] } }`:
  - frontmatter: split on first `:`, strip inline `#` comment (outside quotes), strip surrounding `"`/`'` (colon-in-distilled survives — fixture `happy-colon-distilled`).
  - body: first `# ` line → name; `## ` sections case-tolerant; bullets `- `/`* `; numbered `N.` (v1: only `1.` form — `1)` flexibility is a v0.3.0 item).
- `lintBrief(parsed) → { errors:[≤3 surfaced], warnings:[] }` — 7 hard checks (§4 table) + soft warns: unprefixed risk lines, Notes > 6, unknown-schema drift, shell metacharacters.
- `cmdCheck` — text verdict `Brainstorm2idea check — PASS (7/7)` / `FAIL (X/7)` + ≤3 notes, exit 0/1; `--json` per §4.
- **Done when:** `node --test` passes all fixtures; manual `node …brainstorm2idea.mjs check tests/fixtures/briefs/happy-web.md` prints PASS.

### Task 2 — `mergePrototype` (pure) + unit tests
- `mergePrototype(existingMarkdown, parsedBrief, template) → mergedMarkdown` — pure, no I/O:
  - body-only (finding 2): keep target's `# …` H1 and `> Idea:` line untouched; never insert brief H1/distilled.
  - replace `## Goal` / `## Out of scope`; replace `## Core flows` — or, when `template === 'library'`, alias to `## Public API` (finding 1).
  - on replace, drop the section's leading `<!-- -->` guidance comment (finding 3).
  - append `## Risks & assumptions` / `## Notes` if the brief has them; preserve every section b2i doesn't own (e.g. `## Modules (optional)`) byte-for-byte.
- Tests: fixture pairs (template `PROTOTYPE.md` in + brief in → expected out) for web + library; assert single H1, one Idea line, no `{{`, no leftover guidance comments, unknown section preserved.

### Task 3 — `mock-i2p` fixture + `handoff` (`--target i2p` + `--target raw`) + integration tests
- `tests/fixtures/mock-i2p.mjs` — implements the real `new` contract: stamps `{{name}}`/`{{idea}}`, emits `## Public API` when `--template library`, placeholder comments, `## Modules (optional)`, refuses non-empty dir (exit 1). Driven by a local `mock-template/` tree copied from i2p's real templates (trimmed).
- `cmdHandoff`:
  1. pre-flight `lintBrief` → on fail print verdict, exit 1, touch nothing.
  2. `template: none` → polite decline, exit 0.
  3. `--target raw` → write `<dir>/PROTOTYPE.md` from scratch via the **same** `mergePrototype` applied to the raw skeleton (`# Prototype spec — {{name}}` + `> Idea: {{idea}}` + empty sections); no spawn, works offline.
  4. `--target i2p` (default) → resolve invocation per finding 4: `--i2p <path>`/`B2I_HANDOFF_CMD` → `spawnSync(process.execPath, [script,'new',…], {shell:false})`; else Unix `spawnSync('npx',[…],{shell:false})`; else Windows `npx.cmd` + `shell:true` + argv quoting. Offline/unreachable → print exact command, exit 2. `i2p` failure → surface stderr/stdout, exit 1, brief untouched.
  5. merge → atomic write (tmp + rename) → delete `brief.md` only on full success → print next steps incl. `AGENTS.md` pointer.
  6. `--dry-run` → pre-flight + print command array + merged preview; filesystem untouched.
- Integration tests (spawn real engine against `mock-i2p` via `--i2p`): happy web + library alias, pre-flight-block, `none` decline, dry-run FS-untouched, brief-deleted-only-on-success, exit-2 path (mock "offline" via a failing target), special-chars-in-name/distilled round-trip (via `process.execPath` mode — no shell).

### Task 4 — `cmdList` + consistency test
- `cmdList` prints schema `b2i-brief@1`, templates `web, api, cli, worker, library, none`, engine version (from `package.json`); `--json`.
- `tests/consistency.test.mjs` — engine's `TEMPLATES` constant + `SCHEMA` string match the tables in `SKILL.md` and `README.md` (regex-extract both, assert equality). Catches doc drift.

### Task 5 — `SKILL.md` + `agents/AGENTS.md` + `agents/CLAUDE.md`
- `SKILL.md` — frontmatter (name, description from spec §5) + the full protocol verbatim from spec §5 (two hard rules, pre-check, dynamic moves, doability duty, fallback rhythm, fixed tail, token discipline, structural-awareness note).
- `agents/AGENTS.md` — portable: what b2i is, the three commands, the b2i→i2p chain, token-discipline rules (works for Antigravity/Cursor/OpenAI-style agents).
- `agents/CLAUDE.md` — thin pointer to AGENTS.md (i2p's pattern).

### Task 6 — packaging + CI + README + LICENSE
- `package.json` — `name: @ahmed-3m/brainstorm2idea`, `version: 0.1.0`, `bin: { b2i: ./skills/brainstorm2idea/scripts/brainstorm2idea.mjs }`, `engines: { node: '>=18.17' }`, `files` limited to skill + agents + docs, license MIT, repo/bugs/homepage pointing at `ahmed-3m/brainstorm2idea`.
- `.github/workflows/ci.yml` — Node 18/22/24 × `ubuntu-latest`/`windows-latest`, run `node --test tests/`.
- `README.md` — i2p-mirroring: one-liner + pipeline diagram, quickstart (npx), the three commands, brief grammar, exit-code table, "how it compares" positioning, design rules, the `i2p check`-doesn't-read-PROTOTYPE.md note (finding 5 — justifies `b2i check`'s existence), MIT badge.
- `LICENSE` — MIT, `Ahmed 3M` (mirror i2p's).

### Task 7 — self-dogfood smoke + release notes
- Run the actual dialogue on one fresh idea using the new `SKILL.md`, produce a real `brief.md`, run `check` (PASS), `handoff --target raw` (offline, deterministic), and `handoff --target i2p --i2p <local i2p clone engine>` against the sibling i2p checkout; confirm the merged `PROTOTYPE.md` passes the structural sanity contract. Record the session as `benchmarks/dogfood-1.md` (light — full pre-registered benchmarks are a v0.2.0 roadmap item).
- Draft `CHANGELOG.md` entry for v0.1.0.

---

## Deliberately deferred (v0.2.0+)

`b2i score` rubric, `b2i spark`, `b2i export`, stdin (`-`) piping, BOM/CRLF hardening, `1)` numbering, `+`/`*` bullet flexibility, heading-colon normalization, Windows reserved-name dir checks, `tests/stress.test.mjs`, `tests/benchmarks.test.mjs`, `/b2i-*` slash commands, ANSI styling. All are documented in the spec roadmap and get their own plans.

## Definition of done for v0.1.0

`node --test tests/` green on Node 18/22/24 × ubuntu/windows; `npx .` locally behaves as `b2i`; a real dogfood session produces PASS + a merged `PROTOTYPE.md`; README quickstart reproducible by a stranger; zero `node_modules/`.
