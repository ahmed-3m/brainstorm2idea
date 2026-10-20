# brainstorm2idea — Design Spec

**Date:** 2026-10-20 · **Status:** approved design, pre-implementation (v2 — incorporates shell-safety, parser, merge, exit-code, and multi-agent fixes) · **Repo:** `github.com/ahmed-3m/brainstorm2idea`

## 1. One-liner

`brainstorm2idea` (`b2i`) is the pre-stage of `idea2prototype` (`i2p`): it turns a fuzzy idea into a machine-lintable prototype brief through a token-budgeted dialogue, then hands off deterministically to `i2p new` (or any custom workflow consumer).

```text
fuzzy idea (chat dump, notes, voice transcript)
   │  /b2i dialogue — adaptive questions, expect 3–5, hard cap 8
   ▼
brief.md (schema b2i-brief@1)
   │  b2i check — verdict, ≤3 failure notes
   │  b2i handoff — pre-flight check + i2p new … + merge brief into PROTOTYPE.md (brief is moved)
   ▼
idea2prototype as exists today (add / check / map loop)
```

**Positioning:** GSD / Spec Kit / OpenSpec / Task Master assume the idea arrives articulated; BMAD-METHOD has brainstorming but is a heavyweight 30-persona framework ending at documents. Nobody tools the *fuzzy → crisp* stage, and nobody hands off into deterministic scaffolding. `b2i` owns exactly that seam and nothing else.

## 2. Decisions Log

| # | Decision | Choice |
|---|---|---|
| 1 | Output artifact | Prototype brief only — no validation pass, no PRD-lite, no competitor scan (permanent non-goal unless explicitly reversed). |
| 2 | Dialogue mode | Adaptive ask: infer first, ask only what can't be inferred; expect 3–5 questions, cap 8; unanswered → `ASSUMPTION:` line, never blocks. |
| 3 | Architecture | Sibling repo, contract-coupled: separate repo + npm package, coupled to `i2p` (or custom workflow tools) only via the versioned brief schema (`b2i-brief@1`) + the handoff command. |
| 4 | Non-software ideas | `template: none` = brief-only mode; `check` passes, `handoff` declines politely (exit 0). |
| 5 | Distilled one-liner | Required, ≤ 200 chars, non-empty. |
| 6 | Brief at handoff | *Moved* into the project as its `PROTOTYPE.md` (merge-then-move; no diverging copies). All brief sections—including `Risks & assumptions` and `Notes`—are preserved. |
| 7 | Command set | `check` + `handoff` + `list` (no `init` — the dialogue writes the brief; revisit only if humans ask). |
| 8 | Dialogue structure | Destination fixed, journey free: only human approval + `check`-PASS are hard rules; the phase list demotes to a fallback rhythm; reframe / scope-cut / zero-question moves; native agent tools allowed mid-dialogue. |
| 9 | Doability | Explicit dialogue duty: template fit, smallest demoable slice, riskiest assumption; non-demoable flows → out-of-scope; honest "not prototype-doable" with reshape-or-brief-only outcome. |
| 10 | Notes section | Optional free-form valve, ≤6 bullets, warn-only lint — never fails a check, preserved on handoff merge. |
| 11 | Multi-agent & Custom Workflows | Works out-of-the-box as an Antigravity / Claude Code / ZCode skill and standalone CLI; supports `--i2p` / `B2I_HANDOFF_CMD` overrides and `--json` output so anyone can chain `b2i` into custom scaffolders. |

## 3. The Brief Contract — `b2i-brief@1`

A single markdown file, `brief.md`, default in the current working directory (overridable via `check [brief]` or `handoff <dir> --brief <path>`):

```markdown
---
schema: b2i-brief@1
template: web            # web | api | cli | worker | library | none
distilled: Recipe box that lets cooks save recipes with tags and search them offline
---
# Recipe Box

## Goal
- One sentence per bullet, max 3

## Core flows
1. Named flow, one sentence (1–3 total)

## Out of scope
- Explicit non-goal (at least 1 required)

## Risks & assumptions
- RISK: …
- ASSUMPTION: inferred by the agent, not confirmed by the human — strike or keep

## Notes
- Free-form: constraints, preferences, data sources (optional, ≤6 bullets)
```

### Contract & Parser Rules

* **Name** = the first H1 (`# ...`) text; feeds `i2p new --name`. Must be non-empty.
* **distilled** = the ≤200-char one-liner passed verbatim to `i2p new --idea`. Required in every brief, including `template: none`.
* **Frontmatter parsing (Zero-Dep Safety):** The custom frontmatter parser must split keys and values on the *first* `:` of each line (`line.slice(line.indexOf(':') + 1)`), stripping inline `# comments` (only when outside quotes) and optional surrounding `"` or `'` quotes, so colons inside `distilled` (e.g., `distilled: "Log tool: parse and export"`) never break parsing.
* **template** must match one of `i2p`'s published templates (`web | api | cli | worker | library`) or `none`. The enum is a pinned constant in the engine; drift against a future `i2p` template surfaces as an informational note, never a hard failure unless strictly invalid.
* **Risks & assumptions** is optional; when present, bullets should be prefixed `RISK:` or `ASSUMPTION:` (format is lint-soft: warned, not failed, in v1).
* **Notes** is optional, ≤6 bullets, free content — the dynamic escape valve for details that don't fit fixed sections. Soft-linted (warn only); deliberately *not* one of the seven hard checks.
* **Schema versioning:** An unknown/future `schema:` value lints everything it knows and appends an informational drift note. The version is the only coupling interface with `i2p` or custom consumers.

## 4. Engine — One Zero-Dependency `.mjs` (Node ≥ 18.17)

Same DNA as `i2p`: deterministic outside the model, instructions inside. No external npm dependencies, ever.

### `b2i check [brief] [--json]`

Default path: `./brief.md`. Runs seven hard lint checks (plus soft warnings for `Risks & assumptions` prefixes, `Notes` > 6 bullets, or schema drift):

| # | Check | Rule |
|---|---|---|
| 1 | `schema` | `b2i-brief@1` present and known (unknown non-empty → drift note, not fail; missing → fail) |
| 2 | `name` | H1 (`# Title`) present, non-empty |
| 3 | `template` | in `web \| api \| cli \| worker \| library \| none` |
| 4 | `goal` | `## Goal` has 1–3 non-empty `- ` or `* ` bullets |
| 5 | `flows` | `## Core flows` has 1–3 numbered (`1.`, `2.`, `3.`) items, each non-empty |
| 6 | `out-of-scope` | `## Out of scope` has ≥ 1 non-empty bullet |
| 7 | `distilled` | non-empty, ≤ 200 chars |

**Verdict format (identical to `i2p`):**

```text
Brainstorm2idea check — PASS (7/7)
```

On failure: `Brainstorm2idea check — FAIL (X/7)`, followed by **at most 3 failure notes** (e.g., `goal: 4 bullets, max 3`), exit `1`. Soft warnings print only when applicable and do not fail the check. `--json` returns `{ ok: boolean, passed: number, total: 7, errors: string[], warnings: string[], meta: { schema, template, name, distilled } }`.

### `b2i handoff <dir> [--brief <path>] [--i2p <version|path>] [--dry-run] [--json]`

1. **Load & Pre-Flight Check:** Load the brief (default `./brief.md`, overridable via `--brief <path>`). Run the `check` validator in-memory first. If `check` fails, print the failure verdict (≤3 notes) and exit `1` before touching `<dir>` or invoking `i2p`.
2. **Brief-Only Mode:** If `template: none` → decline politely (`Brief-only mode (template: none) — handoff skipped.`), exit `0`.
3. **Scaffold via `i2p` (Shell-Safe Execution):** Invoke `i2p` using `child_process.spawnSync` with `shell: false` (passing arguments as an OS array to prevent quote/variable injection in `<H1>` or `<distilled>`):
   * Default: `npx -y @ahmed-3m/idea2prototype@latest new <dir> --template <t> --name <H1> --idea <distilled>` (using `npx.cmd` on Windows when needed, or `node <path>` if `--i2p` points to a local `.mjs`/`.js` script or `B2I_HANDOFF_CMD` is set).
   * Directory-emptiness rules are delegated to `i2p new`; if `i2p new` fails, `b2i` surfaces its stderr/stdout and exits `1` with `brief.md` untouched.
4. **Merge-Then-Move:** Update the newly scaffolded `<dir>/PROTOTYPE.md` by section name:
   * Replace `## Goal`, `## Core flows`, and `## Out of scope` with the brief's content.
   * Append/merge `## Risks & assumptions` and `## Notes` (if present in `brief.md`) so zero context is lost.
   * Preserve any additional `i2p` sections that `b2i` doesn't own (never discard unknown content).
   * Delete the original `brief.md` **only after** `i2p new` succeeds and `<dir>/PROTOTYPE.md` is written atomically.
5. **Next Steps Output:** Print `cd <dir>`, `npm run check`, the `i2p add` loop, and a pointer for coding agents to load `<dir>/AGENTS.md` (or `CLAUDE.md`).
6. **`--dry-run`:** Runs pre-flight check and prints the exact command array + preview of the merged `PROTOTYPE.md` without executing or modifying disk.

**Graceful Degradation & Exit Codes:**

* `0` = Full handoff success, `--dry-run` success, or polite decline (`template: none`).
* `1` = Brief lint failure, `i2p new` execution failure (e.g., non-empty target dir), or file I/O error.
* `2` = Graceful degradation (`i2p` / `npx` unreachable due to offline/network failure). Prints the exact `npx @ahmed-3m/idea2prototype@latest new ...` command to run later, leaves `brief.md` intact, and exits `2` (or `"status": "degraded_offline"` in `--json`) so automated agents/CI pipelines do not falsely assume `<dir>` was created.

### `b2i list [--json]`

Prints schema version (`b2i-brief@1`), supported templates (`web, api, cli, worker, library, none`), and engine version.

## 5. The Dialogue Skill (`skills/brainstorm2idea/SKILL.md`)

The model's half. **Destination fixed, journey free.** The dialogue is as dynamic as the agent is smart; only the outcome is contracted.

### Agent Skill Metadata (YAML Frontmatter)

`skills/brainstorm2idea/SKILL.md` must include standard frontmatter for Claude Code, Antigravity, and compatible skill loaders:

```yaml
---
name: brainstorm2idea
description: Turn a rough, fuzzy, or unformed idea into a linted prototype brief (b2i-brief@1) through a fast, token-budgeted dialogue (3-5 questions max) and hand off to idea2prototype (i2p). Use before scaffolding new projects or when brainstorming scope.
---
```

### Hard Rules (The Only Two)

1. **Approval Gate:** Nothing is written to disk (`brief.md`) without the human's explicit approval of the draft in chat. (Before showing the draft for approval, the agent must self-verify all 7 check constraints—such as `distilled` ≤ 200 chars and 1–3 bullets—so `b2i check` passes cleanly on the first write).
2. **Verified Exit:** The session doesn't end before `b2i check` passes — or the human says stop.

### Pre-Check on Session Start

* Before starting intake, check if `brief.md` already exists in the current directory. If it does, ask the user in one line whether to resume/refine the existing brief or start fresh.

### Dynamic Moves (Picked Freely by the Agent)

* **Reframe:** When the idea is ambiguous, offer 2–3 crisp alternative framings and let the human pick.
* **Scope-cut:** Propose what to drop to reach prototype size; the caps (3 goals, 3 flows) are the doability mechanism, not bureaucracy.
* **Doability challenge:** Push back when a flow can't be demoed or the scope is secretly three prototypes.
* **Zero-question mode:** A comprehensive dump goes straight to a draft; every unconfirmed inference becomes an `ASSUMPTION:` line.
* **Native tools:** `b2i` lives inside a coding agent. Reading local files, inspecting existing repos, searching the web, or checking memory are all fair game mid-dialogue.

### Explicit Doability Duty

Before presenting the draft, the dialogue must resolve:

1. Which `i2p` template fits (`web | api | cli | worker | library | none`) and why.
2. What the smallest demoable slice is (`## Core flows`, 1–3 items).
3. What the riskiest assumption is (`RISK:` / `ASSUMPTION:` lines).

Flows that cannot be demoed in a prototype go into `## Out of scope`. If the idea isn't software-prototype-doable, say so honestly and offer to reshape or output `template: none` (brief-only).

### Fallback Rhythm (For Vague Dumps)

Intake raw idea without judgment → infer every field already answered → ask adaptively, **one question at a time**, multiple-choice when possible (expect 3–5, hard cap 8; stop early when remaining unknowns can be recorded as low-risk `ASSUMPTION:` lines) → present draft for approval.

*Decomposition rule:* If the dump is secretly two projects, say so and brief one first — never a Frankenstein scope.

### The Fixed Tail & Skill Chaining

1. Human approves draft → Agent writes `brief.md` and immediately runs `b2i check` (using local `node <skill_dir>/scripts/brainstorm2idea.mjs check` or `npx @ahmed-3m/brainstorm2idea check`).
2. If `b2i check` fails, fix the named section, re-run, and output the verdict only.
3. Ask if the human wants to run `b2i handoff <dir>`.
4. Once `b2i handoff <dir>` succeeds, **immediately transition context** by reading `<dir>/AGENTS.md` (or `<dir>/CLAUDE.md` / the `idea2prototype` skill) so the user can continue directly into the `i2p` loop without re-explaining the project.

**Token Discipline:** Diff-sized edits, never re-print the whole brief on minor tweaks, print verdicts instead of raw logs.

## 6. Repo Layout & Distribution

```text
brainstorm2idea/
├─ skills/brainstorm2idea/
│  ├─ SKILL.md                       # Agent skill frontmatter + dialogue protocol (§5)
│  └─ scripts/brainstorm2idea.mjs    # THE zero-dep engine
├─ tests/
│  ├─ engine.test.mjs                # Unit + fixture tests for check, list, and handoff
│  └─ consistency.test.mjs           # Template enum & schema sync across code/docs
├─ agents/
│  ├─ AGENTS.md                      # Portable agent instructions (Antigravity, OpenAI, Cursor, etc.)
│  └─ CLAUDE.md                      # Claude Code workflow pointer
├─ package.json                      # @ahmed-3m/brainstorm2idea, bin: { "b2i": "./skills/brainstorm2idea/scripts/brainstorm2idea.mjs" }
├─ README.md · LICENSE (MIT) · .github/workflows/ci.yml
```

* **Distribution:** npm primary (`npx @ahmed-3m/brainstorm2idea`), GitHub Packages mirror.
* **Plugin/Skill Ergonomics:** Works as a drop-in skill folder (`skills/brainstorm2idea`) for Claude Code and Antigravity, a ZCode plugin, or a standalone CLI package in custom developer workflows.
* **CI:** Node 18 / 22 / 24 × `ubuntu-latest` / `windows-latest`.
* **`i2p`-side integration (1 PR):** Add pointer in `idea2prototype`'s `README.md` and `AGENTS.md` / `CLAUDE.md` referencing `brainstorm2idea` as the upstream pre-stage.

## 7. Error Handling Summary

| Situation | Behavior | Exit Code |
|---|---|---|
| Missing or invalid brief at `check` or `handoff` | `FAIL`, ≤3 notes, target dir untouched | `1` |
| Unknown future `schema:` version | Lint known rules + append informational drift note | `0` (if rules pass) |
| `handoff` with `template: none` | Polite decline (brief-only terminal state), `brief.md` kept | `0` |
| `i2p` unreachable at `handoff` (offline / no `npx`) | Print exact `i2p new` command for later, `brief.md` kept | `2` |
| `i2p new` fails (e.g., non-empty target dir) | Surface `i2p`'s error, `brief.md` untouched | `1` |
| Merge target (`PROTOTYPE.md`) lacks expected sections | Replace matched sections, append `Risks & assumptions` + `Notes` + unmatched sections; never discard existing `i2p` sections | `0` |

## 8. Testing (`node:test`)

* **`check` lint tests:** Fixtures covering every failure class — 4-bullet goal, 0 flows, 4 flows, unnumbered flows, empty out-of-scope, 201-char distilled, colon inside `distilled`, invalid template, missing H1 — plus happy path, soft warnings (`Notes` > 6 bullets, unprefixed risk lines, unknown schema drift), and `template: none` pass. Zero network.
* **`handoff` tests:** Tested against a stubbed local `i2p` fixture script (`--i2p ./tests/fixtures/mock-i2p.mjs`), verifying:
  1. Pre-flight check blocks invalid briefs before invoking `i2p`.
  2. Special characters (quotes, `$vars`, colons, backticks) in H1 and `distilled` pass safely without shell corruption.
  3. `Goal`, `Core flows`, `Out of scope`, `Risks & assumptions`, and `Notes` merge cleanly into `PROTOTYPE.md`, unknown `i2p` sections survive, and `brief.md` is removed only on success.
  4. The resulting merged `PROTOTYPE.md` satisfies `i2p check` structural expectations.
  5. `--dry-run` leaves the filesystem untouched.
* **Consistency test:** Verifies that the engine's template enum (`web | api | cli | worker | library | none`) and schema constant (`b2i-brief@1`) match `SKILL.md` and `README.md`.

## 9. Non-goals

Personas, success metrics, competitor scanning, PRD-lite output, suggested `add` modules, an `init` command, multi-brief management, invoking `i2p` from inside `check`.

## 10. Roadmap (Post-v1)

1. Dogfooding benchmark doc, mirroring `i2p`'s pre-registered paired protocol (`benchmarks/specs.md`).
2. `b2i init` only if non-agent humans ask for it.
3. Always-current handoff (unpinned `i2p` template discovery) once `i2p` exposes machine-readable template introspection.
