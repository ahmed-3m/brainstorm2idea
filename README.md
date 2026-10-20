# brainstorm2idea (`b2i`)

> Turn fuzzy ideas into machine-linted prototype briefs through a token-budgeted dialogue, then hand off deterministically to [idea2prototype](https://github.com/ahmed-3m/idea2prototype) (or any custom stack). Zero dependencies.

```text
fuzzy idea (chat dump, notes, voice transcript)
   │  /b2i dialogue or /b2i-dump (adaptive questions, 3–5 expected)
   ▼
brief.md (schema b2i-brief@1)
   │  b2i check — compact verdict (PASS 7/7, ≤3 failure notes)
   │  b2i score — doability score (0–100, letter grade A–F, rabbit-hole quarantine)
   │  b2i handoff — pre-flight check + deterministic scaffolding (--target i2p | raw)
   ▼
idea2prototype or Standalone Workspace (PROTOTYPE.md + verified build loop)
```

## Why

Tools like GSD, Spec Kit, and Task Master assume an idea arrives already articulated. Heavyweight frameworks end at documents without runnable prototypes. `/grill-me` interviews plans but lacks scaffolding contracts or automated linting.

`brainstorm2idea` owns the exact seam where a fuzzy idea becomes a crisp, doable prototype specification and hands it off directly into deterministic scaffolding.

### Differentiation Matrix

| Dimension | `brainstorm2idea` (`b2i`) | `/grill-me` (Antigravity) | GitHub Spec Kit | BMAD-METHOD |
|---|---|---|---|---|
| **Primary Stage** | Fuzzy idea $\rightarrow$ Prototype Brief | Draft plan $\rightarrow$ Polished plan | Structured requirements $\rightarrow$ Code | Enterprise PRD $\rightarrow$ Epics |
| **Input Format** | Raw thought, chat dump, voice memo | Written plan or prompt | Formal spec template | Business problem brief |
| **Output Artifact** | Machine-linted `brief.md` (`b2i-brief@1`) | Conversational plan refinements | Spec markdown files | Multi-document PRD/architecture |
| **Automated Linting** | Hard 7-point validation (`b2i check`) | Manual agent review | PR checks / schema | Manual stakeholder review |
| **Doability & Scoping** | Algorithmic scoring (`b2i score`, 0–100) | Agent conversational challenge | Static template guidelines | Extensive persona reviews |
| **Downstream Handoff** | 1-step scaffold (`i2p` or `--target raw`) | None (leaves plan in chat) | Manual command scaffolding | Manual project creation |
| **Runtime Overhead** | **Zero npm dependencies** (Pure Node) | Native AI prompt command | Node / Python CLI tooling | 30-persona agent overhead |
| **Token Discipline** | Diff-sized edits, max 3 failure notes | Full conversational context | Full spec context | Very token-heavy |

## Quickstart

### 1. In any coding agent (Antigravity, Claude Code, ZCode)

Run `/b2i <your raw idea>` or load the `brainstorm2idea` skill:

```bash
/b2i "A recipe box app that lets cooks save recipes with tags and search them offline"
```

The agent asks 3–5 adaptive questions (rendering interactive choice modals via `ask_question`), drafts the brief, requests your approval, writes `brief.md`, checks and scores it, and hands off into your prototype workspace.

Have an unformatted voice transcript or messy brainstorm dump? Use the fast de-noiser:
```bash
/b2i-dump "<paste your voice transcript or rambling thoughts here>"
```

Don't have an idea yet or looking for high-leverage prototype inspiration? Discover ideas:
```bash
/b2i-spark "I want to build something in developer tools"
```

Export an approved brief into an AI agent prompt, GitHub checklist, or PRD:
```bash
/b2i-export --format prompt
```

### 2. Standalone CLI

```bash
# Discover ideas across 24 curated prototype archetypes (devtools, productivity, local-ai, automation, cli, web)
npx @ahmed-3m/brainstorm2idea spark
npx @ahmed-3m/brainstorm2idea spark devtools

# Seed a complete, 100/100-doability brief directly to disk
npx @ahmed-3m/brainstorm2idea spark --seed env-diff --output ./brief.md

# Check a brief (file or piped via stdin)
npx @ahmed-3m/brainstorm2idea check
cat brief.md | npx @ahmed-3m/brainstorm2idea check -

# Score doability & detect rabbit holes (0–100, letter grade A–F)
npx @ahmed-3m/brainstorm2idea score
cat brief.md | npx @ahmed-3m/brainstorm2idea score -

# Export brief to AI agent kickoff prompt (Claude, Cursor, Copilot, ChatGPT, Antigravity)
npx @ahmed-3m/brainstorm2idea export brief.md --format prompt

# Export brief to GitHub task checklist (Phase 1, 2, 3 checkboxes)
npx @ahmed-3m/brainstorm2idea export brief.md --format issues

# Export brief to one-page Product Requirements Document (PRD)
npx @ahmed-3m/brainstorm2idea export brief.md --format prd --output PRD.md

# Export brief as parsed JSON
npx @ahmed-3m/brainstorm2idea export brief.md --json

# Handoff to idea2prototype (creates directory and merges brief into PROTOTYPE.md)
npx @ahmed-3m/brainstorm2idea handoff my-app

# Handoff to standalone raw workspace (zero-dependency markdown brief for Python, Go, Rust, etc.)
npx @ahmed-3m/brainstorm2idea handoff my-app --target raw

# List schema and supported templates
npx @ahmed-3m/brainstorm2idea list
```

## The Brief Contract (`b2i-brief@1`)

A single `brief.md` file in your working directory:

```markdown
---
schema: b2i-brief@1
template: web            # web | api | cli | worker | library | none
distilled: Recipe box that lets cooks save recipes with tags and search them offline
---
# Recipe Box

## Goal
- Save recipes with tags
- Search and filter recipes offline

## Core flows
1. Save recipe: user submits title, ingredients, and tags
2. Search recipes: user filters recipes by tag or ingredient offline

## Out of scope
- Cloud synchronization or user authentication
- Paid subscription or payment processing

## Risks & assumptions
- ASSUMPTION: browser local storage or IndexedDB is sufficient for offline data

## Notes
- Keep UI minimal and keyboard-friendly
```

## The 7 Checks (`b2i check`)

1. `schema`: must equal `b2i-brief@1`
2. `name`: first H1 present and non-empty
3. `template`: one of `web | api | cli | worker | library | none`
4. `goal`: 1–3 non-empty bullets
5. `flows`: 1–3 numbered items (`1.`, `2.`, `3.`)
6. `out-of-scope`: ≥ 1 non-empty bullet
7. `distilled`: non-empty, ≤ 200 chars

## Doability & Rabbit-Hole Scoring (`b2i score`)

`b2i score` evaluates how safely a brief can be prototyped without getting stuck in high-risk engineering rabbit holes:
- **Scope Discipline (30 pts):** Rewards clear non-goals in `## Out of scope`.
- **Rabbit-Hole Immunity (40 pts):** Automatically detects high-risk patterns (`auth`, `payments`, `multi-tenant`, `crypto/blockchain`, `custom ML training`, `native apps`, `real-time video/audio`). If a pattern is in `## Out of scope`, it is safely mitigated; if left in `## Core flows`, it incurs an advisory deduction.
- **Template Fit & Feasibility (30 pts):** Verifies concise goals (1–2 bullets), flows (1–3 items), and presence of explicit `ASSUMPTION:` or `RISK:` tags.

Output:
```text
Brainstorm2idea score — 100/100 (Grade A - EXCELLENT)
```

## Idea Discovery & Spark Catalog (`b2i spark`)

For developers facing "blank-canvas paralysis" or looking for achievable weekend projects, `b2i spark` ships with **24 curated, high-voltage prototype archetypes** across 6 domains:

- **`devtools`**: `env-diff`, `git-staleness`, `api-stub-mock`, `md-link-checker`
- **`productivity`**: `focus-shelf`, `snippet-stash`, `meeting-actions`, `habit-strip`
- **`local-ai`**: `prompt-diff`, `chunk-summarizer`, `commit-drafter`, `agent-eval-harness`
- **`automation`**: `clean-downloads`, `webhook-logger`, `rss-digest`, `asset-optimizer`
- **`cli`**: `port-scout`, `json-slice`, `file-tally`, `scratch-pad`
- **`web`**: `health-board`, `recipe-shelf`, `decision-matrix`, `markdown-canvas`

Every archetype is guaranteed to:
1. Pass `b2i check` (7/7 validation rules).
2. Score **100/100 (Grade A - EXCELLENT)** with all risky rabbit holes proactively quarantined in `## Out of scope`.
3. Seed instantaneously into a local `brief.md` via `b2i spark --seed <id> --output ./brief.md`.

## Ideation Benchmarks

See [benchmarks/specs.md](file:///D:/side_hustle/opensources_gh/brainstorm2idea/benchmarks/specs.md) for 5 canonical test scenarios (Rambling Voice Memo, Frankenstein SaaS, Infra Rabbit Hole, Library Utility, Non-Software Idea) and evaluation rubrics.

## License

MIT © The Brainstorm2Idea Authors
