# b2i stress test and A/B efficacy eval — 2026-10-22

Scope: `@ahmed-3m/brainstorm2idea` v0.4.2 (published, `main` @ `dbe66ae`), on the way to marketplace listings.
Fixes #1–#16 landed in PR #4 (merged as `24bc9e4`). #17–#23 are on branch `claude/fix-open-stress-findings`. Nothing was published or released.

- **Part 1:** stress test of every install path, every command under hostile input, and the agent flow.
- **Part 2:** a pre-registered A/B — the same agent building 8 ideas with and without b2i. Spec: [2026-10-22-ab-efficacy-spec.md](2026-10-22-ab-efficacy-spec.md), committed before any run.

## TL;DR

1. **v0.4.2 is broken for most CLI users on Linux and macOS.** Through npx or a global install, every command prints nothing and exits 0. That includes `b2i check` on garbage, which makes it a silently passing lint gate in CI. Fixed on this branch. **This needs a 0.4.3 release before any marketplace listing**, because the README's npx quickstart is the broken path.
2. 15 more real bugs were found and fixed, each with a regression test that fails on v0.4.2. One causes data loss: `handoff --target raw` deletes the brief after writing an empty spec.
3. The Claude Code plugin could not be installed from a marketplace. There was no `.claude-plugin/plugin.json`, and `agents/` held host instruction files that Claude Code would load as subagents. Fixed in the follow-up PR, together with the items that were still open when #4 merged (#17–#23). Only the path-traversal item stays open, because it is intended behaviour.
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

Tests: when #4 merged, `npm test` gave 138 tests. On Windows, 137 pass and 1 is skipped: the symlink test, because Windows needs privileges to create symlinks. After the follow-up PR there are 144 tests. On Windows with Node 24, 143 pass and 1 is skipped, with or without `FORCE_COLOR=1`.

### Fixed in the follow-up PR (were open when #4 merged)

Each has a regression test that fails on `24bc9e4`, the merge of #4.

| # | Finding | Fix |
|---|---|---|
| 17 | `spark --seed` and `dump --output <file>` silently overwrote an existing `brief.md`, while `init` refuses. | Both refuse, naming `--force`, which overwrites. `/b2i-spark` tells the agent to ask the user before passing `--force`. |
| 18 | Frontmatter must start on line 1. After a leading blank line, `check` reported "missing schema/template/distilled" although all three are present, and `--fix` repaired nothing. | `check` says "frontmatter must start on line 1". `--fix` removes the blank lines. |
| 19 | Duplicate `## Goal` sections: the last one won without a warning (an empty second `## Goal` failed a valid brief). | A duplicated Goal, Core flows / Public API or Out of scope is a `check` error naming it. Other duplicates are a warning. `parseSections` returns `duplicates`. |
| 20 | `score`'s library-template mismatch check used a case-sensitive `sections['Public API']`. | Case-insensitive, like `check`. |
| 21 | `handoff --i2p <path-to-a-.cmd>` on Windows did not run. It spawned without a shell, and Node refuses `.cmd` files that way (`EINVAL`). | A `.cmd`/`.bat` goes through the same escaped `cmd.exe` line as the npx fallback (#14), with the program path caret-escaped too. That line is now passed as one string, which also removes Node 24's DEP0190 warning. |
| 22 | With `FORCE_COLOR=1` in the environment, 8 tests failed: the spawned CLI coloured its output, as it should. | The test files drop `FORCE_COLOR` before spawning. |
| 23 | Plugin layout (see the checklist): no `.claude-plugin/` manifest, and `agents/AGENTS.md` and `agents/CLAUDE.md` loaded as junk subagents. | Added `.claude-plugin/plugin.json` and `marketplace.json`, and moved the host guides to `hosts/`. Consistency tests pin the new manifests' versions and keep `agents/` to subagent files only. |

### Open (by judgment)

| Finding | Why left |
|---|---|
| Path traversal in `--output` and `handoff <dir>` (`../../x`). | Intended: the tool writes where the user points it. Agents should pass paths the user named. |

### Agent-flow notes (SKILL.md and commands)

- The flow is coherent: dialogue → approval gate → write → `check` → `score` → handoff. Arm A in the A/B (below) shows how an unattended agent actually runs it.
- **Token burn:** SKILL.md is 9.1 KB (~2.3k tokens), and `/b2i` expands to ~220 more. That's acceptable, and verdicts are compact as promised (≤ 3 notes).
- **Ambiguity fixed (#16):** which `b2i` to run. **Still open (needs a release):** `hosts/AGENTS.md` and `hosts/CLAUDE.md` recommend `npx @ahmed-3m/brainstorm2idea check`. That is correct only once a fixed version is published.

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
- ✅ `.zcode-plugin/` and `.claude-plugin/` are now in `files`, so both manifests ship in the tarball.

### Claude Code plugin marketplace

- ✅ **`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` added** (#23). The marketplace has one entry, `brainstorm2idea`, with `source: "./"`. `claude plugin validate .` passes with no warnings, for the marketplace and for the plugin manifest. The README has the install line: `/plugin install brainstorm2idea --marketplace ahmed-3m/brainstorm2idea`. The consistency suite pins both versions to the engine's.
- ✅ **The host guides moved from `agents/` to `hosts/`** (#23), so Claude Code no longer loads them as subagents named AGENTS and CLAUDE. A consistency test keeps `agents/` to subagent definitions only.
- ✅ After #4, all four commands' frontmatter parses (it was an error for `/b2i-export`).
- ✅ The skill frontmatter is valid (`name` matches its directory, description < 1024 chars).
- ⚠️ Not verified: a live install through `/plugin install`. That needs this PR merged to main, since the marketplace is read from the default branch.

### ZCode — `.zcode-plugin/plugin.json`

- ✅ `version` 0.4.2 matches the engine and `package.json` (guarded by the consistency suite). `skills: ./skills` and `commands: ./commands` resolve.
- ⚠️ Not validated against ZCode's schema: no validator or host was available here.

### Agent-skill directories (SKILL.md standard: Claude Code `~/.claude/skills`, OpenCode, Antigravity, Codex-style hosts)

- ✅ OpenCode discovers and loads the skill from `.opencode/skills/brainstorm2idea/` (verified in the A/B setup, with all other skills denied). The bundled engine runs from `<skill-base>/scripts/`.
- ✅ The engine runs directly (`node <skill-base>/scripts/brainstorm2idea.mjs`), with no npm and no PATH needed. That path was never broken.
- ⚠️ The skill copied alone (without `commands/`) has no `/b2i` slash command. That's expected and documented ("load the skill").
- ⚠️ Antigravity is claimed in the README but was not exercised here.

### Before any listing (in order)

1. Merge the follow-up PR and release 0.4.3. Bump the engine, `package.json`, `.zcode-plugin` and both `.claude-plugin` files together (the consistency suite enforces this).
2. Try a live `/plugin install` from the marketplace.
3. Act on the Part 2 proposals.
