# Handoff — October 28, 2026 (v0.2)

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
git clone https://github.com/KrishayR/consequencelab.git && cd consequencelab
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
