# Making lessons change behaviour — October 29–30, 2026

## Problem

Live and simulated lesson tests kept producing candidates that changed nothing.
In the first live run of the focused-practice flow (Lin, "Maintain useful
structure", Sam as peer), Lin played identical moves on all six targeted
verification boards with and without the lesson (+0.0 on each). Three causes:

1. **Hidden lessons.** Lessons were shown only when `trigger` was `always`, or
   on crowded boards. The teacher chose `crowded boards`, but most structure
   boards are not crowded, so the student never saw the lesson during its own
   test.
2. **Lessons were not actionable.** The student saw the board and a ranking,
   not whether each move would keep its biggest tile in the corner. It
   followed the ranking.
3. **Parameter changes too small.** Raising `structureWeight` 1 → 4 did not
   change the ranking's top move on any targeted board.

## Changes

- **Trigger `when the skill applies`** (now the default and recommended). The
  lesson is shown exactly where its focus skill's curriculum definition holds.
- **`moveFacts` for every legal move:** score gain, empty cells after the
  slide, whether the largest tile stays in a corner, legal moves after the
  slide, and `keeps[skill]`. All are computed before the tile spawn, so no
  future randomness is revealed.
- **Lesson-following instruction.** The model is told to prefer a move that
  keeps an applicable lesson's skill over the ranking, unless the exception
  fits or the move is clearly dangerous, and to cite `lesson_id`. The
  simulation student uses the same rule (`plannedMove`), skipping lesson
  moves that leave fewer than two legal moves or have a sampled loss rate more
  than 0.25 above the top move's.
- **Free impact check before verification.** The check counts how many of six
  reachable sample boards, drawn from a separate `sensitivity` pool and never
  the verification boards, the candidate would change the planned move on.
  When the count is zero, the teacher is asked once for a stronger
  evidence-based change. The draft then proceeds regardless, and the count is
  shown on the lesson card.
- Verification rows count candidate moves that cited a saved lesson
  (`cited`), shown as a column in the app.

The acceptance rule, thresholds, utility and board pools are unchanged.

## Results

| Run                       | Lesson changed moves on targeted boards | Targeted Δ | General Δ | Verdict  |   Cost |
| ------------------------- | --------------------------------------- | ---------: | --------: | -------- | -----: |
| Live, before fixes (Muse) | 0 of 6                                  |       0.00 |     −2.25 | rejected | $0.036 |
| Simulation, after fixes   | 3 of 6                                  |      −7.67 |     −2.33 | rejected |     $0 |
| Live, after fixes (Muse)  | 3 of 6                                  |      −3.25 |     −2.25 | rejected | $0.025 |

After the fixes, Muse followed the lesson: its play changed on half the
targeted boards. The peer gave concrete advice ("favor a merge that keeps it
pinned there while keeping 3+ moves open"), and Lin's test plan referred to
`moveFacts`. The lesson itself, keeping the biggest tile pinned in a corner,
lowered short-rollout utility on those boards (−14, −4, −1.5 live), and the
unchanged gate rejected it. Simulation showed the same pattern: separated,
the written rule (not the parameter change) caused the largest loss.

## Findings

- The mechanism now works end to end: a verified lesson can change how a Muse
  student plays, and the gate decides honestly. No lesson has been accepted
  yet, and none should be forced.
- The default ranking already keeps each skill on most reachable boards
  (room 7/8, structure 4/5, planning 10/12 in one sample). Lessons can only
  change behaviour where the ranking slips, so gains will be small and rare.
- Rigid corner-pinning trades short-term points away. With 4-move model
  rollouts, the gate favours immediate gains; a structure lesson may need
  longer evaluation to show value. Any change to rollout length is a protocol
  change and must be fixed before a study.

The raw logs are in `data/flow-model.log` and `data/flow-model-fixed.log`
(ignored by Git). The live run before the fixes (Oct 29) is summarized above.
