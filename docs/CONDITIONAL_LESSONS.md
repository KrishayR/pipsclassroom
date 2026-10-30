# Conditional lessons, gate calibration and the no-helper option — October 30, 2026

This update follows the four-step plan agreed after every live candidate had been rejected.

## 1. Conditional lessons

A lesson now has **limits**: `{ minOptions, maxGainLoss }`. It steps in only when the move the student would otherwise make **breaks its skill**. Its recommended moves then keep the skill, leave at least `minOptions` legal moves, and give up at most `maxGainLoss` immediate points compared with the best-scoring legal move. A lesson never overrides a move that already keeps its skill.

- `lessonMoves(lesson, board)` computes the recommended moves deterministically, before the spawn. The simulation student (`plannedMove`), the free impact check and the model prompt all use it.
- Model students see each applicable lesson's `limits` and `recommendedMoves`, and are told to use them only when their own choice breaks the skill. They cite `lesson_id` only when a lesson changed their choice.
- The model teacher must return `limits` based on the evidence. A revision after rejection is told to narrow them (raise `minOptions` or lower `maxGainLoss`). The simulation teacher starts at `{3, 8}` and narrows on revision.
- Lesson cards show the limits.

Simulation flow (focused practice → Discuss → test, Lin, structure, Sam as peer):

| Lesson form                              | Targeted Δ | General Δ | Worst targeted board |
| ---------------------------------------- | ---------: | --------: | -------------------: |
| Rigid "keep the corner" (Oct 30, before) |      −7.67 |     −2.33 |                −53.5 |
| Conditional, limits {3, 8}               |      −0.17 |     −2.33 |                 −8.5 |

The conditional form removed the large loss, but the lesson was still rejected.

## 2. Free gate calibration (`npm run calibrate-gate`, full defaults)

The calibration added conditional probes for each skill: 11 fixed probes, 4 rounds, 4/8/12/24-move short tests compared with longer development games (up to 150 moves). It ran in 171 s and made 95,635 local decisions, with no API calls and $0 spent.

| Short test | Holdout agreement | False accepts | False rejects | Lessons that helped (holdout) |
| ---------: | ----------------: | ------------: | ------------: | ----------------------------: |
|    4 moves |             90.9% |             2 |             0 |                        0 / 22 |
|    8 moves |             90.9% |             2 |             0 |                        0 / 22 |
|   12 moves |             90.9% |             2 |             0 |                        0 / 22 |
|   24 moves |             95.5% |             1 |             0 |                        0 / 22 |

The tool made no recommendation because there were too few beneficial examples. Across all rounds, almost every probe lowered longer-game scores. Structure lessons lowered them most: about −125 for the rigid rule and −84 for the conditional rule, in mean targeted score. A few probe/round pairs helped, with no consistent pattern.

**Conclusions.**

- The short test did not reject any lesson that helped over long games (0 false rejects at every length). The hypothesis that 4-move tests are too short is **not supported**. If anything, the test is slightly lenient.
- With the helper, these simple lessons do not improve on the default strategy, so rejecting them is correct. **Decision: keep 4-move model rollouts.**

These results use simulation with fixed synthetic probes, not Muse or teacher-generated lessons.

## 3. Live batch

`npm run live-batch -- --cycles 3 [--root dir]` runs the existing budgeted batch runner from the command line, without the server. It uses the same protocol and the same $1 cap as the Classroom button. Do not run it alongside the server's batch; both spend from the same key ledger.

Results: see the "Live results" section below.

## 4. No-helper option

`MODEL_STUDENT_HELPER=off` gives students no move ranking. They decide from the board, the board facts, the per-move facts, and their lessons with recommended moves. Lessons have more room to help there, and it tests whether Muse itself learns rather than the calculator.

- The teacher is told that parameter changes have no effect, and to put the improvement in the rule, the exception and the limits.
- The free impact check is skipped, because it predicts moves from the ranking.
- In the study runner, the `no-skill-tool` ablation is skipped because it would be redundant.
- Every arm of a study must use the same setting. Choosing it is a design decision to make before the study.

## Live results

Both runs used Contributor mode, the classroom arm, 3 cycles (one per student), revision enabled, and 25-move exams on one public development seed.

### With the helper (complete; 26 minutes, $0.158, 817 calls, 0 invalid actions)

| Student | First lesson (limits)                                  | Targeted / general | Revision (limits)                                         | Targeted / general |
| ------- | ------------------------------------------------------ | -----------------: | --------------------------------------------------------- | -----------------: |
| Ada     | Keep your corner even for a big merge (2, 96)          |      −2.83 / −2.25 | Keep your corner when it is cheap… (3, 32)                |       +0.17 / 0.00 |
| Lin     | Pick the close-score move that keeps structure (2, 28) |       −1.00 / 0.00 | Keep structure only when you give up few points (3, 8)    |      −3.08 / −1.75 |
| Sam     | Keep the big tile pinned when points are tied (2, 16)  |     −5.33 / −10.50 | Only keep the corner when points and room are tied (3, 4) |        0.00 / 0.00 |

All six candidates were rejected. Every review targeted structure, because structure boards are rarer, so students have fewer checks on it and it appears weakest. There were three real peer exchanges. The teacher based the limits on evidence (for example, Ada's +96 merge), and the revisions narrowed them as intended. Narrower lessons became less harmful but not helpful. Exam means were 156, 153, 147 and 153 (baseline, then after each cycle); every game reached the 25-move cap.

### Without the helper (interrupted by a network outage; 1 of 3 cycles, $0.187, 478 calls, 0 invalid actions)

| Lesson                                                                           | Targeted | General | Lesson citations |
| -------------------------------------------------------------------------------- | -------: | ------: | ---------------: |
| Ada: Keep your corner even when a big merge tempts you (2, 100)                  |    +1.42 |   −5.00 |                0 |
| Ada revision: Keep your corner chain unless the merge is too big to skip (3, 32) |    +0.50 |   −9.50 |                0 |
| Lin: Take points only when the corner stays put (3, 20)                          |    −0.08 |   +7.25 |                0 |

The baseline exam mean was 149 without the helper (156 with it). After cycle 1 it was 161, with no lesson installed, so that change is repeat-run variation. The run stopped with `fetch failed` during Lin's revision test, after the retries were exhausted; partial results are saved.

### Findings

- **With the helper**, the pipeline works end to end with Muse. The lessons, including conditional and revised ones, do not improve on the default strategy. This matches the simulation calibration.
- **Without the helper, the gate mostly measures model randomness.** Muse never cited a lesson, yet general-board deltas swung between −9.5 and +7.25. With the helper, both arms of a pair are anchored to the same deterministic ranking. Without it, stochastic model choices differ between the paired rollouts, and with only two general boards one swing decides the verdict. Ada's +1.42 targeted result is therefore not reliable evidence. Using no-helper mode in a study would first need a sturdier gate (more general boards, or repeated paired rollouts), at higher cost.
- Revised lessons do not record the free impact check (shown as "−"). The revision path does not compute it yet.

Raw results (ignored by Git): `data/batch-helper/live-batch-1793386215717/final.json` and `data/batch-nohelper/live-batch-1793387768627/final.json`. Total spend on the key so far is about $0.45.

## Decision needed before the study

Choose helper or no-helper for every arm.

- **With the helper**, the gate is reliable, but lessons have little to improve, so a null result is likely.
- **Without the helper**, lessons have more room, but the gate must be made sturdier first.

Either way, freeze the protocol and seal new seeds before the exam.
