# Muse runtime checks

Normal live runs keep `MODEL_REASONING_EFFORT=low`, the planner/helper, the existing move and lesson records, and the shared request gate and spending reservations. This update does not change prompts, exam scoring, verification thresholds or the number of moves.

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

For the temporary in-app test, select **Settings → Muse / model API**, then click **Run runtime comparison · $0.25 max** in the Runtime test panel. It runs the exact default four-case pilot on a frozen copy of the first current student's notes. Progress and spending are saved automatically, including across frontend reloads. Other live actions are blocked until it finishes or stops. **Download test report** downloads the raw results; **Export classroom** in live mode also bundles the latest report under `runtime-test/report.json`. Earlier report files stay in `data/`. A backend restart interrupts this test rather than silently restarting paid calls.

The benchmark is a separate CLI experiment. It does not change normal settings, train students, or replace classroom results. It uses the same saved workspace, seeds and repetition indices for each worker/effort combination. Model choices remain stochastic: identical live scores are not guaranteed. Short pilots are insufficient to establish equivalent decision quality or learning gains.

```sh
# Show the plan; no network calls or spend.
npm run benchmark-muse

# Free workflow check; these timings do not predict Muse latency.
npm run benchmark-muse -- --simulation --moves 2 --out data/runtime-smoke.json

# Paid latency pilot, one $0.25 total cap shared across all cases.
npm run benchmark-muse -- --live --budget 0.25 --source data/live-batch-EXAMPLE/final.json
```

Default pilot: the first student, 3 development seeds, 2 repetitions, 10 moves/game, `low` and `minimal` effort, each at 3 and 6 workers (up to 240 decisions). `--all-students`, `--moves`, `--seeds`, `--repeats`, `--workers`, `--efforts`, `--source`, and `--out` are configurable. The benchmark budget must be greater than zero and at most $1. Live mode requires configured token prices and an API key. Unsupported effort values or provider errors are recorded; there is no silent fallback to another condition.

Do not run alongside other live jobs: Meta quotas are shared by the team. The benchmark checks the default local backend for an active job before starting. Other machines/processes cannot be detected automatically. It stops dispatching new games after a failed game or Ctrl+C, drains active work, and saves partial results; budget reservations account for in-flight requests.

The JSON report contains every move trajectory, per-game latency and score, invalid moves and errors, request timing diagnostics, usage, elapsed time, median/p95 decision latency, completed calls/minute and additional estimated spending. Inspect speed **and** errors/decision quality before changing the production effort setting. More independent seeds, longer games and repeated pilots are needed before claiming equivalence or a stable speedup. Normal session budgets are unchanged.
