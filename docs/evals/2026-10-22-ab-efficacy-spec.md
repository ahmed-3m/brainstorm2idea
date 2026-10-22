# A/B Efficacy Eval — with vs without b2i (pre-registered)

**Status:** PRE-REGISTERED. This file is committed before any trial runs. Results go in
`docs/evals/2026-10-22-stress-and-efficacy.md`. Any change to this spec after the first
trial is listed under "Deviations" in the results report, with the reason.

**Question:** Starting from the same raw idea, does an agent that has the `brainstorm2idea`
skill reach a running prototype that matches the stated goal better than the same agent
without it, and is the overhead worth paying?

---

## Setup (fixed)

| Item | Value |
|---|---|
| Agent under test | OpenCode CLI `v2.1.1`, `build` agent, headless (`opencode run --auto`) via the `opencode-delegate` relay |
| Model | `zai/glm-5.3`, variant `max` (both arms, every run) |
| b2i under test | Repo commit `dbe66ae` (= published v0.4.2): `skills/brainstorm2idea/` copied into `<ws>/.opencode/skills/brainstorm2idea/` |
| idea2prototype | Published `@ahmed-3m/idea2prototype@latest` via `npx` (the default `b2i handoff` path) |
| Workspace | A fresh empty `git init` directory per run, outside any repo |
| Platform | Windows 11, Node 24.12 |
| Time limit | 60 min per initial run; 30 min per rework round |
| Repetitions | n = 1 per (idea × arm) → 8 paired comparisons, 16 initial runs |

### Arms

Both arms get **the same raw idea text** and **the same unattended-run suffix**. They differ only
in the prefix.

- **Arm A (with b2i):** the workspace contains the skill. The prompt is exactly what the `/b2i` slash
  command expands to (`commands/b2i.md` with `$ARGUMENTS` = the raw idea), so this tests the shipped
  plugin as-is.
- **Arm B (without b2i):** no skill in the workspace. Prompt prefix:
  `Build a running prototype of this idea: "<raw idea>"`

**Shared unattended-run suffix (both arms, verbatim):**

> You are running unattended: no human will answer questions during this run. The user has
> pre-approved any plan, brief, or design you draft — do not wait for approval and do not ask
> questions; where you would ask, choose the most reasonable option and write it down as an
> assumption. Your end goal is a running prototype in this directory. When you are done, write
> `run.json` in this directory's root:
> `{"cwd": "<dir relative to here>", "kind": "server|cli|library|none", "install": "<optional command>", "start": "<command that starts it, for server>", "url": "<http://127.0.0.1:PORT/ for server>", "demo": "<command that exercises the core flow and exits 0>"}`.
> Use `"kind": "none"` only if you conclude the idea should not be a software prototype.

### Ideas (8)

Ideas 1–5 are the canonical scenarios in `benchmarks/specs.md`, using their **raw prompts** verbatim.
Ideas 6–8 are new and deliberately messy. For each idea, **must-haves** are what the stated goal
requires. **Traps** are tempting scope-creep or rabbit-hole features named or implied in the raw idea.
Both lists are fixed here, before any run.

| # | Idea | Must-haves (goal match) | Traps (scope creep / rabbit holes) |
|---|---|---|---|
| 1 | PlantPulse (rambling voice memo) | M1 list plants with next-water countdown · M2 mark watered resets the timer · M3 add a plant with an interval | photo/AI leaf diagnosis · push notifications · home-screen widgets · community plant trading · paid subscriptions/payments · user accounts/login |
| 2 | PawsOnDemand (Frankenstein SaaS) | M1 browse/search groomers by zip · M2 pick a slot and request a booking · M3 booking confirmation | swipe/Tinder matching UI · live GPS van tracking/maps · payments (Stripe/crypto) · video reviews · groomer payroll/inventory dashboard · native mobile app · user accounts/login |
| 3 | CollabMark (infra rabbit hole) | M1 markdown editor with live preview · M2 edits sync in real time between ≥2 clients · M3 create/join a named room | OAuth/accounts · multi-region/Redis/Raft clustering · git-backed version history |
| 4 | kv-log-parse (library) | M1 parse `key=value` pairs incl. quoted strings with escapes · M2 typed values (numbers, ISO timestamps) · M3 zero runtime dependencies | log shipping/exporters (Elastic/OTel) · pretty-print/colorize output · custom grammar/config DSL |
| 5 | Book swap cafe (non-software) | M1 explicitly recognises it as a physical, non-software idea · M2 output is a brief/plan or a deliberately minimal tool, not a platform | online bookstore/inventory system · POS/payment processing · member accounts/login · mobile app |
| 6 | Flatmate expenses (new) | M1 log an expense with payer and participants · M2 show who owes whom · M3 simplified settle-up (minimal transfers) | bank sync (Plaid etc.) · receipt OCR · multi-currency/live FX · per-user login/accounts · native mobile app |
| 7 | Meeting-notes digest (new) | M1 paste notes/transcript → short summary · M2 action items with owner names extracted · M3 runs locally with no paid API | live audio recording/transcription · speaker diarization · Jira/Google Calendar integration · fine-tuning/model training |
| 8 | Dotfiles + streak page (two projects in one, new) | M1 picks one project and says so · M2 that project's core loop works (dotfiles: back up and restore; streak page: render a heatmap from data) | building **both** projects · secret encryption · cloud sync · GitHub API/OAuth integration |

**Raw prompts for ideas 6–8 (verbatim):**

6. "ok so me + 3 flatmates keep fighting about who paid for what lol. venmo requests everywhere. idea: app where anyone can log 'I paid 42.50 for groceries, split between X Y Z' and it shows who owes who, simplified so we do the min number of transfers. would be sick if it synced with our bank accounts automatically (plaid?) and scanned receipts with OCR, and handled euro/usd since jonas is from germany, plus login for each of us and maybe a mobile app eventually. oh and recurring rent split."
7. "so basically after every standup I have this wall of notes and nobody reads them. what I want is: paste the raw meeting notes or transcript in, and get back a short summary plus a list of action items with owner names pulled out, like 'Sara: send the deck'. ideally it'd record the meeting audio live and transcribe it with speaker detection, push action items into Jira and Google Calendar, and learn our team's style by fine-tuning a model on old notes. needs to run locally, I don't want to pay for an API."
8. "two things bugging me: I lose my dotfiles every time I set up a new laptop, and I also want a little public page that shows my GitHub coding streak. maybe one tool that does both? backs up ~/.zshrc, ~/.gitconfig etc into a git repo and restores them on a new machine, and also renders a streak heatmap website. should encrypt secrets in the dotfiles, sync to the cloud, and support windows/mac/linux."

---

## Metrics (fixed definitions)

| ID | Metric | How it is measured |
|---|---|---|
| **T** | Traps built (scope creep + rabbit holes) | Per run: the number of the idea's traps with **user-facing behaviour in code**, mocked or real. A trap that appears only in docs or comments, or is explicitly disabled, does not count. Judged by a blind grader (below); the orchestrator audits every "built" verdict. |
| **G** | Goal match | Per run: the fraction of the idea's must-haves implemented and working (0–1), from the same blind grader. |
| **R** | Runs first time | Per run: a harness reads `run.json`, runs `install` if present, then for `server` starts it and requires an HTTP status < 500 from `url` within 30 s, and for anything with `demo` requires exit 0. A missing or unusable `run.json` is a failure. For idea 5, a `kind: none` declaration with a brief/plan counts as a pass. |
| **W** | Rework rounds | When R fails, the orchestrator resumes the same session with the harness error verbatim ("The prototype failed its run check: <error>. Fix it and update run.json."), at most 2 times, re-running R after each. W = rounds needed (0, 1, 2), or 3 if still failing after 2. |
| **K** | Tokens | Sum over all steps (initial run + rework) of input + output + reasoning tokens, from the relay's `events.jsonl`. Cache reads are reported separately. |
| **$** | Cost | Sum of per-step `cost` from `events.jsonl` (USD, as reported by OpenCode). |
| **⏱** | Wall time to running prototype | Relay `startedAt`→`finishedAt`, summed over the initial run and rework rounds. |
| **H** | Handoff success (arm A only) | The run produced a brief that passes `b2i check`, **and** either `b2i handoff` succeeded (i2p or raw) or, for `template: none`, it was correctly declined as brief-only. Read from the run's tool-call log and the workspace. |
| **X** | Unrequested extras (descriptive only) | Features that are neither must-haves nor traps, as listed by the grader. Not scored. |

### Blind grading

The grader is a **separate, read-only** OpenCode run (`plan` agent, same model). It gets a copy of the
workspace with every `*.md` file, `run.json`, `.opencode/` and `.git/` removed, under a random
ID. It gets the idea's raw prompt, must-haves and traps, and returns JSON:
`{"traps": {"<trap>": true|false, ...}, "mustHaves": {"M1": true|false, ...}, "extras": [...], "evidence": {"<item>": "file:line"}}`.
Residual unblinding (the i2p scaffold layout) is acknowledged. The orchestrator re-checks every
`true` trap verdict and disputed must-have against the code, and logs any overrides.

---

## Hypotheses and pass bars (fixed)

| ID | Hypothesis | Pass bar |
|---|---|---|
| **H1** (primary) | b2i reduces scope creep | ΣT(A) ≤ 0.5 × ΣT(B) **and** T(A) ≤ T(B) on ≥ 7 of 8 ideas |
| **H2** | b2i does not hurt goal match | mean G(A) ≥ mean G(B) − 0.10 |
| **H3** | b2i does not hurt "it runs" | R(A) passes ≥ R(B) passes − 1 |
| **H4** | b2i's overhead is bounded | median K(A) ≤ 1.5 × median K(B) **and** median ⏱(A) ≤ 1.5 × median ⏱(B) |
| **H5** | the b2i handoff works in an agent's hands | H(A) succeeds on ≥ 7 of 8 ideas |
| **H6** | b2i does not add rework | ΣW(A) ≤ ΣW(B) |

### Verdict rule (fixed)

- **"Better off with b2i"** — H1, H2, H3 and H5 pass. If H4 fails as well, the verdict becomes
  **"better off with b2i, at a cost"** and the overhead is quantified.
- **"Not demonstrated"** — H1 fails, whatever else passes. The report then says where b2i made no
  difference and proposes concrete changes.
- **"Harmful"** — H2 or H3 fails while H1 also fails.

### Limitations (stated in advance)

- n = 1 per cell. These are 8 paired observations, not a powered study, so no significance test is
  claimed. Differences of ±1 trap on a single idea are noise.
- One model (GLM 5.3 max) and one harness (OpenCode). Results may not carry over to Claude Code or
  other models.
- The grader is the same model family as the agent under test.
- Unattended mode removes b2i's human approval gate (pre-approved by the shared suffix), which is the
  part of b2i that depends on a human. This eval measures the **agent-side** value only.
