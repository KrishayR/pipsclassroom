# Free rollout calibration

Run `npm run calibrate-gate` from the project folder. This is a separate
command-line tool; it does not change the running server, acceptance gate,
notebooks, or model configuration. It imports only the local simulation
controller and never loads `.env` or a model provider. Muse cost is zero.

For a smaller exploratory pass:

```sh
npm run calibrate-gate -- --rounds 2 --practice 3 --regression 2 --reference-boards 2 --reference-moves 80
```

Defaults compare 4, 8, 12 and 24 moves over four deterministic rounds, with
six targeted and two general boards per check. Longer references use three
targeted and three general boards per probe, capped at 150 moves. These
references start from reachable development snapshots, not sealed exam seeds
or new empty boards. Short and reference pools have separate round namespaces;
selection rounds and held-out rounds are also separate.

Eight fixed probes cover room, structure and planning, with written-rule-only
and rule-plus-strategy versions, an unchanged control, and a deliberately
reckless strategy stress control. The latter is a hypothesis, not a label:
its measured outcome determines how it is counted. The JSON saves every
workspace, board, seed, score checkpoint, utility, and verdict, plus a source
hash and fixture hash. This tool does not generate or revise lessons in
response to its results.

The short test uses the existing gate unchanged: mean targeted utility gain
at least 1, mean general utility gain at least -2. Its prediction is compared
with a separate operational reference: positive mean targeted score gain
and nonnegative mean general score gain in the longer continuations. The
report also records the longer utility-based gate verdict, so score and
utility disagreements remain visible. This reference is noisy, not ground truth.

The first half of rounds selects the shortest length with at least 80%
agreement, zero false accepts, and at least two beneficial and two
nonbeneficial probe/round observations. That single choice must meet the
same requirements on the held-out half. A failed holdout produces no
recommendation; the tool does not pick a replacement using holdout data.
An all-negative panel cannot produce a recommendation from high agreement
alone. Probe families repeat across rounds, so counts are not independent
teaching experiments or statistical confidence intervals.

All short lengths reuse deterministic trajectory prefixes to avoid replaying
the same moves. Per-length decision counts and prefix timings show relative
work; prefix timings are not independent wall-time benchmarks. Reference
truncation is retained per row. More boards, rounds, and genuinely varied
teacher proposals would be needed before drawing broad conclusions.

Results go to a timestamped JSON and readable Markdown file in ignored
`data/`. Use `--out data/my-calibration.json` to choose a filename.
Use `--help` for options. Raw results remain local unless explicitly shared.

No setting is applied automatically. Treat any recommendation as a
simulation-only hypothesis, confirm with Muse under a separate budget, and
freeze the chosen protocol before a formal evaluation. Do not tune on sealed
exam results or lower the acceptance bar to obtain a positive result.
