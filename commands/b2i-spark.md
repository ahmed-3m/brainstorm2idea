---
description: Discover and seed high-leverage prototype ideas when you don't know what to build (Brainstorm2Idea)
argument-hint: "[optional category: devtools, productivity, local-ai, automation, cli, web]"
---

Discover, calibrate, and seed prototype ideas using the `brainstorm2idea` skill and spark catalog.

0. Check if the user specified a domain or interest in "$ARGUMENTS".
1. If the user has a general itch or is completely blank, ask (with your host's multiple-choice question tool if it has one, else numbered options):
   - **Target Area:** Developer Tools (Recommended) | Local Productivity | AI & Prompting | Automation & Files | Web Dashboards
   - **Preferred Form Factor:** CLI Tool (Recommended) | Local Web App | Micro API | Background Worker | Pure Library
2. Query the spark catalog (`b2i spark <category> --json`) and present 3 sharp prototype archetypes:
   - Name & 1-sentence essence
   - Core flows (1–3 numbered flows)
   - Quarantined non-goals (Out of scope)
   - Doability rating from `b2i score` (catalog archetypes are calibrated to score A)
3. Once the user selects an archetype (or asks to remix one):
   - Seed the brief: `b2i spark --seed <id> --output ./brief.md` (or draft the remixed brief). It refuses to overwrite an existing `brief.md`; ask the user before re-running with `--force`.
   - Present the drafted `brief.md` for explicit human approval.
4. On approval, verify with `b2i check` and `b2i score`, and offer immediate scaffolding:
   - `b2i handoff <dir>` (for Node/TS scaffolds via `idea2prototype`)
   - `b2i handoff <dir> --target raw` (for standalone zero-dep scaffold in Python, Go, Rust, or custom stacks)
