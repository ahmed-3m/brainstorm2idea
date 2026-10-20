---
description: Export a prototype brief into an Agent Kickoff Prompt, GitHub Task Checklist, or One-page PRD (Brainstorm2Idea)
argument-hint: [--format prompt|issues|prd|json] [--output <path>]
---

Export the approved prototype brief (`b2i-brief@1`) into downstream development artifacts.

0. Check if `brief.md` exists in the current directory (or prompt the user for brief location).
1. Validate the brief using `b2i check`. If invalid, report the issues before exporting.
2. If no format argument is specified in "$ARGUMENTS", ask the user which export artifact they need:
   - **Agent Kickoff Prompt (Recommended):** Tailored system prompt ready to paste into Claude, Cursor, Copilot, ChatGPT, or Antigravity to build Flow 1.
   - **GitHub Task Checklist:** Structured Markdown issue checklist with Phase 1 (Scaffolding), Phase 2 (Core Flows), and Phase 3 (Scope Guard & Acceptance Criteria).
   - **One-Page PRD:** Formal Product Requirements Document with Executive Summary, Non-Goals, and Technical Architecture.
   - **Raw JSON:** Machine-readable payload with parsed fields and 0–100 doability score.
3. Execute the export command:
   ```bash
   node bin/b2i.mjs export brief.md --format <prompt|issues|prd|json>
   ```
4. If the user specifies `--output <file>`, save to that file; otherwise output the formatted Markdown in chat so the user can copy it immediately.
