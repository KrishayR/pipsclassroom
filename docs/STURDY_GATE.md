# A sturdier lesson test for no-helper mode — October 30, 2026

## Why

Without the helper, Muse's moves are stochastic. The two paired games in a lesson test (current notes vs candidate) can differ for reasons unrelated to the lesson. In the first no-helper live batch, Muse cited no lesson at all, yet the general-board results swung between −9.5 and +7.25. With only 2 general boards, one random swing decided the verdict. The gate was measuring noise.

## What changed

All changes make the gate stricter; none loosen it.

- **Repeats.** Each paired comparison can be run several times on the same board and spawn stream (`repeats`), and the results are averaged. Every run's utility is stored (`baselineRuns`, `candidateRuns`); move-by-move records keep the first run.
- **Noise guard.** When `repeats > 1`, a lesson must also show a targeted gain greater than **2 standard errors** across boards (`NOISE_GUARD_SE = 2`), in addition to the unchanged rules: targeted mean ≥ +1 and general mean ≥ −2. Each verification records its measured noise (`noise.targetedSE`, `noise.generalSE`).
- **No-helper defaults** (`MODEL_STUDENT_HELPER=off`): **10 targeted + 4 general boards, 2 repeats**, 4 moves each. That's 224 decisions per lesson test, against 64 before. With the helper, the gate is unchanged (6 + 2 boards, 1 run), because moves anchored to the deterministic ranking are not noisy. Override with `VERIFY_PRACTICE`, `VERIFY_REGRESSION` and `VERIFY_REPEATS`.

**If your `.env` was copied from an older `.env.example`**, it may contain `VERIFY_PRACTICE=6` and `VERIFY_REGRESSION=2`. Those lines override the no-helper defaults. Remove them, or comment them out.

## How the settings were chosen

The settings were chosen with free simulations of deliberately noisy students. Development boards only; no API calls.

**Pure noise:** a random-move student that ignores its notes, so any "gain" is chance. 200 trials each.

| Gate                                   | Noise lessons accepted | Mean general-board swing |
| -------------------------------------- | ---------------------: | -----------------------: |
| Old: 6 + 2 boards, 1 run               |              **26.0%** |                     4.20 |
| 6 + 4 boards, 3 repeats, guard 1 SE    |               12.5–17% |                     1.93 |
| 6 + 4 boards, 3 repeats, guard 1.65 SE |                   8.0% |                        — |
| 6 + 4 boards, 3 repeats, guard 2 SE    |                   5.0% |                        — |
| 6 + 4 boards, 5 repeats, guard 2 SE    |                   5.5% |                        — |

Five repeats did not beat three. Most of the noise comes from differences between boards, not between repeats on one board.

**Power:** a noisy student that plays the planned (good) move with probability _p_ and a random move otherwise. The lesson raises _p_, so it genuinely helps. 150 trials each.

| Gate (2 SE guard)                      | Decisions per test | Noise accepted | Moderate lesson (30% → 60%) | Strong lesson (30% → 90%) |
| -------------------------------------- | -----------------: | -------------: | --------------------------: | ------------------------: |
| Old: 6 + 2 boards, 1 run (no guard)    |                 64 |            26% |                         55% |                       85% |
| 6 + 4 boards × 3 repeats               |                240 |             1% |                         25% |                       70% |
| **10 + 4 boards × 2 repeats (chosen)** |            **224** |         **2%** |                     **25%** |                   **78%** |
| 12 + 6 boards × 2 repeats              |                288 |             3% |                         27% |                       84% |

**The trade-off.** The old gate accepted pure noise about a quarter of the time. The sturdy gate almost never does, so an accepted lesson can be trusted. The cost is that it misses more moderately helpful lessons (about 25% caught instead of 55%). Strong lessons still usually pass. Percentages vary by a few points between seeds, because each estimate uses 150–200 trials. A random-move student is far noisier than Muse, so these are worst cases.

## Cost

In no-helper mode, a lesson test is 224 decisions instead of 64, about 3.5×. At recent no-helper rates (about $0.0004 per call) that is roughly $0.09 per test. A revision doubles it. Verification runs up to 6 requests at once, so wall time grows less than proportionally.

## Live run with the sturdy gate (no helper, 1 cycle, October 31)

$0.228, 634 calls, 0 invalid moves, 63 minutes (52 of them in verification). Raw results (ignored by Git): `data/batch-nohelper-sturdy/live-batch-1793402699815/final.json`.

| Lesson                                                                           | Targeted (SE) | General | Result   |
| -------------------------------------------------------------------------------- | ------------: | ------: | -------- |
| Ada: "Keep the corner on crowded boards instead of chasing a small merge" (2, 4) |  −0.05 (0.40) |   −2.75 | rejected |
| Revision: "…only when it costs no points" (2, 0)                                 |  −1.73 (1.37) |   −3.81 | rejected |

Muse cited neither lesson, and its moves were identical on 6 of 10 targeted boards. Without the helper, Muse does not act on its lessons, and the sturdier gate correctly finds no gain. The team uses helper mode (docs/LESSON_ACCEPTANCE.md); this gate remains the setting for any no-helper run.

## Not yet done

- A live noise check (a lesson that changes nothing, under both gates) would confirm that the gate behaves with Muse as simulated. It would cost about $0.10.
- The sturdy gate must be frozen with the rest of the protocol before any study.
