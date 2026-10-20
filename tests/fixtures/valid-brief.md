---
schema: b2i-brief@1
template: web
distilled: Recipe box that lets cooks save recipes with tags and search them offline
---
# Recipe Box

## Goal
- Save recipes with tags
- Search and filter recipes offline

## Core flows
1. Save recipe: user submits title, ingredients, and tags
2. Search recipes: user filters recipes by tag or ingredient offline

## Out of scope
- Cloud synchronization or user authentication

## Risks & assumptions
- ASSUMPTION: browser local storage or IndexedDB is sufficient for offline data

## Notes
- Keep UI minimal and keyboard-friendly
