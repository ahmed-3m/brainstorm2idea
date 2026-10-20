---
name: brainstorm2idea
description: Turn a rough, fuzzy, or unformed idea into a linted prototype brief (b2i-brief@1) through a fast, token-budgeted dialogue (3-5 questions max) and hand off to idea2prototype (i2p). Use before scaffolding new projects or when brainstorming scope.
---

# Brainstorm2Idea — fuzzy ideas into linted prototype briefs

`brainstorm2idea` (`b2i`) is the pre-stage of `idea2prototype` (`i2p`): it turns an unformed idea, chat dump, or voice transcript into a machine-lintable prototype brief (`b2i-brief@1`) through an adaptive dialogue, then hands off deterministically to `i2p new` (or custom consumers).

## The tool

The engine is one zero-dependency Node script (Node >= 18.17):

```bash
node "<skill-base>/scripts/brainstorm2idea.mjs" <command>
# or if installed globally / via npx:
b2i <command>
```

`<skill-base>` is this skill's directory. Commands:

- `check [brief|-] [--json]` — run 7 hard lint checks on `brief.md` or stdin (compact verdict, max 3 failure notes)
- `score [brief|-] [--json]` — compute 0–100 Doability & Rabbit-Hole score (grade A–F, advisory exit 0)
- `spark [category] [--seed <id>] [--output <path>] [--json]` — browse 24 curated prototype archetypes or seed a complete `brief.md` (devtools, productivity, local-ai, automation, cli, web)
- `export [brief|-] [--format prompt|issues|prd|json] [--output <path>] [--json]` — export approved brief to Agent Kickoff Prompt, GitHub Task Checklist, One-page PRD, or JSON
- `handoff <dir> [--brief <path>] [--target i2p|raw] [--i2p <version|path>] [--dry-run] [--json]` — pre-flight check + scaffolding:
  - `--target i2p` (default): invokes `i2p new <dir>`, then merges brief into `<dir>/PROTOTYPE.md`
  - `--target raw`: scaffolds standalone `<dir>/PROTOTYPE.md` with zero dependencies (for Python, Go, Rust, or non-i2p stacks)
- `list [--json]` — print schema version (`b2i-brief@1`) and supported templates

---

## Workflow: Destination Fixed, Journey Free

Only two rules are non-negotiable:
1. **Approval Gate:** Never write `brief.md` to disk until the user explicitly approves the drafted brief in chat. (Self-verify all 7 lint constraints before presenting).
2. **Verified Exit:** The brainstorming session does not end until `b2i check` passes cleanly (or the human explicitly says stop).

### Pre-Check on Session Start
Before intake, check if `brief.md` exists in current directory. If present, ask in one line whether to resume/refine or start fresh.

### Dynamic Moves
The journey is free — adapt to the idea:
- **Reframe:** When the idea is ambiguous, propose 2–3 sharp alternative framings and let the human pick.
- **Scope-cut:** Propose what to drop to reach prototype size. The limits (max 3 goals, max 3 core flows) are the doability mechanism.
- **Doability challenge:** Push back when a flow cannot be demoed in a prototype.
- **Zero-question mode:** If the user provides a detailed dump, go straight to a draft. Every unconfirmed detail becomes an `ASSUMPTION:` line.
- **Native tools:** Read local files, inspect existing repos, search web, or consult project context mid-dialogue.

### Explicit Doability Duty
Before drafting, resolve:
1. Which `i2p` template fits (`web | api | cli | worker | library | none`) and why.
2. The smallest demoable slice (`## Core flows`, 1–3 items).
3. The riskiest assumptions (`RISK:` / `ASSUMPTION:` lines).

Flows that cannot be demoed belong in `## Out of scope`. If the idea is not software-prototype doable, say so honestly and offer to reshape or output `template: none` (brief-only mode).

### Fallback Rhythm (for vague ideas)
1. Accept raw input without judgment.
2. Infer every field already implied.
3. Ask adaptively, **one question at a time**, multiple-choice when possible (expect 3–5, hard cap 8; stop early when remaining unknowns can be recorded as low-risk `ASSUMPTION:` lines).
   - **Interactive Modal Guidance:** When running in an agent environment equipped with `ask_question`, use it to render interactive multiple-choice options (prefixing the best prototype path with `(Recommended)`). This minimizes typing overhead for the user.
4. If the dump is secretly two projects, split them and brief one first.

### Dump De-noiser Protocol (`/b2i-dump`)
When the user triggers `/b2i-dump` or pastes an unformatted voice memo, audio transcript, or rambling brainstorming stream:
1. **De-noise aggressively:** Strip conversational fluff, meta-comments, and tangential tangents.
2. **Extract the Core Hook:** Identify the single user problem and the minimal viable solution.
3. **Quarantine Scope Creep:** Immediately move multi-tenancy, payments, auth, mobile apps, or complex infrastructure to `## Out of scope`.
4. **Draft Immediately (Zero-Question Mode):** Do not grill the user with questions if the transcript contains enough signal. Produce a complete `b2i-brief@1` draft immediately, using `ASSUMPTION:` tags for inferred choices.
5. **Score Check:** Verify that `b2i score` would rate it ≥ B (≥ 70/100) before presenting.

### Idea Discovery & Spark Protocol (`/b2i-spark`)
When the user has no idea, asks what to build, or seeks inspiration ("I don't know what to build", "Give me an idea for a CLI tool"):
1. **Calibrate Preference:** If underspecified, use `ask_question` to determine their interest area (`devtools`, `productivity`, `local-ai`, `automation`, `cli`, `web`) and desired form factor.
2. **Match Curated Archetypes:** Query `b2i spark <category>` (or search the 24 built-in archetypes) and present 2–3 sharp prototype seeds.
3. **Seed & Review:** When the user picks a concept, output or seed the brief via `b2i spark --seed <id> --output ./brief.md`, verify with `b2i check` and `b2i score`, and present for approval.
4. **Handoff:** Chain directly into `b2i handoff <dir>`.

### Export Protocol (`/b2i-export`)
When the user wants to hand off the brief to an external AI agent, project board, or product documentation:
1. **Agent Kickoff Prompt (`--format prompt`):** Generates a ready-to-paste instruction prompt for Claude Code, Cursor, Copilot, ChatGPT, or Antigravity with strict scope guards.
2. **GitHub Task Checklist (`--format issues`):** Generates Phase 1 (Scaffolding), Phase 2 (Core Flows), and Phase 3 (Scope Guard & Acceptance Criteria) Markdown checkboxes.
3. **One-Page PRD (`--format prd`):** Generates a formatted PRD with problem statement, non-goals, and template architecture constraints.
4. **Machine-Readable JSON (`--format json`):** Emits structured JSON with parsed sections and 0–100 doability scoring.

### Fixed Tail & Skill Chaining
1. Present the draft brief in chat for human approval.
2. Once approved, write `./brief.md` and immediately execute `b2i check` and `b2i score`.
3. If check fails, fix the named field, re-run, and output the verdict only.
4. If score flags unmitigated rabbit holes (e.g. auth, billing, multi-tenancy in core flows), surface a 1-line advisory note suggesting to move them to `## Out of scope`.
5. Ask if the user wants to hand off:
   - `b2i handoff <dir>` (scaffolds via `idea2prototype`, full Node/TS/web/cli/worker stack)
   - `b2i handoff <dir> --target raw` (scaffolds standalone `PROTOTYPE.md` with zero dependencies for Python, Go, Rust, or custom workflows)
6. Once handoff succeeds, immediately read `<dir>/AGENTS.md` (or `<dir>/CLAUDE.md` / `<dir>/PROTOTYPE.md`) so the user can continue straight into the build loop without repeating context.

---

## The Brief Contract (`b2i-brief@1`)

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
- RISK: ...
- ASSUMPTION: inferred by the agent, not confirmed by human — strike or keep

## Notes
- Free-form: constraints, preferences, data sources (optional, ≤6 bullets)
```

## Token Discipline
- Edits are diff-sized; never re-print the full brief on minor tweaks.
- Report verdicts, not raw logs.
- Scaffolding via `b2i handoff` costs zero LLM output tokens.
