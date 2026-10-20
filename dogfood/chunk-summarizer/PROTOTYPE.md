# Prototype spec — chunk-summarizer

> Idea: Token-budgeted text chunker and outline builder for large markdown documents

## Goal
- Split large markdown documents into semantic chunks preserving heading boundaries
- Generate hierarchical table-of-contents outline with token counts per section

## Public API
1. parseOutline(markdown: string): DocumentOutline
2. chunkByBudget(markdown: string, maxTokens: number): MarkdownChunk[]

## Out of scope
- Direct LLM API calls or vector embeddings
- PDF/DOCX binary document parsing

## Risks & assumptions
- ASSUMPTION: Rough 4 characters per token estimate suffices for chunking boundaries

## Notes
- Zero dependencies; standard Node.js library for agent context management
