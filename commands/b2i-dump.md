---
description: De-noise raw brain dumps or transcripts into a prototype brief (Brainstorm2Idea)
argument-hint: <messy voice transcript, notes, or chat dump>
---

Turn the unformed or conversational dump "$ARGUMENTS" into a machine-linted prototype brief (`b2i-brief@1`) using the `brainstorm2idea` skill.

0. Check if `brief.md` already exists; ask to resume or replace.
1. Run the **Dump De-noiser Pass**:
   - Strip conversational filler, logistics, and secondary tangents.
   - Extract the 1-sentence essence into `distilled` (≤ 200 chars).
   - Isolate the smallest demoable slice into 1–3 Core flows.
   - Convert all non-demoable features into `## Out of scope`.
   - Surface implicit assumptions into `ASSUMPTION:` lines.
2. Run `b2i score` in-memory to verify high doability (≥ 80/100).
3. Present the draft brief for explicit human approval.
4. On approval, write `brief.md`, verify with `b2i check`, and offer handoff (`b2i handoff <dir> [--target i2p|raw]`).
