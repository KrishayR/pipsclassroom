# Validation record

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
- Total live usage during validation: about 66k tokens. No lesson check (verification) or exam has been run live yet.

The pilot's projection for the plan's full study (4 arms, 12 sealed seeds × 3 students, 150-move cap, 3 teaching rounds, baseline and two ablations) is about **107–109M tokens**, more than 90% of it exams: about $237 in Standard mode or $14 in Contributor mode, which the project now uses (see HANDOFF.md).

## v0.1 — October 27, 2026

18 passing tests; build; three-arm CLI simulation report; browser workflow; mocked API adapter. No live model requests. See git history for the full record.
