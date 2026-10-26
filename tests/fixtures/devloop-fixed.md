---
schema: b2i-brief@1
template: cli
distilled: CLI loop that takes labeled GitHub issues, has an LLM rewrite code via raw API, runs tests, retries, and auto-merges the PR when green
---
# DevLoop

## Goal
- Turn a labeled GitHub issue into a merged, test-passing change with no human in the loop
- Stop safely and explain why on the issue when tests cannot be made green

## Core flows
1. Pick task: `devloop run --repo owner/name` fetches the oldest open issue labeled `auto` via the `gh` CLI
2. Implement and verify: the LLM picks up to 5 relevant files and returns whole-file rewrites; the loop applies them on a branch, runs the test command, and retries with the failure output up to 3 times
3. Ship or give up: on green, open a PR and auto-merge it; on failure, comment the last test output on the issue and relabel it `auto-failed`

## Out of scope
- Bug hunting, test-gap filling, and an orchestrator choosing between loops (later loops)
- Agent CLIs such as Claude Code, Codex, or Grok (raw API only)
- GitHub App, OAuth, or webhooks (polling through the local `gh` login)
- Diff/patch merging, multi-repo runs, parallel tasks, and a web dashboard

## Risks & assumptions
- RISK: auto-merge ships broken code when the test suite is weak; run only on a demo repo with required CI checks and a 300-line diff cap
- RISK: raw-API file selection can miss context, and whole-file rewrites of large files may truncate
- RISK: the loop runs repo tests locally, so point it only at repos you trust
- TRUST: the loop merges with a fine-grained token scoped to the demo repo; the LLM never sees it, and branch protection requires CI to pass on the exact head SHA that gets merged
- TRUST: issue text and LLM output are untrusted; tests run in a throwaway container with no network and no credentials, and the loop never reads its own config from the PR branch
- ASSUMPTION: Anthropic Messages API via plain fetch, model claude-sonnet-5-5, key from ANTHROPIC_API_KEY
- ASSUMPTION: Node CLI with a per-repo test command (default `npm test`), one task at a time

## Notes
- Demo target: a small sample repo seeded with 3 labeled issues
- Log every attempt (prompt, files touched, test output) to `.devloop/runs/`
- Cap spend per issue at 3 attempts and a fixed token budget

## Alternatives
- GitHub Copilot coding agent: turns an assigned issue into a PR inside GitHub Actions. Differs by: a local CLI on raw API calls that merges on green instead of waiting for review
- OpenHands: open-source agent that edits code and runs commands in a sandbox. Differs by: no agent runtime, one fixed issue-to-merge loop with a hard attempt cap
