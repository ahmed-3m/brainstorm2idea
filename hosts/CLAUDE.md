# Claude Code Guide — brainstorm2idea

When brainstorming a new project, feature, or prototype:
1. Use the `/b2i` command or load the `brainstorm2idea` skill.
2. Ask 3–5 adaptive questions; do not exceed 8.
3. Formulate the draft brief following `b2i-brief@1` schema. Name the 2–3 nearest existing tools in `## Alternatives` (`- <Name>: <what it does>. Differs by: <how this differs>`). When scope merges, deploys, holds credentials, runs code, or involves an agent, webhook, CI or payment, add `TRUST:` lines in `## Risks & assumptions` (who acts with which credential on what untrusted input); never scope out a safety control such as sandboxing.
4. Get human approval in chat before writing `brief.md`.
5. Run `b2i check` via the bundled script or `npx @ahmed-3m/brainstorm2idea check`.
6. Run `b2i handoff <dir>` to scaffold via `idea2prototype`.
