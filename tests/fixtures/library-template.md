---
schema: b2i-brief@1
template: library
distilled: Zero-dependency markdown section parser and AST extractor
---
# MD Section Parser

## Goal
- Parse markdown sections reliably

## Core flows
1. parseSections(markdownText)
2. replaceSection(markdownText, sectionName, newContent)

## Out of scope
- Full CommonMark HTML rendering
