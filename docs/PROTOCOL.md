# Prototype protocol v0.2

The model stays fixed. External memory and bounded skill parameters change. Agents never receive the actual spawn RNG or seeds. All arms begin with the same model, settings, skill, memory cap and allowed tools.

## Conditions

| Arm         | Plan label            | Practice                               | Feedback                                  |
| ----------- | --------------------- | -------------------------------------- | ----------------------------------------- |
| `solo`      | A: Solo               | Random exercise focus                  | Self-review                               |
| `teacher`   | B: Teacher / random   | Random exercise focus                  | Teacher                                   |
| `adaptive`  | C: Teacher / adaptive | 80% weakest measured skill, 20% random | Teacher                                   |
| `classroom` | D: Full classroom     | Same as C                              | Teacher + one peer with relevant evidence |

Primary comparison: D − C (peer learning). Secondary: C − B (adaptation), B − A (teacher). An untrained baseline (empty workspace, same seeds) measures improvement over the model's starting behavior.

## Curriculum

Skills: preserve room, maintain useful structure, plan beyond one merge. Each recorded move where a skill applies gets an outcome check (room: empty cells did not fall; structure: the largest tile stayed in a corner; planning: at least three legal moves remain). These are observable proxies, not move-quality grades. Per-student mastery is (passes + 1) / (applicable + 2). Each review draws the focus deterministically from the run, student and round. The reason is logged. A targeted exercise (default 4 moves) is played alone on a reachable snapshot tagged for the focus. Peers are chosen by recorded passes on that focus and verified lessons for it, not by score.

## Lessons (v0.3, Oct 29)

A lesson has a focus skill and a trigger: `when the skill applies` (default; uses the curriculum's definition for that skill), `crowded boards` (six or fewer empty cells) or `always`. Students receive `moveFacts` for every legal move: score gain, empty cells after the slide, whether the largest tile stays in a corner, legal moves after the slide, and whether the move keeps each skill. These are computed before the tile spawn, so no future randomness is revealed. Model students are told to prefer a move that keeps an applicable lesson's skill over the skill ranking, unless the lesson's exception fits or the move is clearly dangerous, and to cite the lesson. The simulation student follows the same rule: it takes the best-ranked move that keeps every applicable lesson's skill, leaves at least two legal moves and has a sampled loss rate no more than 0.25 above the top move's; otherwise it takes the top-ranked move.

Before verification, a free check counts how many of six sample boards the candidate would change the planned move on. The boards are reachable, tagged for the focus, and drawn from a separate `sensitivity` pool, never the verification boards. If it changes none, the teacher is asked once to propose a stronger evidence-based change (the simulation teacher strengthens its change up to three times). The draft then goes to verification regardless, and its count is recorded on the lesson. The acceptance rule is unchanged. Verification rows also record how many candidate moves cited a saved lesson.

Finding (Oct 29): the default ranking already keeps the focus skill on most reachable boards (room 7/8, structure 4/5, planning 10/12 in one sample), so a lesson can change behaviour only on the minority of boards where the ranking does not.

## Verification gate

The current and candidate workspaces play paired short rollouts from the same snapshot and spawn RNG. Practice snapshots are reachable states tagged for the lesson's focus. Regression snapshots are general. Utility = score gain / 8 + valid moves completed + 2 × final empty cells. Accept if mean practice delta ≥ 1 and mean regression delta ≥ −2. All pairs are retained. Sizes are recorded with each verification:

- Simulation: 6 practice + 3 regression snapshots, 8 moves (v0.1 gate).
- Model: 6 + 2 snapshots, 4 moves by default (`VERIFY_*`), because each rollout move is a paid decision. Shorter rollouts are noisier and more myopic; accepted lessons are "verified on this practice set" only.

## Exams

Fresh conversation per decision; in model mode the student receives its skill ranking up front and answers with one `apply_move` call. Frozen workspace, no teacher, peers or memory updates. Students do not see seeds. UI exams use public development seeds (`DEV_SEEDS`), which have been used during development and are not sealed. Final exams use seeds from `npm run seal-seeds`, generated after freezing every tuning choice and kept out of source control. Publish the printed SHA-256 before running. Seeds are paired across arms. Diverging actions change spawn locations, so pairing is by random stream, not identical boards.

Model-mode cap: 150 valid moves (simulation: 1,500). Games that hit the cap are counted separately. The untrained baseline runs once (it does not depend on training) and is paired with every repetition. Ablations run in the first repetition. Transient API failures (429, 5xx, timeouts) are retried up to five times with backoff; a game that still fails is recorded as an error and, under `--resume`, rerun. The study report records a SHA-256 of the source code as the freeze record.

## Outcomes (fixed before results)

- **Primary:** mean exam score under the cap.
- Supporting: median score; fraction reaching 256 / 512 / 1024 / 2048; moves; losses vs cap truncations; errors; invalid tool requests; p50/p95 decision latency; tokens, calls and simulated transitions; dollars when prices are configured.
- Efficiency: (arm mean − untrained mean) per 1k training tokens and per training dollar.

## Inference and decision rule

Pairs are (repetition, seed, student). With two or more training repetitions, the 95% interval is a percentile bootstrap over repetitions (the unit of inference). With one repetition, pairs are resampled and the result is labeled exploratory. Students in one classroom share teaching information, so games from one memory version are not independent replications.

Planning target for the primary contrast: the mean score gain is at least 10% of the comparison arm's mean, the interval's lower bound is above zero, and the error-game rate rises by no more than 5 percentage points. Meeting it supports only: "Under our fixed 2048 protocol, the classroom configuration outperformed the comparison configuration on fresh games." Raw scores and absolute differences are always reported.

## Budget matching

Each arm has identical simulation and per-provider token ceilings. Leftover allowance after the teaching rounds is spent on extra practice, so cheaper arms get more practice. Actual consumption is reported. This is ceiling matching, not exact cost matching.

## In-app pilot

The UI comparison is a separate, labeled pilot: four fresh groups, 12 practice moves per student, one candidate per student, a 50,000-transition training ceiling per group, one development exam seed. In model mode all groups share the server's process token ceiling and can be truncated.
