# Study 2 results — November 3, 2026

Live Muse (`muse-spark-1.3-contributor`, reasoning effort low), helper on for every group. The design is the frozen plan from [Study results](STUDY_RESULTS.md), with **full-game live exams** (cap 1,500 moves) and both ablations. New sealed exam seeds were generated before the run, SHA-256 `ebeb065bd93ecaa3f9c11c08129e14bb4edc99ce2e715a8f784b10060c3f975f`. The seeds used in Study 1 were retired as `data/sealed-exam-seeds.2026-11-02.used.json`.

**One training repetition per group, 6 exam games per condition. Every result here is exploratory.**

Raw reports (ignored by Git):

- `data/study2/study.json`: first run, with all groups, the untrained baseline and both ablations.
- `data/study2/retrain.json`: the retrained teacher, adaptive and classroom groups.
- `data/study2/retrain-redo.json`: the replayed games.
- `data/study2/combined.json`: the combined result, from `npm run combine-study`.

## What happened during the run

1. **First run, started Nov 3 at 1:21 AM PST.** Training for the teacher, adaptive and classroom groups was **cut short by HTTP 504 errors** from the provider, after about 4 of up to 6 lesson attempts each. The model client retried a 504 only a few times before failing. Solo finished training normally, at its token ceiling. Exams ran for every group anyway.
2. **Fix.** Gateway errors (502, 503 and 504) are now waited out for up to `MODEL_OUTAGE_WAIT_MS`, like a lost connection. A test was added. Agent, gate and scoring code is unchanged.
3. **Retrain, started Nov 3 at 11:52 AM PST.** The three interrupted groups were trained again from scratch, then examined on the same sealed seeds and cap, together with both ablations. All three finished training at their normal token ceiling. The first run's solo group and untrained baseline are reused, so every comparison pairs games on the same seeds.
4. **Replayed games.** In the retrain, 6 exam games stopped after about 30 moves on a connection drop longer than the 10-minute wait. A 7th game was broken by a clash between two processes writing one spend file, which was my mistake. All 7 were replayed from move 0 in a separate process (`npm run redo-exam-games`), with the same notes, seed, cap and helper setting, and every replay finished. The broken rows were replaced by the replays. No completed game was discarded.

The working tree was not clean during the run (commit `37f5261` plus uncommitted UI, replay and script changes). The reports record the code hash: `73392c661f65` for the first run and `e15612dca1ea` for the retrain, which includes the 504 fix.

## Training

| Group     | Lessons kept | From run  | Kept lessons                                                                                                                                                                  |
| --------- | -----------: | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Solo      |       1 of 5 | first run | Ada: "Keep structure when crowded even for small merges" (experiment depth 3, space 6, merge 8)                                                                               |
| Teacher   |       1 of 5 | retrain   | Ada: "Keep structure when the board is almost full" (experiment depth 3, space 6, merge 8)                                                                                    |
| Adaptive  |       2 of 4 | retrain   | Lin: "Keep extra room when the board is crowded" (**teacher's own rule**); Sam: "In crowded spots, pick the move that frees more room" (experiment depth 4, space 4, merge 8) |
| Classroom |       2 of 4 | retrain   | Lin: "Pick merges that keep room to move" (experiment depth 3, space 4, merge 8); Sam: "Take the close-score move that keeps room" (experiment depth 4, space 4, merge 8)     |

The classroom group kept lessons this time; in Study 1 it kept none. Adaptive Lin's lesson is the first lesson written by the teacher, not adopted from a free experiment, to pass the unchanged test.

## Live full-game exams (6 games per condition)

| Condition                | Mean score | Mean moves | Reached 2048 |
| ------------------------ | ---------: | ---------: | -----------: |
| Untrained                |     10,861 |        680 |            0 |
| Solo                     |     12,593 |        732 |            1 |
| Teacher                  |      8,601 |        516 |            1 |
| Adaptive                 |     10,195 |        642 |            0 |
| Classroom                |     12,341 |        729 |            1 |
| Classroom, lessons only  |     11,841 |        729 |            0 |
| Classroom, no skill tool |      6,825 |        459 |            0 |

Paired differences (95% bootstrap CI, 6 pairs):

| Contrast                             |               Difference |
| ------------------------------------ | -----------------------: |
| **Primary: classroom − adaptive**    |   +2,145 [−2,668, 7,553] |
| Classroom − untrained                |  **+1,479 [333, 2,813]** |
| Solo − untrained                     |   +1,732 [−4,839, 8,524] |
| Teacher − untrained                  |   −2,260 [−7,789, 4,451] |
| Adaptive − untrained                 |     −666 [−4,903, 3,158] |
| Adaptive − teacher                   |   +1,594 [−2,821, 6,169] |
| Teacher − solo                       |   −3,992 [−9,752, 2,328] |
| Classroom − solo                     |     −253 [−7,617, 7,277] |
| Classroom − lessons only (ablation)  |     +500 [−4,923, 6,619] |
| Classroom − no skill tool (ablation) | **+5,515 [857, 10,611]** |

The planning target for the primary contrast was **not met**.

## Full-game check (simulation, 40 games per student, free)

| Group     | vs untrained notes (95% CI, 120 pairs) |
| --------- | -------------------------------------: |
| Solo      |                  **+929 [243, 1,620]** |
| Teacher   |                      +575 [−88, 1,243] |
| Adaptive  |                **+1,069 [235, 1,923]** |
| Classroom |                     +663 [−199, 1,602] |

Between groups: classroom − adaptive −406 [−1,003, 171]; adaptive − teacher +495 [−613, 1,580]; teacher − solo −354 [−998, 323].

## What this shows

- **Lessons pass the unchanged test in every group, the classroom group included.** Each group kept 1–2 lessons, and one lesson written by the teacher itself passed.
- **Students with classroom lessons beat untrained students in live full games:** +1,479 points, with an interval above zero. This is the only live group comparison against untrained students that clears zero.
- **Muse depends on the skill tool.** With the classroom lessons but without the tool, live scores fall by 5,515 points (interval above zero). Removing the strategy changes from the lessons (lessons only) made no clear difference.
- **No classroom advantage over adaptive teaching was shown.** Live +2,145 and simulation −406 both have intervals that include zero.
- **Six live games cannot rank the groups.** Teacher and solo kept the same kind of lesson, yet their live means differ by about 4,000 points. The simulation check, with 120 pairs, is the steadier measure, and it shows real gains for solo and adaptive.

## Cost

Key spend rose from $5.35 to about $16.04 across Study 2, so about $10.70 in total. That includes the interrupted first-run training and the exams for the groups that were retrained. The replays cost $0.87, recorded in `data/study2/redo-key-spend.json`.

## For future runs

The replay process played a game about three times faster than the main run, because the request limiter (`MODEL_RPM`) applies per process. Splitting a run across processes, or raising `MODEL_RPM`, should shorten long exams a lot. Each process needs its own `MODEL_KEY_LEDGER`.
