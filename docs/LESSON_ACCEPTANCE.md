# Getting lessons accepted — November 1, 2026

Branch: `fix/lesson-aware-agent-learning`. The lesson test (gate) and its threshold are **unchanged**.

## Why every lesson had been rejected

The lessons themselves did not help, so rejecting them was correct. Free simulations on development boards showed why:

- **Rule-only lessons cost points.** A written rule (for example "keep the corner") overrides the planner's move, which is usually already fine. On its own, a rule lowered the 4-move test score by about 1.
- **The teacher's strategy changes were not improvements.** Typical changes (a little more structure or space weight) were neutral or harmful.
- **Better strategies do exist.** Paired full games over 40 development seeds, simulation student, compared with the default strategy (depth 2, space 12, merge 1, structure 1):

| Strategy change                  | Full-game score change | 4-move test: acceptance by focus (space / structure / planning) |
| -------------------------------- | ---------------------: | --------------------------------------------------------------: |
| Default + rule only (control)    |                      0 |                                           8–30% / 0–20% / 0–20% |
| depth 3, space 6, merge 8        |         +2,591 ± 1,053 |                                                 40% / 50% / 60% |
| depth 3, space 4, merge 8        |         +2,639 ± 1,050 |                                                 40% / 55% / 60% |
| depth 3, space 4, merge 8, str 2 |           +3,734 ± 865 |                                                 40% / 50% / 40% |
| depth 4, space 4, merge 8        |           +3,389 ± 926 |                                                 25% / 25% / 50% |
| space 6, merge 8                 |         +2,049 ± 1,154 |                                                 25% / 33% / 42% |

The default strategy undervalues points (merge weight 1 against space 12) and looks only 2 moves ahead. The changes above win more points over full games and also raise the short test's score, which counts points, survival and room. Some changes win full games but fail the short test (for example structure 3 with merge 4: +4,326 points, about 20% acceptance), so the short test is a conservative proxy.

## What changed

1. **Free strategy experiments** (`strategyExperiments` in `src/core/policy.ts`). Before each review and revision, the five screened strategy changes above (`STRATEGY_PROBES`) are each played against the student's current strategy. They use the same paired 4-move rollouts and the same utility as the test, on 12 targeted + 4 general **experiment boards**. The test never uses these boards. This makes no model calls; the results are posted as a "Free strategy experiments" message. Probes that would not change the current strategy are skipped. Skipped without the helper.
2. **The Muse teacher sees the results** as `strategyExperiments`. It is told that adopting a change that gained on both board types is backed by evidence, and to keep the written rule narrow.
3. **The simulation teacher adopts** the best experiment with a net gain, keeps it exactly as tested (no peer averaging and no strengthening loop), and sets narrow limits `{minOptions: 4, maxGainLoss: 0}`. A revision tries a different experiment from the rejected one.
4. **Live students follow the lesson plan** (the branch's earlier commit). Muse receives `lessonPlan`, so a strategy change in a lesson reaches Muse's moves.

The gate is the same: the lesson test still runs on its own boards, with the same threshold (targeted ≥ +1, general ≥ −2) and sizes.

## Simulation result (9 teaching cycles, 3 per student, live protocol sizes, revision on)

| Before                         | After                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| 0 accepted in earlier sim runs | **Every student's first cycle ended with an accepted lesson** (3 of 3)             |
|                                | Later cycles were rejected: once a student has improved, further changes help less |

The accepted strategies are the ones that also win full games, so acceptance reflects real improvement and not only the short test.

## Live check (Muse, helper on, 3 Individual Cycles, revision on, Contributor mode)

$0.151, 752 calls, 0 invalid moves. Raw results (ignored by Git): `data/batch-experiments/live-batch-1793605037606/final.json`.

| Student | Lesson (strategy · limits)                                                                 | Targeted / general | Result       |
| ------- | ------------------------------------------------------------------------------------------ | -----------------: | ------------ |
| Ada     | "Keep the corner when a small merge tempts you…" (depth 3, space 6, merge 8 · 3, 16)       |       +1.25 / 0.00 | **accepted** |
| Lin     | "Keep max in corner when points are close" (depth 2, space 6, merge 8, structure 4 · 3, 8) |       −2.08 / 0.00 | rejected     |
| Lin     | Revision (depth 3, space 6, merge 8 · 4, 4)                                                |      −4.08 / +6.50 | rejected     |
| Sam     | "Keep your corner when points are close" (depth 2, space 6, merge 8 · 3, 16)               |       +0.92 / 0.00 | rejected     |
| Sam     | Revision "Keep the corner only when you stay open" (default strategy, structure 2 · 4, 8)  |      +2.08 / +9.25 | **accepted** |

- **The first live acceptances.** Two of three students saved a lesson. Before this change, all 11 earlier live candidates had been rejected.
- **Ada's** accepted lesson adopted the best free experiment exactly.
- **Muse partly followed the experiments.** Lin's first lesson mixed in its own changes (structure 4, depth 2 kept), and Sam's first used the merge and space values without depth 3.
- **Sam's accepted revision was not an experiment.** It returned to the default strategy with structure 2. Treat that acceptance with caution: with 6 + 2 boards, the gate also passes some lessons by chance (about 8–25% for a neutral lesson in simulation).
- **Exams:** means were 149, 168, 160 and 163 (baseline, then after each cycle). These are 25-move exams on one development seed, so they cannot show a real difference.

## Limitations

- The probe list was chosen offline using development seeds. It is fixed in code before any study and contains no sealed seeds.
- The teacher now mostly chooses among tested strategies instead of inventing them. That is learning from experiments, not free-form insight; describe it that way.
- Acceptance is about 40–60% per attempt, so some lessons will still be rejected.
