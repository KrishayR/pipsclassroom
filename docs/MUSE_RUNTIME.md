# Muse runtime checks

Normal live runs keep `MODEL_REASONING_EFFORT=low`, the planner/helper, the existing move and lesson records, and the shared request gate and spending reservations. This update does not change prompts, exam scoring, verification thresholds or the number of moves.

`MODEL_STUDENT_REASONING_EFFORT` overrides reasoning for student **moves** only. `MODEL_TEACHER_REASONING_EFFORT` controls teaching, peer feedback and review/reflection calls. Both fall back to the legacy `MODEL_REASONING_EFFORT` (default `low`). Role settings are recorded in diagnostics, and resume rejects a change of reasoning settings for an existing session. Normal settings remain low/low until the longer student comparison is reviewed.

## Independent exam games

`MODEL_EXAM_CONCURRENCY=6` (range 1–6) lets classroom exams dispatch games across all selected seeds together. Moves inside each game stay sequential; every game uses its own board, RNG, recent-move context and frozen workspace. Results remain ordered by seed and student. The visible student board follows the last configured exam seed so concurrent games do not overwrite it unpredictably.

With three students and only one seed, there are only three games, so six workers cannot help. Use at least two exam seeds to expose six independent games. Increasing the seed count also increases calls and cost; concurrency itself does not reduce required calls. Study-runner exam concurrency remains its existing `--concurrency` setting under the shared six-request gate.

Resume retains the saved protocol. Older checkpoints without an exam-worker setting retain their original worker count rather than silently changing a running experiment.

## Request diagnostics

New live-run exports and **Saved run details** include:

- Requests queued, active, completed and failed.
- Time waiting for a request slot and the configured RPM limiter.
- Time awaiting response headers and reading/decoding response bodies.
- Retry delays and counts of rate limits, server errors and transport errors.
- The reasoning effort used.

These are sums across requests, so overlapping requests can total more than wall-clock run time. Header/body time includes network and provider work; it does not isolate server inference. A long provider wait cannot be fixed by raising the local RPM limit. Timing uses counters and monotonic clocks, without per-request files, new model calls or payload/key logging.

## Controlled latency pilot

### Current Settings panel: long learning test

The Settings panel now offers **Start 5-hour learning test · $20 max** instead of the completed reasoning-comparison panel. It starts a fresh classroom, with planner enabled and low reasoning for both student moves and teaching. All three students learn per cycle; cycles remain sequential, while verification can use six requests and exams use six independent games (3 students × 2 development seeds, up to 300 moves each). The $20 ceiling applies only to this timed experiment; ordinary session batches retain their configured budget (default $1).

The runner dispatches up to 100 cycles but stops new work after five hours or when the estimated budget is exhausted. Pending requests drain before the final partial snapshot is written. The classroom progress bar shows elapsed time within the window, not completed-learning percentage. Stop and Export remain available. A backend restart interrupts the run; resume reuses the original deadline and cannot extend it. Keep the backend running and computer awake. This is a longitudinal exploratory run, not a controlled demonstration of classroom advantage; repeated capped exams alone do not establish full-game gains.

Only the five-hour action enables these optimizations:

- Baseline, an exam every two cycles, and a final assessment after an unexamined last cycle. Teaching and verification remain every cycle. Cycles without exams explicitly store `examSkipped: true` and no exam rows. The final 45 minutes are reserved for assessment; slow active work or budget exhaustion can still leave it partial, recorded as such.
- Student request rankings use a columnar table that retains every field and number. Full object-form context and all trajectories remain in recorded evidence. No facts, lessons, verification thresholds or token caps are dropped. Teaching prompts remain unchanged. Live performance with this alternate encoding still needs checking.
- Request slots start at six. After a fully drained stage, measured response latency and low pacing wait may justify up to nine verification slots, targeting at most 85% of the existing RPM pacing limit. Insufficient samples or rate/transport/server errors retain or restore six slots. Actual limits are recorded; the request-rate limiter and spending reservations are unchanged. Six independent exam games still use at most six slots.

Normal classroom and study protocols retain their existing exam cadence, prompt format and six-slot limit. An offline regression compares identical practice traces, lesson rules, parameters and verification outcomes with vs without the intermediate exam. This establishes deterministic isolation, not identical stochastic live outcomes.

### Earlier latency and student-reasoning pilots

The completed four-case speed pilot has been replaced in the UI. Select **Settings → Muse / model API**, then click **Test student reasoning · $2 max**. It runs low and minimal student moves with six workers, on the same frozen first-student notes, 3 seeds and 2 repetitions: 12 games, up to 150 moves each (1,800 decisions), sharing one $2 cap. Teacher/peer settings stay low; this exam-only test does not call teachers or peers. Normal student settings remain low. Results screen latency, errors and scores, not full-game equivalence or learning. Progress includes live move counts, throttled to at most one update per three seconds; completed games save automatically.

Frontend reloads retain progress. Other live actions are blocked until the test finishes or stops. **Download test report** downloads raw results; **Export classroom** in live mode also bundles the latest report under `runtime-test/report.json`. Earlier speed-pilot files remain in `data/`; the new test uses a separate `student-reasoning-test-latest.json` status record. A backend restart interrupts this test rather than silently restarting paid calls.

The benchmark is a separate CLI experiment. It does not change normal settings, train students, or replace classroom results. It uses the same saved workspace, seeds and repetition indices for each worker/effort combination. Model choices remain stochastic: identical live scores are not guaranteed. Short pilots are insufficient to establish equivalent decision quality or learning gains.

```sh
# Show the plan; no network calls or spend.
npm run benchmark-muse

# Free workflow check; these timings do not predict Muse latency.
npm run benchmark-muse -- --simulation --moves 2 --out data/runtime-smoke.json

# Paid latency pilot, one $0.25 total cap shared across all cases.
npm run benchmark-muse -- --live --budget 0.25 --source data/live-batch-EXAMPLE/final.json

# The longer two-condition test used by the replacement UI button.
npm run benchmark-muse -- --live --budget 2 --workers 6 --efforts low,minimal --moves 150 --seeds 3 --repeats 2
```

Default pilot: the first student, 3 development seeds, 2 repetitions, 10 moves/game, `low` and `minimal` effort, each at 3 and 6 workers (up to 240 decisions). `--all-students`, `--moves`, `--seeds`, `--repeats`, `--workers`, `--efforts`, `--source`, and `--out` are configurable. The benchmark budget must be greater than zero and at most $2. The in-app button uses a $2 total cap; the CLI still defaults to $0.25 unless overridden. Live mode requires configured token prices and an API key. Unsupported effort values or provider errors are recorded; there is no silent fallback to another condition.

Do not run alongside other live jobs: Meta quotas are shared by the team. The benchmark checks the default local backend for an active job before starting. Other machines/processes cannot be detected automatically. It stops dispatching new games after a failed game or Ctrl+C, drains active work, and saves partial results; budget reservations account for in-flight requests.

The JSON report contains every move trajectory, per-game latency and score, invalid moves and errors, request timing diagnostics, usage, elapsed time, median/p95 decision latency, completed calls/minute and additional estimated spending. Inspect speed **and** errors/decision quality before changing the production effort setting. More independent seeds, longer games and repeated pilots are needed before claiming equivalence or a stable speedup. Normal session budgets are unchanged.
