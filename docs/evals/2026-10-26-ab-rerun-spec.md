# A/B Efficacy Eval — clean re-run (pre-registered)

**Status:** PRE-REGISTERED. This file is committed before any trial runs. Results go in
`docs/evals/<run date>-ab-rerun-results.md`. Any change to this spec after the first trial is
listed under "Deviations" in that report, with the reason.

**Why a re-run:** the 2026-10-22 pass ([spec](2026-10-22-ab-efficacy-spec.md),
[results](2026-10-22-stress-and-efficacy.md)) was pieced together from separate runs:
- 3 cells came from a parallel pass, and 13 were re-run after Z.AI's 5-hour quota cut them off.
- An agent ran `taskkill /F /IM node.exe` and killed the batch.
- Two relays exited 1 after their agents had finished.

This run is **one clean 16-cell pass**: every cell and every grader comes from the same harness
build, run one at a time from clean workspaces.

---

## What stays fixed (unchanged from the 2026-10-22 spec)

The following are copied unchanged, so the two runs compare cell for cell:
- **Ideas:** the 8 ideas, with the same raw prompts, must-haves and traps.
- **Metrics:** T, G, R, W, K, $, ⏱, H and X, with the same definitions.
- **Grading:** the blind-grading protocol, including the docs exception for ideas 5 and 8.
- **Verdict:** hypotheses H1–H6, their pass bars and the verdict rule.
- **Limits:** 60 min per initial run, 30 min per rework round, at most 2 rework rounds.

**Prompts.**
- **Arm B's prompt** is byte-for-byte the same as in the first run.
- **Arm A's prompt** keeps the same template: `commands/b2i.md` with `$ARGUMENTS` replaced by the
  raw idea, plus the shared suffix. Its content follows the b2i version under test, which is
  intended. Since `dbe66ae`, `commands/b2i.md` has changed by 1 line and the `SKILL.md` that the
  agent reads has changed by 42 lines.
- **The shared unattended-run suffix** is unchanged.

**Frozen code.** These may not change:
- `ideas.mjs` (the rubric)
- `SUFFIX`
- `armPrompt`
- `graderBrief`
- the grader's `blindCopy` rules

The rest of `driver.mjs` changes as listed below. The harness lives outside the repo, so
`runs/manifest.json` records a sha256 of every harness file at setup. A file that changes after
that is a deviation.

## What changes (decided before any trial)

| Item | 2026-10-22 | This run |
|---|---|---|
| b2i under test | `dbe66ae` (published v0.4.2) | `main` at `86f58e0`: v0.5.1 plus the unreleased judgment checks from PR #7. `skills/brainstorm2idea/` and `commands/` are exported from that commit into the harness's `skill-src/`. |
| Execution | parallel (`--jobs 4`), then serial after the failures | **Serial from the start** (`--jobs 1`), under the renamed node binary `b2i-ab-harness.exe`, so a stray `taskkill /IM node.exe` can't reach the harness or its relays. |
| Stage order | per stage | **The same per-stage order as the driver uses:** all 16 initial runs, then the run check for every cell, then rework rounds, then all 16 graders. Graders run in a shuffled order whose seed is recorded in the manifest. |
| Cell order | idea order, A before B | The starting arm alternates by idea: `1A 1B 2B 2A 3A 3B 4B 4A 5A 5B 6B 6A 7A 7B 8B 8A`. This spreads provider load and time-of-day effects across both arms. Quota cut-offs don't need this, because they are already redone from clean. |
| Process hygiene | none | **Process cleanup.** Before setup, the harness snapshots every listening TCP port and its PID as a baseline. Before each cell, and after each run check, it lists new listeners. It kills only processes that belong to the eval: descendants of the harness, relay or OpenCode, or processes whose command line contains a `runs/` workspace path. It logs any other new listener and leaves it running. This fixes the stray `:8787` server from 6B without touching the operator's own processes. |
| Relay failures | counted as-is | **Relay failures.** A run is redone from a clean workspace only when the logs show an **infrastructure** cause: a provider quota or 5xx, a network error, or a harness crash. There is at most 1 redo per cell, outside the quota guard, and every redo is logged with its cause. A run the agent broke itself (for example, a shell command that killed its relay) is **kept**. It gets the run check on whatever workspace it left and rework as normal, because that failure belongs to the arm. A missing `result.json` must not crash the pass: the harness records the cell as `relay_failed` and moves on. |
| Timeouts | — | **Timeouts.** A run stopped by the 60/30 min watchdog has relay status `timeout` and still has a `result.json`. It is counted as it stands, with the run check and rework applied as normal. |
| b2i provenance (arm A) | — | **Which b2i arm A used.** `SKILL.md` lets the agent call b2i "via npx". npm has 0.5.1, which lacks the judgment checks. The shell-command log (`bash` or `shell` tool) records which b2i each call used: the bundled `brainstorm2idea.mjs`, `npx @ahmed-3m/brainstorm2idea`, or a global `b2i`. The H5 matcher is widened to all three forms. For any cell that used a non-bundled b2i, the result is still counted, but its judgment-check observations below are void. Neither `b2i` nor `i2p` is installed globally on this machine, which preflight confirms. |
| H5 brief check | from the agent's log | The "brief passes `b2i check`" part of H is decided by the **harness** running `check` at `86f58e0` on the final brief. The agent's own log is not used. The handoff part is still read from the tool log and the workspace. |
| Old artefacts | — | The old `grade/` directories are archived to `grade-2026-10-22/` before setup. `runs/` starts empty. |
| Version manifest | in prose | **Version manifest.** `runs/manifest.json` records the b2i commit, the `@ahmed-3m/idea2prototype` version (from `npm view`, currently 1.2.0), the OpenCode version (v2.1.1), the Node version of the renamed binary (24.12), the model and variant, the harness file hashes and the grader-order seed. It is written at setup and again after the last grader. If i2p's version changes mid-run, it is a deviation. i2p is not pinned through `B2I_HANDOFF_CMD`, because that would skip the live template check and change the handoff path under test. |

The following are unchanged:
- **Model:** `zai/glm-5.3`, variant `max`.
- **Harness:** OpenCode's `build` agent via the `opencode-delegate` relay, with `--standalone` and `OPENCODE_DISABLE_CLAUDE_CODE=1`.
- **Skill isolation:** `permission.skill`.
- **Platform.**

## Preflight (all must pass before cell 1)

1. `npm test` passes at `86f58e0`, and the exported `skill-src/` matches that commit (`git diff --no-index` is empty).
2. Skill isolation: a throwaway run in each arm, asking the agent to list its skills, returns
   `[brainstorm2idea]` for A and `[]` for B.
3. The port/PID baseline is recorded, and there are no leftover `opencode` processes.
4. Neither `b2i` nor `i2p` resolves on `PATH`.
5. The run starts right after a Z.AI quota reset, so the first cells don't hit the cap partway
   through. The quota guard still covers later resets.
6. The grader parser fixes are present: `isTrue` accepts `"true  (desc)"`, and both `bash` and
   `shell` count as shell tools.

## Secondary observations (descriptive only, no pass bars)

These do not affect the verdict. They're recorded because b2i has changed since the first run:
- **Per-cell delta vs 2026-10-22:** T, G, K and ⏱ for each cell, compared with the first run.
  - **Arm B's software is unchanged,** so its delta estimates run-to-run noise *plus* any
    provider-side drift in how `glm-5.3` is served since then. The two can't be separated.
  - **Arm A's delta** adds the b2i change on top.
- **Idea 8 (two products):** did arm A's brief raise the two-product warning, and did the agent
  pick one project? Must-have M1 failed in both arms last time.
- **Idea 5 (physical café):** did arm A write `template: none`? Last time it handed off a `web`
  brief.
- **Judgment checks (new).** These count only for cells that used the bundled b2i. For each
  arm-A brief, as checked by the harness at `86f58e0`, record:
  - `judgment.alternatives`
  - `judgment.trust` and `trustTriggers`
  - `scopedOutSafety`

  How to read them:
  - **Trust triggers only match the active scope** (name, distilled line, Goal, flows). The
    trap features that look trust-shaped (payments in 2, bank sync in 6, Jira push in 7) belong
    in Out of scope, so a well-scoped brief is expected to come out `trust: n/a`. A trigger that
    fires means a trap was left in scope.
  - **Watch idea 8.** The safety-control list includes `secrets`, so an Out-of-scope bullet that
    cuts "secret encryption" (one of idea 8's traps) raises the scoped-out-safety warning. Record
    whether that warning fired and whether the agent then built encryption. That would be a
    trap that b2i itself steered the agent into, and it matters when reading T for 8A.
  - **Did the agent add `## Alternatives` and `TRUST:` lines on its own** (best effort, from the
    shell-command log)? "On its own" means the agent's first `check` output already shows that
    section passing. "After a warning" means a warning followed by an edit to the brief and a
    later passing `check`. If the log can't tell, record it as unknown.

## Budget (estimate from the first run)

The first run took about 254 min of agent time and cost $13.67 over 16 cells. Grading adds
16 sequential read-only runs. Expect about **5–6 h of wall time** plus any quota waits, and
**about $15–20**.

## Limitations

These are the same as in the 2026-10-22 spec:
- n = 1 per cell.
- One model and one harness.
- The grader is the same model family.
- The run is unattended, so only agent-side value is measured.
- The blind copies for ideas 5 and 8 keep `brief.md`, so the grader can tell arm A there.

Two additions:
- b2i under test is an unreleased `main` commit, not a published version.
- Arm B's comparison with the first run can't separate noise from provider drift.
