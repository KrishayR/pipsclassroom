# Handoff — November 3, 2026

## Latest update (Nov 3): Study 2 finished, classroom lessons accepted

- **Results: [Study 2 results](STUDY_2_RESULTS.md).** Full-game live exams on new sealed seeds, with both ablations. Every group kept 1–2 lessons, the classroom group included. Classroom students beat untrained students in live full games (+1,479 [333, 2,813]). Without the skill tool, the same students lose 5,515 points. The primary contrast (classroom − adaptive) is not significant.
- **HTTP 502/503/504 from the provider are now waited out** like a lost connection. Training for three groups was first cut short by 504s and was rerun.
- **New scripts:**
  - `npm run combine-study` merges a report with a retrain.
  - `npm run redo-exam-games` replays errored exam games while a run continues. It needs its own `MODEL_KEY_LEDGER`.
  - `npm run live-full-game` plays live full games with and without saved notes.
- **Long runs:** the request limiter is per process, so splitting a run across processes is about three times faster per game.

# Handoff — November 2, 2026

## Latest update (Nov 2): lessons pass, study running

- **Lessons are accepted.** Teachers get free strategy experiments, and the lesson test is unchanged. In live runs, every student saved a lesson in its first Classroom Session. See [Lesson acceptance](LESSON_ACCEPTANCE.md).
- **The gains show up in full games.** Short exams cannot show them, so `npm run full-game-check` and the study's `report.fullGameCheck` play the saved notes through whole simulated games on fresh seeds.
- **Study finished Nov 2, 8:20 PM PST.** Results: [Study results](STUDY_RESULTS.md). Accepted lessons improved full-game play (teacher group +929 [243, 1,620]). The classroom group kept no lesson in this one repetition, so no classroom advantage was shown. Exams were cut to 300 moves after training, for time (disclosed). Raw reports: `data/study/study-300.json` (used) and `data/study/study.json` (stopped full-game run).
- **Study started Nov 2, about 3 PM PST, on commit `d728afc`.** Helper on, 1 repetition, revisions on, full-game live exams on 2 sealed seeds:

  ```
  npm run evaluate -- --mode model --split exam --seeds 2 --cap 1500 \
    --arms solo,teacher,adaptive,classroom --repetitions 1 --training-rounds 3 \
    --token-budget 1200000 --simulation-budget 150000 --concurrency 24 \
    --full-game-games 40 --out data/study/study.json
  ```

  Sealed seeds: `data/sealed-exam-seeds.json` (12 seeds, not in Git), SHA-256 `a32dd87c39a95725b0cb8aebdfd3fffe03a7e320931eb2f94d304f9c2e6f6dd0`. The Oct 28 seed file was never used in an exam and is kept as `data/sealed-exam-seeds.2026-10-28.unused.json`. Estimated cost about $10, about 6 hours. If it stops, rerun the same command with `--resume`. **Do not start other paid runs while it runs**: they share the key and the rate limit.

- **Connection drops are waited out** (up to `MODEL_OUTAGE_WAIT_MS`, default 10 minutes). Requests that never connected are not charged.

# Handoff — October 30, 2026

## Latest update (Oct 30, evening): conditional lessons, calibration, live batches, no-helper option

Read [Conditional lessons](CONDITIONAL_LESSONS.md) first. In short:

1. **Conditional lessons** (`limits: { minOptions, maxGainLoss }`) step in only when a move breaks the skill. They removed large losses but have not produced an accepted lesson.
2. **Free gate calibration** (11 probes, 4/8/12/24 moves) found no false rejects at any length, and almost no probe helped over long games. Keep 4-move model rollouts; the lessons, not the test length, are the problem.
3. **Live batch with the helper** (`npm run live-batch -- --cycles 3`, $0.158): 6 candidates including revisions, all rejected; the best was neutral.
4. **No-helper option** (`MODEL_STUDENT_HELPER=off`): the live batch stopped on a network outage after 1 cycle ($0.187). The gate is too noisy without the helper: Muse is stochastic, and one general board decides the verdict.

**Decision needed:** helper on (reliable gate, likely null result) or off (more room, but sturdier gate needed first). Then freeze, seal seeds and run the study. 62 tests and the build pass. Total key spend is about $0.45.

## Earlier update (Oct 30): lessons can now change behaviour

Latest addition: [configurable live batch runner](LIVE_BATCH.md), with 1–100
cycles, an estimated $1 additional budget, automatic baseline/stage/cycle
archives, three concurrent student/verification requests, and sequential
learning stages. Includes shared request limits, in-flight budget reservations,
and isolated operation usage. The earlier sequential batch was stopped and
its archive preserved. No paid run was started to validate the optimization.

Work on `main` (the `codex/consequencelab-work` branch is merged). See
[Lesson influence](LESSON_INFLUENCE.md):

- Lessons use a new trigger, `when the skill applies`. Students get per-move
  facts (`moveFacts`) and follow an applicable verified lesson unless the move
  is clearly dangerous. A free impact check before verification asks the
  teacher once for a stronger change when a lesson would change nothing. The
  gate is unchanged. Focused practice is unchanged and is the first step of
  the tested flow.
- Live result: Muse now follows the lesson (play changed on 3 of 6 targeted
  boards), but the corner-pinning lesson lowered short-rollout utility and was
  rejected. No lesson has been accepted live yet.
- 41 tests and the build pass. Total live spend on the original key is about
  $0.13.
- Next: decide, before any study, whether 4-move model rollouts are too short
  to value structure lessons (a protocol change, made in advance and never
  after seeing exam results). Then freeze, seal new seeds, and run a small
  matched study (for example adaptive vs classroom plus baseline, 2
  repetitions). Report rejected and negative outcomes.

## Recommended approach (proposed Oct 30, for the team to agree)

Every live candidate so far has been rejected: −1.1, +0.42 (needs +1), 0.0 and −3.25 on the targeted boards. The mechanism works; the open question is whether the gate can recognise good advice.

1. **A negative answer is acceptable.** The goal is a fair experiment and an honest result, not an accepted lesson. The plan already says to report mixed or negative results plainly.
2. **Check the gate before the study (simulation, free).** Model-mode lesson tests play only 4 moves per board, with 2 general boards, while exams are 150 moves. Structure lessons pay off later, and one unlucky general board decides the general result. Using development data only, compare the short-test verdict with how the same lessons do over full-length development games. Choose the shortest rollout (and number of general boards) whose verdict agrees. The expectation is about 12 moves and 3 general boards, roughly $0.06 per lesson test. Then confirm once live (about $0.10).
3. **Freeze, seal new seeds, publish the hash, and run a small study:** adaptive vs classroom plus the untrained baseline, 2 repetitions. That's a few hours and about $5–15. Report all outcomes, including acceptance counts per group.
4. **Timeline to the Nov 4 deadline (6 PM PST; target 3 PM):**
   - Oct 30: gate check.
   - Oct 31: freeze and start the study.
   - Nov 1–2: study runs, with buffer.
   - Nov 3: write-up and demo video.
   - Nov 4: final checks and submission.

Avoid: lowering the acceptance bar, changing anything after seeing exam results, the full four-arm study (not enough time), and presenting a hand-picked accepted lesson as the result.

## Earlier update (Oct 29)

The `codex/consequencelab-work` branch referred to below has since been merged into `main`. The October 29 update below takes
precedence over the historical October 28 plan retained later in this file.
Do not launch that older large study as the next step: the current preference
is to keep Muse spending very small.

- [Focused practice handoff](FOCUSED_PRACTICE_HANDOFF.md) explains the new
  classroom button, the diagnostic evidence gap it addresses, implementation,
  evaluation boundaries, and next validation steps. All three students try
  all three skills, up to 36 decisions with the default settings. Regular
  games and saved notes are preserved. Live mode uses API credits.
- [Live teaching check](LIVE_TEACHING_CHECK.md) records the actual Muse test:
  eight verification pairs completed without errors, the candidate failed
  the unchanged acceptance gate, and Ada's notebook stayed unchanged.
  Short independent exams scored 176 and 148; this is repeat-run variation,
  not evidence of learning. No peer was eligible in that live run.
- Additional fixes cover Windows `.env` line endings, unique exercise
  episodes, protecting pending candidates from overwritten reviews, keeping
  exam boards separate from later practice, relevant simulation teacher
  citations, and clearer verification utility labels.
- All 36 automated tests, TypeScript checking, and the production build pass.
  A browser simulation exercised focused practice, recorded Sam's contribution
  to Ada, and verification. Its candidate was rejected. The new diagnostic
  flow still needs live validation; accepted learning and a performance
  advantage have not been demonstrated.
- Estimated spending recorded by this checkout is about $0.04353 including
  the connection check. The local key threshold was set to $1; it is an
  estimate, not an account billing cap. No new Muse calls were made for the
  focused-practice implementation.

Next, inspect focused practice → Discuss → verification in simulation. Agree
on a small budget before a live test of the same flow. Keep the gate fixed,
preserve rejected results, and use matched preparation and independent
repetitions before claiming gains. A future formal study needs a new source
freeze; do not resume the older study across these changes.

On another checkout, select this branch after cloning, install dependencies,
and create a local `.env` from `.env.example` only if live access is needed.
Keep secrets local. `.env`, SQLite state, spend ledgers, and raw `data/`
reports are intentionally ignored; the linked summaries are saved in Git.
The localhost browser tabs and running services belong to the current
machine and may need restarting in a future session.

## Historical handoff — October 28, 2026 (v0.2)

Written for whoever picks up the project next: a teammate, a judge reading the repository, or a future session.

## Current state

The plan's software is complete and runs end to end in simulation. The live Meta Model API integration works in Contributor mode (`muse-spark-1.3-contributor`) for student moves and a full teacher review. A live lesson check has completed. **No live exam or study has completed yet**, so there is no evidence yet, positive or negative, that the classroom helps an LLM. The simulation reports in `docs/` are mechanism checks only. In the current one, every simulated group rejected all of its candidate lessons, so every group matches the untrained baseline.

**Live lesson check (passed):** one classroom ran 18 practice moves, a focus choice, an exercise, an uncertain teacher diagnosis citing real moves, and a 6 + 2 pair verification that **rejected** the candidate (practice Δ −1.08). There were no errors; it cost $0.029 over 87 calls, and each model move took about 10–13 s. Details are in `docs/VALIDATION.md`.

**Study: started, then stopped on request.** The sealed study was launched from commit `3d9b516` and interrupted after about 5 minutes, before any training run or exam game finished. Nothing from it is usable and no exam seed was used. Start it fresh (step 3 below); don't resume it. Total live spend on the original key is about $0.04.

## Plan coverage

| Plan step                         | Status                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Engine                          | Done. Mechanics and replay tests; human-playable intro board.                                                                                              |
| 2 One Muse student                | Done, validated live (Standard and Contributor modes).                                                                                                     |
| 3 Save and replay                 | Done. Traces, replay without model calls, JSON export.                                                                                                     |
| 4 Three independent students      | Done.                                                                                                                                                      |
| 5 Diagnostic review               | Done, validated live. Evidence IDs validated, uncertainty flag, one correction attempt.                                                                    |
| 6 Reachable practice + curriculum | Done. Skill-tagged reachable snapshots, per-skill counts, 80/20 scheduler (deterministic, shared draws across arms), targeted exercise before each review. |
| 7 Bounded peer exchange           | Done. Peer chosen by relevant evidence on the focus; recipient plan; peer advice must pass the same gate.                                                  |
| 8 Verification + versioned memory | Done in software; live check pending. Targeted + regression pairs, one lesson per focus, least-supported replacement, rollback.                            |
| 9 Locked exam runner              | Done. Four arms, untrained baseline, sealed seeds, code hash, paired bootstrap contrasts, planning-target rule, ablations, parallel and resumable.         |
| 10 UI                             | Done. Focus and reason, per-skill counts (no percentages), mean/median/milestones, four groups, API key status. Not yet re-checked in a browser for v0.2.  |
| Cost pilot                        | Done (`npm run pilot`).                                                                                                                                    |

## What changed in v0.2 (Oct 28)

- Curriculum (`src/core/curriculum.ts`), four arms (solo / teacher-random / teacher-adaptive / classroom), memory replacement rules, agent-failure episodes.
- Model adapter fixes found live: completion cap raised to 4,000 because hidden reasoning used it up; truncated replies are no longer echoed back; `reasoning_effort` set to `low` (the API rejects `none`).
- One call per move: the skill ranking is supplied up front (in the first live runs the model requested it in 15 of 16 moves), with `lesson_id` citation and invalid-action counts.
- Reliability: process-wide rate limiter (`MODEL_RPM`), backoff retries for 429/5xx/timeouts, one correction attempt for teacher, peer and student-plan JSON.
- Spend: multi-key pool (`MODEL_API_KEYS`) that switches keys before an estimated $145 per key or on billing/authentication errors. The ledger is in `data/key-spend.json` and stores fingerprints only. Cached-input pricing is supported.
- Study tooling: `npm run seal-seeds`, `npm run pilot`, and a rewritten `npm run evaluate`. Training runs in parallel, exam games run concurrently, the report is saved after each game, `--resume` works, and the report carries a source-code hash.

## Setup on a new machine

Requires Node.js 22.12+.

```sh
git clone https://github.com/KrishayR/pipsclassroom.git && cd pipsclassroom
npm ci
npm test && npm run build          # 31 tests should pass
cp .env.example .env               # then put a Meta Model API key after MODEL_API_KEY=
```

`.env.example` already holds the chosen configuration: `muse-spark-1.3-contributor` with its prices ($0.10 input / $0.002 cached / $0.20 output per 1M tokens), `reasoning_effort` low, a 4,000-token completion cap, and the model-mode verification sizes. Contributor mode lets Meta train on prompts and responses and limits the team to 150 requests per minute. To pool teammates' credit, add `MODEL_API_KEYS=key2,key3,...`. Keys are never committed.

Before spending, check the key with one short run: `npm run pilot -- --steps 1 --token-budget 30000` (a few cents at most).

**Exam seeds:** sealed seeds are deliberately not in Git. The file generated on Oct 28 stayed on the original machine and was never used by an exam, so generate new ones: `npm run seal-seeds -- --count 12`. Record the printed SHA-256 (for example, in the submission) before running the study, and don't regenerate after any exam game has used them.

Local-only files that are **not** needed: `data/key-spend.json` (per-machine spend estimate), `data/classroom.sqlite` (UI state), and the `data/pilot-*.json` and `data/live-lesson-check.json` raw outputs (summarized in `docs/VALIDATION.md`).

## Next steps, in order

1. ~~Live lesson check~~ (done; see above).
2. **Freeze.** Change no prompts, skills, thresholds, budgets or model ID from this point. The study report records a SHA-256 of the source code; `--resume` refuses to continue if it changes.
3. **Run the study.** This is the command that was launched on Oct 28. Expect about $30–35 in Contributor mode and about 10–12 hours: roughly 1–1.5 h of training, then 540 exam games, limited by the API rate cap. Keep the machine awake (`caffeinate -i` on macOS) and online.
   ```sh
   MODEL_RPM=140 nohup npm run evaluate -- --mode model --split exam --seeds 12 --cap 150 \
     --training-moves 24 --training-rounds 3 --token-budget 1000000 --simulation-budget 60000 \
     --repetitions 3 --concurrency 32 --out data/model-study.json > data/model-study.log 2>&1 &
   tail -f data/model-study.log      # progress: "N/540 games · ETA … · exam spend $…"
   ```
   If it stops, rerun the same command with `--resume`. It skips finished training runs and games, but restarts any training run that was cut off midway. Ctrl-C (SIGINT) saves progress first. `--resume` refuses to continue if the code or configuration changed.
4. **Report every outcome.** Fill the Results section of `docs/SUBMISSION.md` from `data/model-study.json`: the primary contrast (classroom − adaptive) with its interval, each arm against the untrained baseline, both ablations, costs, and the planning-target decision. Report a negative or mixed result as such.
5. **Demo and submission.** A 3-minute video, a labeled replay of a real live episode, a browser check of the v0.2 UI, and final checks by Nov 4, 3 PM PST (deadline 6 PM PST).

## Known limits

- The model usually follows its skill ranking, so a classroom effect could come from tuned skill parameters rather than changed model behavior. The `no-skill-tool` and `lessons-only` ablations separate these; report them.
- The outcome checks are proxies. A failed check can be the right move, and skill estimates are noisy with few moves.
- Short model-mode rollouts (4 moves) make the gate noisy and myopic. The sealed exam is the real test.
- Lessons and skill parameters are verified together.
- The server's SQLite stores a full state blob per update. Long live runs should use the CLI, which saves after every game.
- Memory rechecks when conflicting evidence builds up are not implemented beyond same-focus replacement and manual rollback.
- Model budgets are per process (CLI: per provider), not account caps. Key spend is a local estimate; spending outside this app isn't in the ledger.
- The server is loopback-only with no authentication. The hosted build is simulation-only.
- The coding-task environment is deferred until the 2048 loop is validated.

## Demo script

Explain 2048 in one sentence. Show a real recorded live move with its context and ranking, the chosen focus and its reason, the teacher's evidence-linked (possibly uncertain) diagnosis, and the gate's accept/reject table. Run a short live exercise. Use a labeled replay and the study aggregate for the rest. State the mode on screen. Present the result plainly, including if it is negative.
