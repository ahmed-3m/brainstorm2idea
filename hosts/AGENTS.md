# AGENTS.md — use brainstorm2idea in this project

Copy this file into any project where your coding agent should brainstorm ideas into prototype briefs with brainstorm2idea before building.

You have `brainstorm2idea` (`b2i`) available — a zero-dependency ideation-to-brief tool and the upstream pre-stage for `idea2prototype` (`i2p`). If the npm package is not installed globally or via npx, run the engine script directly:
`node <path-to-brainstorm2idea-repo>/skills/brainstorm2idea/scripts/brainstorm2idea.mjs <command>`

## Commands

- `npx @ahmed-3m/brainstorm2idea check [brief]` — verify `brief.md` against the 7 hard rules of `b2i-brief@1`
- `npx @ahmed-3m/brainstorm2idea handoff <dir> [--dry-run]` — lint brief, scaffold via `i2p new <dir>`, merge brief into `<dir>/PROTOTYPE.md`, and clean up `brief.md`
- `npx @ahmed-3m/brainstorm2idea list` — print schema version (`b2i-brief@1`) and supported templates

## Workflow

1. Start with fuzzy input. Ask 3–5 adaptive questions to identify the template (`web|api|cli|worker|library|none`), 1–3 core flows, and out-of-scope non-goals.
2. Inferred details become `ASSUMPTION:` bullets in `## Risks & assumptions`. Name the 2–3 nearest existing tools in `## Alternatives` (`- <Name>: <what it does>. Differs by: <how this differs>`); if nothing differs, say so and reframe. When scope merges, deploys, holds credentials, runs code, or involves an agent, webhook, CI or payment, add `TRUST:` lines saying who acts with which credential on what untrusted input; never scope out a safety control such as sandboxing.
3. Present draft brief for explicit human approval before touching disk.
4. On approval, write `brief.md` and run `npx @ahmed-3m/brainstorm2idea check`.
5. Run `npx @ahmed-3m/brainstorm2idea handoff <dir>` to scaffold directly into `idea2prototype`.
6. Read `<dir>/AGENTS.md` and immediately proceed to building Core Flow 1.
