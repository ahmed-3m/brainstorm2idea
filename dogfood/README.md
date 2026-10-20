# Brainstorm2Idea End-to-End Dogfooding

This directory contains real-world prototypes created from idea to working software using the exact `brainstorm2idea` (`b2i`) pipeline.

## Prototype 1: `chunk-summarizer`

- **Archetype ID**: `chunk-summarizer` (from `b2i spark local-ai`)
- **Template Archetype**: `library`
- **Distilled Concept**: Token-budgeted text chunker and outline builder for large markdown documents.
- **Doability Score**: `100/100 (Grade A - EXCELLENT)`

### How It Was Built
1. **Discovered & Seeded**:
   ```bash
   b2i spark --seed chunk-summarizer --output ./brief.md
   ```
2. **Linted & Scored**:
   ```bash
   b2i check ./brief.md   # PASS (7/7)
   b2i score ./brief.md   # 100/100 (Grade A)
   ```
3. **Exported**:
   ```bash
   b2i export ./brief.md --format prompt --output PROMPT.md
   b2i export ./brief.md --format issues --output ISSUES.md
   b2i export ./brief.md --format prd    --output PRD.md
   ```
4. **Scaffolded**:
   ```bash
   b2i handoff dogfood/chunk-summarizer --target raw
   ```
5. **Implemented & Verified**:
   - Implemented `parseOutline(markdown)` and `chunkByBudget(markdown, maxTokens)` in `src/index.mjs` with zero dependencies.
   - 11/11 automated unit tests in `test/index.test.mjs`.
   - Verified live with `node demo.mjs` on repository specs.
