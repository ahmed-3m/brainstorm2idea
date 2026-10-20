# Agent Kickoff Prompt: chunk-summarizer

You are an expert full-stack developer and prototyping specialist. Your task is to build a minimal, working prototype for **chunk-summarizer**.

## Prototype Brief
- **Idea**: Token-budgeted text chunker and outline builder for large markdown documents
- **Template Archetype**: `library`

## Primary Goals
- Split large markdown documents into semantic chunks preserving heading boundaries
- Generate hierarchical table-of-contents outline with token counts per section

## Core User Flows / Implementation Scope
1. parseOutline(markdown: string): DocumentOutline
2. chunkByBudget(markdown: string, maxTokens: number): MarkdownChunk[]

## Strict Non-Goals (Out of Scope — DO NOT IMPLEMENT)
- ❌ Direct LLM API calls or vector embeddings
- ❌ PDF/DOCX binary document parsing

## Key Assumptions & Risks
- ⚠️ ASSUMPTION: Rough 4 characters per token estimate suffices for chunking boundaries

## Development Notes
- ℹ️ Zero dependencies; standard Node.js library for agent context management

## Implementation Instructions for AI Agent
1. **Template & Setup**: Use the standard minimal `library` architecture with zero external runtime dependencies where possible.
2. **Iterative Build**: Implement Flow 1 first end-to-end and test it before moving to Flow 2.
3. **Hard Scope Discipline**: Under no circumstances build features listed in Non-Goals. Stub any external integrations with mock data.
4. **Verification**: Verify that all core flows function with tests or a local runnable demo.
