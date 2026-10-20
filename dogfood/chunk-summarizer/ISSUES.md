# [Prototype] chunk-summarizer: Token-budgeted text chunker and outline builder for large markdown documents

> **Template**: `library` | **Spec**: `b2i-brief@1`

## Overview
Token-budgeted text chunker and outline builder for large markdown documents

## Task Checklist

### Phase 1: Foundations & Scaffolding
- [ ] Initialize repository structure for `library` template
- [ ] Configure local build/run scripts and test runner
- [ ] Add basic smoke test ensuring harness runs cleanly

### Phase 2: Core User Flows
- [ ] parseOutline(markdown: string): DocumentOutline
- [ ] chunkByBudget(markdown: string, maxTokens: number): MarkdownChunk[]

### Phase 3: Scope Guard & Hardening
- [ ] Confirm excluded: Direct LLM API calls or vector embeddings
- [ ] Confirm excluded: PDF/DOCX binary document parsing
- [ ] End-to-end verification of all core flows
- [ ] Document quickstart in README

## Acceptance Criteria
- [ ] **Goal Met**: Split large markdown documents into semantic chunks preserving heading boundaries
- [ ] **Goal Met**: Generate hierarchical table-of-contents outline with token counts per section
- [ ] **Flow Verified**: parseOutline(markdown: string): DocumentOutline
- [ ] **Flow Verified**: chunkByBudget(markdown: string, maxTokens: number): MarkdownChunk[]
