# Handoff — October 28, 2026 (v0.2)

Written for whoever picks up the project next: a teammate, a judge reading the repository, or a future session.

## Current state

The plan's software is complete and runs end to end in simulation. The live Meta Model API integration works in Contributor mode (`muse-spark-1.3-contributor`) for student moves and a full teacher review. **No live lesson check, exam or study has completed yet.** There is no evidence yet, positive or negative, that the classroom helps an LLM. The simulation reports in `docs/` are mechanism checks only. In the current one, every simulated group rejected all of its candidate lessons, so every group matches the untrained baseline.

At the time of this handoff, a live lesson check was running locally (one classroom: 18 practice moves, review, 64-decision verification). It writes `data/live-lesson-check.json`, which Git ignores. Its outcome is not part of this commit.

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

## Configuration (local `.env`, not committed)

`MODEL_ID=muse-spark-1.3-contributor`; prices $0.10 input / $0.002 cached / $0.20 output per 1M tokens. Contributor mode lets Meta train on prompts and responses and limits the team to 150 requests per minute. Every arm must use the same model ID. See `.env.example` for all settings.

Sealed final exam seeds: `data/sealed-exam-seeds.json` (12 seeds, not committed). SHA-256 `75e71b7451df0867b080fd6f3d810ed972190403de21f5d51a35499091186066`. Publish this hash before results. Don't regenerate the file unless no exam has used it.

## Next steps, in order

1. **Finish the live lesson check.** Confirm practice, review and verification complete with real calls, and that the verification table is recorded. Rejection is an acceptable outcome; a crash is not.
2. **Freeze.** After step 1, change no prompts, skills, thresholds, budgets or model ID. The study report records a SHA-256 of the source code; `--resume` refuses to continue if it changes.
3. **Run the study** (about $15–25 in Contributor mode; about 9–12 hours, bound by the rate limit):
   ```sh
   MODEL_RPM=140 npm run evaluate -- --mode model --split exam --seeds 12 --cap 150 \
     --training-moves 24 --training-rounds 3 --token-budget 1000000 --simulation-budget 60000 \
     --repetitions 3 --concurrency 16 --out data/model-study.json
   ```
   If it stops, rerun the same command with `--resume`.
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
