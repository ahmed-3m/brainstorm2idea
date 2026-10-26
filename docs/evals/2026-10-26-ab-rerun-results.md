# A/B Efficacy Eval — clean re-run results (2026-10-26)

This report covers the run pre-registered in the [re-run spec](2026-10-26-ab-rerun-spec.md). The
hypotheses, metrics and verdict rule are the ones in the
[2026-10-22 spec](2026-10-22-ab-efficacy-spec.md). The first run's results are in
[2026-10-22-stress-and-efficacy.md](2026-10-22-stress-and-efficacy.md).

**Setup, as pre-registered:**
- **b2i under test:** `main` at `86f58e0`, which is v0.5.1 plus the unreleased judgment checks.
- **Other versions:** idea2prototype 1.2.0. OpenCode v2.1.1, `zai/glm-5.3 --variant max`. Node v24.12.0 under the renamed binary `b2i-ab-harness.exe`.
- **Cells:** 16, run serially in the alternating order `1A 1B 2B 2A … 8B 8A`, then 16 blind graders in shuffled order (seed 3905676393).
- **Timing:** preflight at 19:20 UTC, last grader finished at 23:24 UTC, so about 4 h 05 min of wall time.
- **Cost:** $11.53 for the agents plus $1.00 for the graders.
- **Quota and redos:** no quota stops and no infrastructure redos. Every initial run finished with status `completed`.

The run was meant to be one clean, uninterrupted pass. It was not quite that. The harness stopped
twice and was resumed, and the H5 brief check had to be done after the run. Nothing an agent or
grader did was re-run. See [Deviations](#deviations).

## Verdict: **better off with b2i**

H1, H2, H3 and H5 pass, so this is the spec's "Better off with b2i". H4 also passes, so it is not
"at a cost", and H6 passes too. This repeats the first run's verdict.

With b2i the agent built **9 traps instead of 22**. It built fewer or the same number of traps on
all 8 ideas, matched the goal at least as well, used fewer tokens and finished faster.

| ID | Pass bar | Arm A (b2i) | Arm B (none) | Result |
|---|---|---|---|---|
| **H1** | ΣT(A) ≤ 0.5 × ΣT(B), and T(A) ≤ T(B) on ≥ 7/8 | ΣT = **9** | ΣT = **22** (half = 11) | **Pass.** A ≤ B on 8/8 ideas |
| **H2** | mean G(A) ≥ mean G(B) − 0.10 | 0.938 | 0.813 (bar 0.713) | **Pass** |
| **H3** | R(A) ≥ R(B) − 1 | 7/8 | 7/8 | **Pass** |
| **H4** | median K(A) ≤ 1.5 × B, and median ⏱(A) ≤ 1.5 × B | 93.5k tokens, 10.95 min | 119.7k tokens, 14.25 min | **Pass.** A is lower on both |
| **H5** | handoff succeeds on ≥ 7/8 | 8/8 | — | **Pass.** 2 needed a second try (below) |
| **H6** | ΣW(A) ≤ ΣW(B) | 1 | 1 | **Pass** |

## Raw results

How to read the table:
- **T** is traps built, **G** is goal match (0–1), **K** is input + output + reasoning tokens, **⏱** is wall time, and **$** is OpenCode's reported cost.
- **R/W** shows whether the prototype ran first time (Y/n) and how many rework rounds it needed.
- K, ⏱ and $ include the rework rounds.

| # | Idea | T A / B | G A / B | K A / B | ⏱ A / B (min) | $ A / B | R/W A / B | Handoff (A) |
|---|---|---|---|---|---|---|---|---|
| 1 | Plant watering | 0 / 0 | 1.00 / 1.00 | 61.4k / 33.6k | 5.7 / 4.3 | 0.32 / 0.14 | Y0 / Y0 | i2p web |
| 2 | PawsOnDemand | 4 / 5 | 1.00 / 1.00 | 172.3k / 118.8k | 11.4 / 13.5 | 0.86 / 0.69 | n1 / Y0 | i2p web |
| 3 | CollabMark | 1 / 3 | 1.00 / 1.00 | 99.1k / 174.4k | 11.4 / 34.7 | 0.70 / 1.79 | Y0 / Y0 | raw (web) |
| 4 | kv-log-parse | 0 / 1 | 1.00 / 1.00 | 92.2k / 129.3k | 10.5 / 16.2 | 0.52 / 0.72 | Y0 / Y0 | i2p library |
| 5 | Book swap café | 0 / 2 | 1.00 / 0.00 | 88.2k / 119.0k | 9.7 / 19.1 | 0.54 / 0.63 | Y0 / n1 | i2p web, 2nd try |
| 6 | Flatmate expenses | 1 / 4 | 1.00 / 1.00 | 92.0k / 125.1k | 7.6 / 12.8 | 0.51 / 1.01 | Y0 / Y0 | i2p web |
| 7 | Meeting-notes digest | 0 / 3 | 1.00 / 1.00 | 137.8k / 120.4k | 12.8 / 14.7 | 0.80 / 0.80 | Y0 / Y0 | i2p web |
| 8 | Dotfiles + streak | 3 / 4 | 0.50 / 0.50 | 94.8k / 116.8k | 11.7 / 13.8 | 0.64 / 0.85 | Y0 / Y0 | i2p cli, 2nd try |
| | **Total / mean** | **9 / 22** | **0.938 / 0.813** | 838k / 937k | 80.8 / 129.1 | **4.89 / 6.64** | 7 / 7 first time | 8/8 |

Traps built:

| # | Arm A (b2i) | Arm B (none) |
|---|---|---|
| 2 | swipe UI, GPS van map, payments, payroll dashboard | swipe UI, GPS van map, payments, video reviews, payroll dashboard |
| 3 | git-backed history | OAuth, multi-region clustering, git-backed history |
| 4 | — | pretty-print |
| 5 | — | bookstore/inventory, member accounts |
| 6 | multi-currency (fixed EUR/USD rate) | bank sync (simulated), receipt OCR (pasted-text stand-in), multi-currency, login |
| 7 | — | live audio recording, speaker diarization, Jira push |
| 8 | both projects, secret encryption, GitHub API | both projects, secret encryption, cloud sync, GitHub API |

Unrequested extras (X, descriptive only): 80 in arm A and 87 in arm B.

**Rework:**
- **2A:** its `run.json` started the server with `PORT=3170 node …`. That form doesn't work in Windows' `cmd` shell, where the run check executes it. It was fixed in round 1.
- **5B:** its demo crashed on an undefined value. It was fixed in round 1.

### What the numbers do and don't say

- **Scope creep is still where b2i helps.** Four ideas differ by ≥ 2 traps (3, 5, 6, 7), all in b2i's favour.
  - The spec counts ±1 on one idea as noise.
  - ΣT(A) stays almost flat between runs (8 → 9). ΣT(B) rises (19 → 22).
- **Goal match:** 3A's lost must-have from the first run did not recur. The one complete goal miss (G = 0) in this run is in arm B. 5B built a full café platform (catalogue, members, credits) and never said the idea is physical. 8A and 8B are partial (G = 0.50): both failed M1, as in the first run.
- **Cost and time:** arm A was cheaper ($4.89 vs $6.64) and faster (80.8 vs 129.1 min).
  - The outlier is again 3B: Express, OAuth, a three-region server with git history, 34.7 min, $1.79.
  - On ideas 1, 2 and 7, arm A used more tokens than arm B. That's the overhead of running the skill when there's little to cut, plus 2A's rework round.
- **Where b2i made no difference, or not enough:**
  - **Idea 2 (PawsOnDemand).** 2A built 4 traps, against 3 last time. Its brief kept swipe-matching, a van map, a payroll dashboard and a "mock checkout" in scope, with only the *real* versions in Out of scope ("Real money movement — Stripe and Solana are represented by a mock ledger").
    - The spec counts a mocked trap as built.
    - `score` read the Out-of-scope line as "✓ Mitigated Payment gateway" and gave 100/100.
  - **Idea 8 (two projects in one).** 8A's brief again bundles the dotfiles vault and the streak page, with secret encryption in scope. `score` gave 100/100. There is still no two-product signal (first-run proposal 1, not yet built).
  - **Idea 5 (a physical café).** 5A again handed off a `web` brief, not `template: none` (first-run proposal 2, not yet built). It stayed minimal, so the grader passed it. The arm-B cell is the one that sprawled.

### Per-cell change since 2026-10-22

Each entry is this run minus the first run, as A / B. Arm B's software is unchanged, so its column
mixes run-to-run noise with any drift in how `glm-5.3` is served. The two can't be separated.
Arm A's column adds the b2i change (v0.4.2 → `86f58e0`) on top of that.

| # | ΔT A / B | ΔG A / B | ΔK A / B | Δ⏱ A / B (min) |
|---|---|---|---|---|
| 1 | 0 / 0 | 0 / 0 | −15.5k / −39.4k | −5.1 / −4.6 |
| 2 | +1 / 0 | 0 / 0 | +65.2k / −15.9k | −1.0 / −5.6 |
| 3 | 0 / 0 | +0.33 / 0 | −26.8k / −144.5k | −13.5 / −12.0 |
| 4 | 0 / 0 | 0 / 0 | +11.0k / +40.8k | +0.8 / +1.8 |
| 5 | 0 / +2 | 0 / −1.00 | +22.4k / +67.3k | +2.0 / +11.4 |
| 6 | 0 / 0 | 0 / 0 | +14.7k / +20.7k | −2.0 / −2.5 |
| 7 | 0 / +1 | 0 / 0 | +27.7k / −55.5k | −7.2 / −6.8 |
| 8 | 0 / 0 | 0 / 0 | −0.1k / +39.5k | −2.7 / +3.2 |

T moved on 3 of 16 cells, and only arm B moved by more than 1 (5B, +2). Token and time
deltas of ±40k and ±10 min appear in both arms, which sets the noise floor for K and ⏱ at n = 1.

## Handoff (H5)

- **Brief check:** all 8 arm-A briefs pass `check` (7/7) at `86f58e0`, as run by the harness after the run (see Deviation 4). All score 100/100.
- **Handoff:** all 8 succeeded. 5 used i2p on the first try, and 3A used `--target raw`.
- **Two needed a second try,** both for the same agent error the first run saw in 7A: `handoff .` into the non-empty workspace.
  - 5A and 8A both did this.
  - i2p's error named the problem, and each agent re-ran into a fresh subdirectory.
- **One agent changed its brief to satisfy `score`:** 4A, below.

## Secondary observations

**b2i provenance:** every arm-A cell used only the bundled `brainstorm2idea.mjs`.
- The harness labelled four cells (1A, 3A, 6A, 7A) as also using a global `b2i`.
- Each of those hits is a PATH probe (`command -v b2i`, `which b2i`, `b2i --version`) that found nothing. No b2i ran from npm or PATH.
- So the judgment-check observations count for all 8 cells.

**Judgment checks, from the harness's check at `86f58e0`:**

| Cell | alternatives | trust | trustTriggers | scopedOutSafety |
|---|---|---|---|---|
| 1A–6A, 8A | ok | n/a | — | — |
| 7A | ok | ok | `credentials` | — |

- **Alternatives and TRUST lines:** all 8 agents added `## Alternatives` on their own.
  - 7 of 8 also wrote `TRUST:` lines, though only 7A's scope required one.
  - 1A stated the same thing as an `ASSUMPTION:` line ("no trust boundaries are crossed").
  - No `score` run in any cell printed a judgment warning, so none of these was added in response to a warning.
- **Trust triggers stayed quiet on well-scoped briefs,** as intended. In 2A, 6A and 7A the trust-shaped traps (payments, bank sync, Jira push) sit in Out of scope.
- **7A's trigger was a false positive.** It fired on a negated mention in Goal: "zero API keys". The brief had a `TRUST:` line, so the result was `trust: ok`, not a warning.
- **Idea 8's `secrets` watch:** the scoped-out-safety warning did not fire, because 8A did not scope encryption out. It put "encrypt files flagged as secrets" in Goal. The trap was built because the brief asked for it, not because b2i steered the agent there.

**`score` steered one brief (4A).** 4A's brief used a sample log line,
`svc=payments msg="payment failed"`. `score` flagged it as a payment gateway, docked 15 points
and suggested "stub checkout with a local mock webhook", in a log-parser library. The agent changed
the sample to `svc=billing`, then to `svc=orders`, until the score returned to 100. Nothing in the
build changed, but it is a false positive that agents will work around rather than question.

## Audit (spec: every `true` trap verdict and every disputed must-have)

**Trap verdicts.** All 31 `true` trap verdicts were re-checked against the grader's `file:line`
evidence and the surrounding code. **0 overrides.** These were borderline and upheld under the
spec's "mocked or real" rule, matching the first run's calls:
- 2A payments: a mock ledger with fake Stripe and Solana receipts.
- 2A/2B GPS: a scripted van route on a canvas or SVG map.
- 6A multi-currency: a USD/EUR selector at a fixed rate.
- 6B bank sync and receipt OCR: a "simulated Plaid sync" endpoint, and pasted-text receipt parsing.
- 4B pretty-print: a `--pretty` flag that indents the JSON output.
- 5B member accounts: name-only members with swap credits, with no login.

**Must-haves graded false,** all upheld:
- 5B M1 and M2: it built a catalogue, members and credits platform, and no doc calls the idea physical.
- 8A and 8B M1: both arms built both projects.

## Deviations

1. **Operator watcher and manual server kills** (approved by the owner during the run).
   - **The problem:** agents start dev servers through Git Bash `npm`. The launching shell exits, so the server ends up under an orphaned process chain: neither a harness descendant nor a process whose command line names `runs/`. The driver's hygiene therefore logged these servers as "left running" and killed none.
   - **Manual kills:** four servers from earlier cells were still listening during later runs. They were killed by hand: 1A :3000, 2A :3170, 3A :8742 and 5A :3100.
   - **The watcher:** a watcher (`op-watch.mjs`) then killed new orphaned listeners after each cell. It killed one, 7A's :3000.
   - **Logs:** all 5 kills are in `runs/operator-kills.jsonl`.
   - **Effect on R:** none. The checks ran after the strays were gone, and the run check's port guard found every port free.
   - **Possible effect on agents:** a stray could have taken a port a later agent wanted. For example, 3A's README says :3000, but its `run.json` uses :8742. Agent behaviour may have been affected; measured R was not.
2. **The watcher killed the driver** during the check stage, just after 1B's check.
   - **The cause:** the watcher walked a listener's process chain up past the harness, to a shell whose parent had exited, and killed that tree. It took the driver with it.
   - **The fix:** the watcher now stops at the harness or OpenCode. The check stage was re-run from the start.
   - **Effect:** 1A and 1B were re-checked with the same results. No agent work was redone.
3. **The driver crashed at the start of rework,** and `driver.mjs` was edited after setup.
   - **The cause:** a process command line contained control characters. PowerShell 5's `ConvertTo-Json` leaves those unescaped, so `JSON.parse` failed in the hygiene step.
   - **The fix:** `psJson` now replaces control characters before parsing. This is the one change to `driver.mjs` after setup, and the end manifest lists it in `changedSinceSetup`.
   - **What it didn't touch:** none of the frozen parts (`ideas.mjs`, `SUFFIX`, `armPrompt`, `graderBrief`, `blindCopy`). The skill files are unchanged too; their hashes match setup.
   - **Effect:** 2A's rework round 1 had finished, and its passing check was saved, before the crash. Only its log line is missing. Rework resumed with 5B.
4. **The H5 brief check was done after the run.**
   - **The problem:** the spec puts the "brief passes `check`" part of H5 on the harness. But `handoff` moves the source brief into `PROTOTYPE.md`, and that file has no frontmatter. So the harness's brief finder found a brief only for 8A, where the agent had recreated `brief.md`.
   - **What was done instead:** each arm-A cell's last brief was rebuilt from the agent's own `write`/`edit` tool events, including 3A's `cp` from a temp draft. Each was then checked and scored with `skill-src` at `86f58e0`.
   - **Validation against what handoff left behind:**
     - The rebuilt 8A brief is byte-identical to the file on disk.
     - For the other 7, every body line of the rebuilt brief appears verbatim in the merged `PROTOTYPE.md`, 232 of 233 lines in all.
     - Each `distilled` value matches the `> Idea:` line, and each `template` matches `.idea2prototype.json`.
     - The only differences are ones handoff makes by design: 1A's `"` became `'` (#24), and 4A's library template renames `## Core flows` to `## Public API`.
   - **A second, independent route:** the agent's own last `check` before each successful handoff passed 7/7. It ran the bundled engine, whose sha256 matches `skill-src` at `86f58e0`. So H5's brief check holds either way.
   - **Location:** the rebuilt briefs and results are in the harness's `posthoc/` folder.
5. **The b2i provenance classifier** counted PATH probes as global `b2i` use in 1A, 3A, 6A and 7A, and set `judgmentValid: false` for them. Each was reclassified by reading the commands (see Secondary observations).

**Unchanged from setup:**
- idea2prototype stayed at 1.2.0 across all three manifests. Each of the 7 i2p handoffs also recorded 1.2.0 in its `.idea2prototype.json`; 3A's raw handoff did not run i2p.
- No redos, quota waits, `relay_failed` cells or unparsed grades.

The limitations stated in advance still apply:
- n = 1 per cell, so there is no significance claim.
- One model and one harness.
- The grader is the same model family.
- The run was unattended.
- b2i is an unreleased commit.
- Arm B's drift can't be separated from noise.

## Proposals

Proposals 1–3 carry over from the first run and are still open. Proposals 4–6 are new.

1. **`score` and SKILL.md: detect a two-product idea.** Idea 8 is the case (both runs).
2. **SKILL.md: make the non-software path explicit** (`template: none`). Idea 5 is the case (both runs).
3. **Handoff docs: recommend a fresh `<dir>`, not `.`.** 7A hit this last time; 5A and 8A hit it this time.
4. **Treat a mocked trap as in scope.** SKILL.md should say that a "mock" or "simulated" version of an Out-of-scope feature is still that feature. `score` should stop reporting "Mitigated" when the Goal or flows contain a mock of the item that Out of scope excludes. Idea 2 is the case.
5. **`score`: don't match infra keywords inside sample data.** Code spans, quoted strings and `key=value` examples should be skipped. 4A is the case.
6. **Trust triggers: ignore negated mentions** such as "zero API keys" and "no credentials". This is low priority, because the TRUST line already resolves it. 7A is the case.

Harness changes for any future run:
- Snapshot the brief before `handoff` runs.
- Have the provenance classifier ignore PATH probes.
- Have hygiene treat an orphaned chain created during a cell as owned by the eval.
