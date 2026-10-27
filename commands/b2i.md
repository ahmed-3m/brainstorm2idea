---
description: Brainstorm a fuzzy idea into a linted prototype brief (Brainstorm2Idea)
argument-hint: <fuzzy idea or notes dump>
---

Turn the fuzzy idea "$ARGUMENTS" into a machine-linted prototype brief (`b2i-brief@1`) using the `brainstorm2idea` skill, then hand off to `idea2prototype`.

0. Check if `brief.md` already exists in the current directory; if so, ask whether to resume or start fresh.
1. Load the `brainstorm2idea` skill and run the adaptive dialogue (3–5 questions expected, hard cap 8) to resolve prior art (the 2–3 nearest existing tools, recorded in `## Alternatives` with `Differs by:`; web search when available, no extra question), template fit (a physical or offline idea defaults to `template: none`), one product (split a two-product idea and brief one), the smallest demoable slice (1–3 core flows), riskiest assumptions, and, when scope merges, deploys, holds credentials or runs code, the trust boundaries (`TRUST:` lines; at most 1 question).
2. Present the drafted brief in chat for explicit human approval.
3. Write `brief.md` only after approval and verify immediately: `b2i check`.
4. Run `b2i handoff ./<slug>` (a fresh subdirectory, never `.`) to scaffold via `idea2prototype` and merge the brief into `PROTOTYPE.md`.
