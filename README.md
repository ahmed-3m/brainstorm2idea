# brainstorm2idea (`b2i`)

> Turn fuzzy ideas into machine-linted prototype briefs through a token-budgeted dialogue, then hand off deterministically to [idea2prototype](https://github.com/ahmed-3m/idea2prototype). Zero dependencies.

```text
fuzzy idea (chat dump, notes, voice transcript)
   │  /b2i dialogue — adaptive questions (3–5 expected, hard cap 8)
   ▼
brief.md (schema b2i-brief@1)
   │  b2i check — compact verdict (PASS 7/7, ≤3 failure notes)
   │  b2i handoff — pre-flight check + i2p new + merge brief into PROTOTYPE.md
   ▼
idea2prototype (scaffold + verified add / check / map loop)
```

## Why

Tools like GSD, Spec Kit, and Task Master assume an idea arrives already articulated. Heavyweight frameworks end at documents without runnable prototypes. 

`brainstorm2idea` owns the exact seam where a fuzzy idea becomes a crisp, doable prototype specification and hands it off directly into deterministic scaffolding.

## Quickstart

### 1. In any coding agent (Antigravity, Claude Code, ZCode)

Run `/b2i <your raw idea>` or load the `brainstorm2idea` skill:

```bash
/b2i "A recipe box app that lets cooks save recipes with tags and search them offline"
```

The agent asks 3–5 adaptive questions, drafts the brief, requests your approval, writes `brief.md`, checks it, and hands off to `idea2prototype`.

### 2. Standalone CLI

```bash
# Check a brief
npx @ahmed-3m/brainstorm2idea check

# Handoff to idea2prototype (creates directory and merges brief into PROTOTYPE.md)
npx @ahmed-3m/brainstorm2idea handoff my-app

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

## Risks & assumptions
- ASSUMPTION: browser local storage or IndexedDB is sufficient for offline data

## Notes
- Keep UI minimal and keyboard-friendly
```

## The 7 Checks

1. `schema`: must equal `b2i-brief@1`
2. `name`: first H1 present and non-empty
3. `template`: one of `web | api | cli | worker | library | none`
4. `goal`: 1–3 non-empty bullets
5. `flows`: 1–3 numbered items (`1.`, `2.`, `3.`)
6. `out-of-scope`: ≥ 1 non-empty bullet
7. `distilled`: non-empty, ≤ 200 chars

## License

MIT © The Brainstorm2Idea Authors
