# Validation record

## October 30, 2026 — Contextual review and longer games

All 79 tests, TypeScript and the production build pass. Tests assert that sparse
evidence still reaches a recorded peer and teacher, observed continuations remain
within the evidence episode, contextual lessons bypass the legacy recommendation
filter, longer practice reaches review, and exams remain separate. The automatic
correction-count and proposal-coverage cutoffs are removed. Source-specific fresh
controlled exams use 100 moves. No live benchmark was started; usefulness and
longer-run cost remain unmeasured. See [current design](CONTEXTUAL_REVIEW.md).

## October 30, 2026 — Conservative teaching diagnosis

All 76 tests passed, with the affected diagnosis/session checks rerun after final
recording changes. TypeScript and the production build pass. Tests cover sparse
perfect evidence, unavoidable outcomes, distinct-board recurrence, supported
interventions, verified teacher facts, no-lesson responses and candidate-free
batches completing exams. No paid trial was started. See [diagnosis](TEACHING_DIAGNOSIS.md).

## October 30, 2026 — Lesson versus chance button

All 70 tests, TypeScript checking and the production build pass. Offline checks
cover frozen historical workspaces, the matched two-control design, fresh seeds,
18 saved games, complete move trajectories, planner-free policy enforcement,
the six-game limit and stopped partial records without a complete summary.
No paid check was started. See [experiment design](LESSON_CHANCE_CHECK.md).

## October 30, 2026 — Integrate conditional lessons with Classroom Sessions

Merged main's conditional lesson limits, recommendation logic, calibration probes
and CLI batch runner with parallel Classroom Sessions, exam trajectories and
planner-condition records. Both environment flags share studentHelper(): either
MODEL_STUDENT_HELPER=off or MODEL_USE_PLANNER=false disables rankings. The Policy
usesHelper field is shared by all paths. Planner-free teachers preserve current
strategy parameters and teach through rules, exceptions and validated limits.

All 68 tests, TypeScript checking and the production build pass. Coverage includes
conditional move bounds, no-helper impact-check bypass, both environment flags,
full planner-free sessions, revisions, frozen peers, concurrency and partial saves.
No paid experiment was started; learning effectiveness remains unproven.

## October 30, 2026 — Planner-free browser runs

All 65 tests, TypeScript checking and the production build pass. A fake-provider
Classroom Session verifies that all decision stages omit sampled skill rankings,
record zero planner transitions, preserve strategy weights and send planner-free
instructions to original/revision teachers. Batch and classroom records identify
the planner condition. Local ignored configuration disables the planner; no
paid benchmark was started. See [planner-free runs](PLANNER_FREE.md).

## October 30, 2026 — Classroom Session and Individual Cycles

All 64 tests, TypeScript checking and the production build pass. A frozen
Classroom Session executed serially and concurrently preserves deterministic
student moves, lesson outcomes, verification trajectories and logical usage.
Tests check frozen peer traces/notebooks, separate student memory, the shared
six-slot teaching limit, cumulative sessions, individual Ada/Lin/Sam rotation,
exam trajectories, stopped work and failed-session partial records. No live
Muse speed or learning benchmark was started. See [session modes](CLASSROOM_SESSION.md).

## October 30, 2026 — Rejection feedback, one revision, and exam trajectories

All 60 tests pass (59 in the full suite, plus the final successful-revision
installation check); TypeScript checking and the production build pass.

Offline coverage checks that the teacher receives paired rejection trajectories,
the revision cannot retry a second failure, revised test starting boards and seeds
are disjoint from the original, and a provider failure preserves the rejection
without changing memory. Existing study protocols remain opt-in for revision.
Saved batch exams include one trajectory entry per completed move. Concurrent
and sequential trajectories remain equivalent after normalizing generated lesson
IDs. No paid calls are required for these checks. Live learning benefit remains
unvalidated. See [lesson revision](LESSON_REVISION.md).

## October 30, 2026 — Six-way verification and bounded planning cache

All 55 tests, TypeScript checking, and the production build pass. Live
configuration keeps three student workers and permits six independent
verification workers, behind one shared six-request provider gate and the
existing rate/budget controls. The deterministic end-to-end test compares
one, three, and six verification workers and preserves moves, evidence,
verification rows/verdicts, exam scores, and logical planning usage.

A 512-entry LRU caches deterministic rankings only. Tests compare cache hits
and misses with uncached results across boards, strategies, seeds, planning
budgets and action orders, plus mutation isolation, validation and eviction.
Recorded experiment history and fresh Muse calls are unchanged. No paid
requests were made for validation; live speed improvement remains unmeasured.

## October 30, 2026 — Local gate calibration tool

All 52 tests, TypeScript checking, and the production build pass. Calibration
tests cover invalid configurations, held-out selection safeguards, exact
agreement with the existing verification calculation, unchanged controls,
disjoint short/reference seeds, and recorded reference scores.

A small pilot (two rounds, three targeted/two general short boards, two
reference boards per split, 80-move reference) completed in 38.7 seconds with
14,060 local decisions, zero API calls, and zero Muse spending. It compared
4/8/12/24 moves and made no recommendation because selection rounds lacked
enough beneficial examples. The live gate was not changed. Per-board records
and the readable report are local: `data/gate-calibration-pilot.json` and
`data/gate-calibration-pilot.md`. See [Gate calibration](GATE_CALIBRATION.md).

## Combined lesson-influence and concurrency merge

All 49 automated tests, TypeScript checking, and the production build pass
with the lesson-influence improvements and parallel batch runner together.
Preserved move facts, focus-based triggers, sensitivity correction, citation
counts, bounded concurrency, isolated usage, and in-flight budget reservations.
Validation used fake model calls; the running server was not restarted.

## October 30, 2026 (evening) — Conditional lessons, calibration, live batches

See [Conditional lessons](CONDITIONAL_LESSONS.md). 62 tests and the build pass. The full gate calibration ran in 171 s (95,635 local decisions, $0) and made no recommendation: 0 false rejects at 4/8/12/24 moves, 0/22 beneficial holdout probes. Live with the helper, 3 cycles: all 6 candidates were rejected ($0.158, 817 calls, 0 invalid actions). Live without the helper: interrupted by a network failure after 1 cycle ($0.187, 478 calls, 0 invalid actions); large general-board swings with zero lesson citations show the gate is noise-dominated in that mode.

## October 30, 2026 — Lessons that change behaviour

See [Lesson influence](LESSON_INFLUENCE.md). On this machine, 36/36 tests and the build passed on the merged `main` before the change, and 41/41 after. In simulation, the focused practice → Discuss → lesson test flow ran with a real Sam → Lin peer exchange. Live with Muse (classroom arm, Contributor mode), the same flow before the fixes produced a lesson that changed no move on any targeted board (rejected; $0.036, 107 calls). After the fixes, the lesson changed Muse's play on 3 of 6 targeted boards but lowered utility (targeted −3.25, general −2.25), and the unchanged gate rejected it ($0.025, 107 calls, 0 invalid actions, 0 errors). No lesson has been accepted live yet.

## October 29, 2026 — Configurable concurrent live batches

All 44 tests, TypeScript checking, and the production build pass. New coverage
checks configurable batch archives, exact deterministic sequential/parallel
equivalence, three overlapping requests, per-operation token accounting,
stop/error draining, and reservations against batch and key spending limits.
No paid model requests were used for these checks. See [Live batch guide](LIVE_BATCH.md).
Live throughput and performance improvement remain unmeasured.

## October 29, 2026 — Focused practice

See [Focused practice handoff](FOCUSED_PRACTICE_HANDOFF.md) for the diagnostic
stage, implementation details, and evaluation boundaries. All 36 automated
tests, TypeScript checking, and the production build pass. A browser
simulation completed focused practice, an evidence-based Sam → Ada peer
contribution, and verification with zero model calls. The unchanged gate
rejected the candidate. The new flow has not yet been validated live.

## October 29, 2026 — Windows checkout and live teaching check

See [Live teaching check](LIVE_TEACHING_CHECK.md) for the complete small-run
configuration and results. All 32 automated tests and the production build
passed after fixing Windows environment-file line endings. Live teacher
review and all eight verification pairs completed; the candidate was rejected
(targeted utility +0.4167, general utility 0). Ada's notebook stayed unchanged.
Independent 25-move exam scores were 176 before feedback and 148 afterward;
this is repeat-run variation, not evidence of adopted learning. No peer was
eligible. The experiment used an estimated $0.04287.

## v0.2 — October 28, 2026

Software (Node 24, local):

- `npm test`: 27 passing, 0 failing. New checks cover the 80/20 scheduler, targeted exercises, tagged snapshot pools, agent-failure episodes, same-focus memory replacement, median/milestone/truncation summaries, paired contrasts, provided model context, `lesson_id` validation, the no-skill ablation, truncated replies, and the one-correction rule.
- `npm run build`: TypeScript check and production build pass.
- `npm run evaluate -- --seeds 2 --cap 1500 --training-rounds 3 --simulation-budget 60000 --out docs/simulation-evaluation.json`: four arms plus an untrained baseline and the lessons-only ablation. Mean scores: untrained 5,352; solo 5,352; teacher 6,798; adaptive 5,352; classroom 8,215. Lessons accepted: 0, 1, 0, 1. Primary contrast (classroom − adaptive): +2,863, 95% interval [0, 6,949] over 6 pairs, one repetition, so the planning target is not met and the result is exploratory. This is a deterministic heuristic. It tests the software, not LLM learning. With the default 30,000-transition ceiling, three teaching rounds do not fit (each simulation lesson check costs about 14k transitions), and every arm reports that ceiling as a training error.
- Local API: health reports the model as available and returns both protocol configurations; the four-arm `arm` action is accepted.

Live Meta Model API (`muse-spark-1.3`, `https://api.meta.ai/v1`, `reasoning_effort: low`):

- A first key returned HTTP 401 `invalid_api_key`. A replacement key worked.
- `reasoning_effort: "none"` is rejected for this model. Accepted values are `minimal | low | medium | high | xhigh | max`. On one short probe, `minimal` and `low` both used the full 2,000-token cap on reasoning.
- v0.1 adapter defects found live and fixed: (1) the 1,200-token completion cap was consumed by hidden reasoning (`finish_reason: length`); (2) the empty truncated reply was echoed back and rejected with HTTP 400.
- v0.1 adapter, one decision: 3 calls, 4.6k tokens, 6.1 s, valid move.
- v0.2 adapter (context provided up front), 16 live decisions across two pilots: 2.7–2.8k tokens and 1.9–2.0 calls per decision, p50 2.7–3.5 s, p95 4.0–7.3 s, 0 invalid actions. The model called `run_skill` in 15 of 16 decisions.
- Teaching cycle: the first attempt failed teacher validation ("exceeds limits"), before the one-correction rule existed. After the fix, a full cycle succeeded: focus choice, a 2-move targeted exercise, a teacher diagnosis flagged as uncertain and citing real move IDs, and a candidate raising `spaceWeight` 12 → 16. About 2.5k tokens excluding exercise moves. No peer was eligible after only one practice move each.
- Contributor mode (`muse-spark-1.3-contributor`), one decision through the key pool: legal move via `run_skill`, 2 calls, 2.4k tokens (881 cached), 6.2 s, logged at $0.0002 against key 1.
- Live lesson check (Contributor mode, classroom arm, Oct 28): 18 practice moves (0 invalid), focus "Preserve room" chosen for Ada, a 4-move targeted exercise, a teacher diagnosis citing real moves and flagged as uncertain, no eligible peer, and a candidate ("Keep extra breathing room when the board is crowded") **rejected** by the gate: practice Δ −1.08, regression Δ 0.00 over 6 + 2 pairs with no errors. 87 calls, 211k tokens (52% hidden reasoning, 46k cached), $0.029, 18.5 minutes. Model decisions took about 10–13 s each.
- The sealed study was started from commit `3d9b516` and stopped on request after about 5 minutes, before any training run or exam game completed. No results; the sealed seeds were never used by an exam.
- Total live usage before the study: about 300k tokens (roughly $0.05 at the prices in effect). No live exam had been run before the sealed study.

The pilot's projection for the plan's full study (4 arms, 12 sealed seeds × 3 students, 150-move cap, 3 teaching rounds, baseline and two ablations) is about **107–109M tokens**, more than 90% of it exams: about $237 in Standard mode or $14 in Contributor mode, which the project now uses (see HANDOFF.md).

## v0.1 — October 27, 2026

18 passing tests; build; three-arm CLI simulation report; browser workflow; mocked API adapter. No live model requests. See git history for the full record.
