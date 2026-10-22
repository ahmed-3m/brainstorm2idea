# b2i stress test and A/B efficacy eval — 2026-10-22

Scope: `@ahmed-3m/brainstorm2idea` v0.4.2 (published, `main` @ `dbe66ae`), on the way to marketplace listings.
Fixes are on branch `claude/brave-margulis-f15ffd`. Nothing was published or released.

- **Part 1:** stress test of every install path, every command under hostile input, and the agent flow.
- **Part 2:** a pre-registered A/B — the same agent building 8 ideas with and without b2i. Spec: [2026-10-22-ab-efficacy-spec.md](2026-10-22-ab-efficacy-spec.md), committed before any run.

## TL;DR

1. **v0.4.2 is broken for most CLI users on Linux and macOS.** Through npx or a global install, every command prints nothing and exits 0. That includes `b2i check` on garbage, which makes it a silently passing lint gate in CI. Fixed on this branch. **This needs a 0.4.3 release before any marketplace listing**, because the README's npx quickstart is the broken path.
2. 15 more real bugs were found and fixed, each with a regression test that fails on v0.4.2. One causes data loss: `handoff --target raw` deletes the brief after writing an empty spec.
3. The Claude Code plugin cannot be installed from a marketplace yet. There is no `.claude-plugin/plugin.json`, and `agents/` holds host instruction files that Claude Code would load as subagents.
4. A/B verdict: see [Part 2](#part-2--ab-efficacy-eval).

---

## Part 1 — Stress test

### How it was tested

| Track | What ran |
|---|---|
| Install paths | `npm pack` → global install and `npx --package <tgz> b2i` in WSL Ubuntu 24.04 (Node 22.22). Published `@latest` via npx on Linux and Windows. Engine run directly as SKILL.md documents. The skill loaded by OpenCode from `.opencode/skills/` (the A/B setup). `claude plugin validate .` |
| Fuzz sweep | Delegated to `zai/glm-5.3 --variant max` via opencode (the user's choice). It wrote a 245-case harness (`fuzz.mjs`) over 9 groups: inputs, output paths, `--fix`, handoff, misc commands, concurrency, exit/JSON discipline, performance, install. I re-ran the harness myself on v0.4.2 and on every fix commit. Cost: $1.84. The session hit Z.AI's 5-hour quota before writing its summary, so the triage below is mine, from its raw `findings-*.json`. |
| Runtimes | Windows 11 with Node 24.12 and Node 18.17.0. WSL with Node 22.22. |
| Manual | Path traversal, read-only files and directories, symlinks, BOM+CRLF, RTL and emoji, 20 MB input, 50k headings, concurrent writers. |

The fuzz counts are cases with anomalies. Each run is the GLM harness, unchanged:

| Code | Node 24 Win | Node 18.17 Win (core) | Node 22 WSL (core) | WSL install check |
|---|---|---|---|---|
| v0.4.2 (`dbe66ae`) | 36 / 247 | 17 / 93 | 18 / 93 | 4 / 7 |
| this branch (`e75da49`) | **8 / 245** | — | — | 0 (bin fixed) |

All 8 remaining anomalies are harness expectations that the fixes changed on purpose:

- `--output <dir>` now writes `<dir>/brief.md`, as the help text says (6 cases).
- Raw handoff refuses to overwrite an existing `PROTOTYPE.md` (1 case).
- The brief is consumed after a *successful* handoff, which is the documented contract (1 case).

I checked each of these by hand.

**Performance was fine throughout.** 20 MB `check` took 147 ms, 50k headings 156 ms, 100k bullets 129 ms, and a 200 KB filler-word dump 83 ms. Time scaled linearly, with no ReDoS. Concurrent writers produced no torn files.

### Fixed (each with a regression test that fails on v0.4.2)

| # | Severity | Bug | Fix |
|---|---|---|---|
| 1 | **Critical** | **The npm-linked bin is a silent no-op on POSIX.** npm links `node_modules/.bin/b2i` as a bare symlink, and `process.argv[1]` is not realpath'd. So the engine's `argv[1].endsWith('b2i.mjs')` guard never fires, and nothing runs. `npx @ahmed-3m/brainstorm2idea --version` prints nothing and exits 0. `check garbage.md` exits 0. Reproduced on published 0.4.2 and a packed tarball in WSL. | `bin/b2i.mjs` imports and calls `main()`. The engine's guard compares `realpathSync` of both paths. A new CI step runs `node_modules/.bin/b2i`. |
| 2 | **High (data loss)** | `handoff --target raw` looked up `sections['Goal']` and similar keys case-sensitively, but `check` accepts `## goal`. It wrote a `PROTOTYPE.md` with empty sections, then deleted `brief.md`. | Case-insensitive section lookup. |
| 3 | High | Raw handoff silently overwrote an existing `PROTOTYPE.md`, then deleted the brief. | It refuses with exit 1 and keeps both files. |
| 4 | Medium | An unknown `--target` (for example the typo `rwa`) was silently treated as `i2p`, which hits the network and scaffolds. | Rejected: `unknown --target "rwa" (must be i2p or raw)`. |
| 5 | Medium | i2p merge used `String.replace` with string replacements, so `$&`, `` $` ``, `$'` and `$$` in a brief were expanded inside `PROTOTYPE.md`. | Function replacers. |
| 6 | Medium | Any filesystem error printed a Node stack trace: a directory passed as the brief (EISDIR), a missing `--output` parent (ENOENT), or `check --fix` on a read-only brief (EPERM). In a `bash` pipe the exit code was lost. | `main()` catches and prints a one-line `FAIL` (or `{ok:false,error}` under `--json`), then exits 1. |
| 7 | Medium | `spark --seed x --output .` crashed (EISDIR), although the help text says a directory works. | An existing directory resolves to `<dir>/brief.md` for spark, dump and init. |
| 8 | Medium | `score` called OAuth in Core flows "Mitigated" when "SAML SSO" was in Out of scope. A brief that builds Stripe checkout and Google sign-in scored 100/100. | A pattern found in the active scope (name, goal, flows) is always "detected". |
| 9 | Medium | A `## Goal` inside a fenced code block was parsed as the Goal section. A brief with an empty real Goal passed `check`. | `parseSections` skips fenced blocks. |
| 10 | Low | `score --json` exited 0 on an invalid brief, while plain `score` exited 1. | Exits 1. |
| 11 | Low | `export` dropped `+` bullets (which `check` accepts). It also matched `2. ` mid-sentence as a list item. | Anchored bullet regex: `- * +` and `1.` / `1)`. |
| 12 | Low | `distilled: "Say "hi" now"` read back as `Say ` and `check` passed. `--fix` never ran, because it only fixes failing briefs. | The closing quote is the last one. |
| 13 | Low | `distilled` length counted UTF-16 units, so 101 emoji failed the 200-char limit. `dump` and `init` could also cut a surrogate pair in half. | Counts and truncates by code point. |
| 14 | Low (Windows) | When `npx-cli.js` isn't next to `node`, handoff's fallback spawned `npx.cmd` with `shell:true` and unquoted arguments, so `&` or `|` in a path were interpreted by `cmd.exe`. | `quoteCmdArg` on that path only: it caret-escapes every cmd metacharacter (including `%`) and doubles trailing backslashes. A test spawns a real `.cmd` shim. The first version, which only quoted, still expanded `%VAR%` (an injection) and let a trailing `\` swallow later flags. Grok's review of this PR caught that. |
| 15 | Medium (plugin) | `commands/b2i-export.md` frontmatter is invalid YAML (`argument-hint: [--format prompt\|issues\|prd\|json]`). `claude plugin validate` reports an error, and Claude Code loads `/b2i-export` with its description and hint dropped. | Quoted. A consistency guard rejects unquoted `[` or `{` values. |
| 16 | Low (agent flow) | The commands mixed repo-relative `node bin/b2i.mjs` (wrong for plugin installs) with bare `b2i` (not on PATH for skill installs). `/b2i-dump` asked for a score ≥ 80 while the skill says ≥ 70. `/b2i-spark` hard-coded "Doability rating: 100/100". `ask_question` is one host's tool name. | The commands use `b2i` throughout. SKILL.md defines it as shorthand for the bundled `node "<skill-base>/scripts/brainstorm2idea.mjs"`. The other text was aligned. |

Tests: `npm test` gives 137 tests. On Windows with Node 24 and Node 18.17, 136 pass and 1 is skipped: the symlink test, because Windows needs privileges to create symlinks. On WSL with Node 22, all 137 pass.

### Open (not fixed, by judgment)

| Finding | Why left |
|---|---|
| `spark --seed` and `dump --output <file>` silently overwrite an existing `brief.md`, while `init` refuses. | Real inconsistency, but changing it changes documented agent flows ("seed the brief"). Proposal: refuse unless `--force`, as `init` does. |
| Frontmatter must start at byte 0 (after an optional BOM). With a leading blank line, `check` reports "missing schema/template/distilled" although all three are present, and `--fix` repairs nothing. | Rare, but the message misleads. Proposal: have `--fix` strip leading blank lines, or have `check` say "frontmatter must start on line 1". |
| Duplicate `## Goal` sections: the last one wins without a warning (an empty second `## Goal` fails a valid brief). | Proposal: a `check` error naming the duplicate. |
| `score`'s library-template mismatch check uses case-sensitive `sections['Public API']`. | Advisory score only. Same one-line fix as #2. |
| `handoff --i2p <path-to-a-.cmd>` on Windows does not run. It spawns without a shell, and Node refuses `.cmd` files that way (`EINVAL`). | Point `--i2p` at the `.mjs`/`.js` entry, which works. Proposal: route a `.cmd` path through the same escaped shell path as the npx fallback (#14). |
| Path traversal in `--output` and `handoff <dir>` (`../../x`). | Intended: the tool writes where the user points it. Agents should pass paths the user named. |

### Agent-flow notes (SKILL.md and commands)

- The flow is coherent: dialogue → approval gate → write → `check` → `score` → handoff. Arm A in the A/B (below) shows how an unattended agent actually runs it.
- **Token burn:** SKILL.md is 9.1 KB (~2.3k tokens), and `/b2i` expands to ~220 more. That's acceptable, and verdicts are compact as promised (≤ 3 notes).
- **Ambiguity fixed (#16):** which `b2i` to run. **Still open:** `agents/AGENTS.md` and `agents/CLAUDE.md` recommend `npx @ahmed-3m/brainstorm2idea check`. That is correct only once a fixed version is published.

---

## Part 2 — A/B efficacy eval

> **Pending.** The first pass hit Z.AI's 5-hour usage cap partway through: 3 of 16 cells finished, and the other 13 plus every grader got HTTP 429. Those cells are being re-run from clean workspaces (the driver now waits for the quota reset instead of recording a failure). Results and the verdict will be added to this PR in a follow-up commit.

<!-- AB-RESULTS -->

---

## Marketplace-readiness checklist

✅ ready · ⚠️ works with a caveat · ❌ blocker

### npm — `@ahmed-3m/brainstorm2idea` (published 0.4.2)

- ❌ **0.4.2's bin is broken on Linux and macOS (Part 1, #1).** Needs a 0.4.3 release from this branch. That's your call: I did not bump the version or publish.
- ✅ `files` ships bin, skill, scripts, commands, agents, README and LICENSE. CI's package-smoke job now runs the npm-linked bin, so this class of bug fails CI.
- ✅ `engines.node >= 18.17` is honoured: the full suite passes on 18.17.0. Zero dependencies. Provenance is on in the publish job.
- ⚠️ `.zcode-plugin/` is not in `files`, so ZCode can't load the plugin from the npm tarball. That's fine if ZCode installs from git.

### Claude Code plugin marketplace

- ❌ **No `.claude-plugin/plugin.json`.** `claude plugin validate .` treats the repo as a loose components directory, not a plugin. Proposed manifest (not added, because it creates a public surface you should name):
  ```json
  { "name": "brainstorm2idea", "version": "0.4.3", "description": "…", "author": { "name": "ahmed-3m" },
    "commands": "./commands", "skills": "./skills" }
  ```
  For `claude plugin marketplace add ahmed-3m/brainstorm2idea` to work, add `.claude-plugin/marketplace.json` too, with one entry whose `source` is `./`. Then extend the consistency test that pins `.zcode-plugin` to also pin both versions.
- ❌ **`agents/AGENTS.md` and `agents/CLAUDE.md` are in the plugin's default `agents/` directory.** Claude Code loads that directory as subagents, and the validator warns "No frontmatter block found". Users would get two junk agents named AGENTS and CLAUDE. Move them (for example to `hosts/`), and update `package.json` `files` and any docs that link them.
- ✅ After this branch's fix, all four commands' frontmatter parses (it was an error for `/b2i-export`).
- ✅ The skill frontmatter is valid (`name` matches its directory, description < 1024 chars).
- ⚠️ Not verified: a live install through `/plugin install`. That needs the manifest above and a pushed marketplace.

### ZCode — `.zcode-plugin/plugin.json`

- ✅ `version` 0.4.2 matches the engine and `package.json` (guarded by the consistency suite). `skills: ./skills` and `commands: ./commands` resolve.
- ⚠️ Not validated against ZCode's schema: no validator or host was available here.

### Agent-skill directories (SKILL.md standard: Claude Code `~/.claude/skills`, OpenCode, Antigravity, Codex-style hosts)

- ✅ OpenCode discovers and loads the skill from `.opencode/skills/brainstorm2idea/` (verified in the A/B setup, with all other skills denied). The bundled engine runs from `<skill-base>/scripts/`.
- ✅ The engine runs directly (`node <skill-base>/scripts/brainstorm2idea.mjs`), with no npm and no PATH needed. That path was never broken.
- ⚠️ The skill copied alone (without `commands/`) has no `/b2i` slash command. That's expected and documented ("load the skill").
- ⚠️ Antigravity is claimed in the README but was not exercised here.

### Before any listing (in order)

1. Merge this branch and release 0.4.3 (npm and the ZCode version).
2. Move `agents/*.md` out of `agents/` and add `.claude-plugin/plugin.json` and `marketplace.json`.
3. Decide the open items above, especially whether `spark` and `dump` should overwrite an existing brief.
4. Act on the Part 2 proposals.
