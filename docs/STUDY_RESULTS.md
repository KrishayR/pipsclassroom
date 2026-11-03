# Study results — November 2, 2026

Live Muse (`muse-spark-1.3-contributor`, Contributor mode, reasoning effort low), helper on for every group. Code commit `d728afc`, with a clean working tree. Code SHA-256 starts `63392e535308`. Sealed exam seeds SHA-256 `a32dd87c39a95725b0cb8aebdfd3fffe03a7e320931eb2f94d304f9c2e6f6dd0`, published before the run. Raw report (ignored by Git): `data/study/study-300.json`.

**One training repetition per group. Every result here is exploratory.**

## Design

- **Groups:** solo, teacher (random practice), adaptive (teacher with adaptive practice), and classroom (adaptive with a peer), plus an untrained baseline.
- **Training per group:** 3 teaching rounds, one revision per rejected lesson, and free strategy experiments before every review. The lesson test is unchanged: 6 + 2 boards × 4 moves, targeted gain ≥ +1, general change ≥ −2.
- **Exams:** students play alone with frozen notes on 2 sealed seeds × 3 students per group.
- **Full-game check (free):** each group's saved notes are played to the end of the game by the simulation student. That is the same plan live students are shown as `lessonPlan`. It runs on 40 fresh seeds per student, compared with untrained notes.

### Change to the frozen plan

The plan was full-game live exams (cap 1,500, about 34,000 decisions) and the two ablations. After training, and before any exam game finished, the run was stopped. The provider handled only about 60 calls per minute, so the exams could not have finished before the team's deadline. The exams were rerun with a **300-move cap** on the same seeds and **without the ablations**. Training and code were not changed. The change is recorded in the report's `notes`. The original record is `data/study/study.json`.

## Training

| Group     | Lessons kept | Rejected | Kept lessons                                                            |   Cost |
| --------- | -----------: | -------: | ----------------------------------------------------------------------- | -----: |
| Solo      |            1 |        4 | Ada: experiment "depth 3, space 6, merge 8"                             | $0.111 |
| Teacher   |            1 |        4 | Ada: experiment "depth 3, space 6, merge 8"                             | $0.109 |
| Adaptive  |            2 |        2 | Lin: "depth 3, space 6, merge 8"; Sam: "depth 4, space 4, merge 8"      | $0.107 |
| Classroom |            0 |        6 | none; several narrow misses (for example +1.50 targeted, −2.25 general) | $0.109 |

Every kept lesson adopted a free strategy experiment exactly. No lesson invented by the teacher passed.

## Live exams (300 moves)

30 games, 0 errors, 0 invalid moves, $1.73. Every game reached the 300-move cap.

| Group     | Mean score | vs untrained (95% CI) |
| --------- | ---------: | --------------------: |
| Untrained |      4,373 |                     — |
| Solo      |      4,513 |      +140 [−161, 449] |
| Teacher   |      4,389 |       +16 [−406, 377] |
| Adaptive  |      4,295 |       −77 [−342, 189] |
| Classroom |      4,457 |       +85 [−189, 352] |

Primary contrast (classroom − adaptive): +162 [−191, 579], 6 pairs. The planning target was **not met**. At 300 moves every game survives, so differences in survival cannot show. As predicted, the live exams found no difference.

## Full-game check (simulation, 40 games per student)

| Group     | Mean score | vs untrained notes (95% CI) |
| --------- | ---------: | --------------------------: |
| Untrained |     10,253 |                           — |
| Solo      |     10,713 |          +460 [−211, 1,147] |
| Teacher   |     11,182 |       **+929 [243, 1,620]** |
| Adaptive  |     10,884 |          +631 [−137, 1,403] |
| Classroom |     10,253 |     0 (no lesson was saved) |

Between groups: classroom − adaptive −631 [−1,403, 120]; adaptive − teacher −298 [−1,355, 734]; teacher − solo +469 [−148, 1,124].

## What this shows

- **Accepted lessons improve the saved strategy.** Every group that kept a lesson moved toward better full-game play. For the teacher group the gain is clearly above zero.
- **No classroom advantage was shown.** In this single repetition, the classroom group's lessons all failed the unchanged test, so its notes never changed. The primary contrast is therefore negative in the full-game check and not significant in the live exams. One repetition cannot separate "peers hurt" from bad luck at a noisy test, and this result does not support either claim.
- **The live 300-move exams cannot show these gains.** A live full-game exam needs about 1,000 decisions per game.

## Cost

Study total about $3.50: training $0.44, the stopped full-game exams about $1.35, the 300-move exams $1.73. Total key spend after the study: $5.35 of the $145 limit.
