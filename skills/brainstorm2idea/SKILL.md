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

- `check [brief] [--json]` — run 7 hard lint checks on `brief.md` (compact verdict, max 3 failure notes)
- `handoff <dir> [--brief <path>] [--i2p <version|path>] [--dry-run] [--json]` — pre-flight check + `i2p new <dir>` + merge brief into `<dir>/PROTOTYPE.md` (brief moved)
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
4. If the dump is secretly two projects, split them and brief one first.

### Fixed Tail & Skill Chaining
1. Present the draft brief in chat for human approval.
2. Once approved, write `./brief.md` and immediately execute `b2i check`.
3. If check fails, fix the named field, re-run, and output the verdict only.
4. Ask if the user wants to hand off: `b2i handoff <dir>`.
5. Once handoff succeeds, immediately read `<dir>/AGENTS.md` (or `<dir>/CLAUDE.md`) so the user can continue straight into the `idea2prototype` build loop without repeating context.

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
