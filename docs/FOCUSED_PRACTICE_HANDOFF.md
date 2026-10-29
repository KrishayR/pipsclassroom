# Focused practice improvement — October 29, 2026

## Diagnosis from the saved live run

The live teaching check is preserved in `LIVE_TEACHING_CHECK.md`; this change
does not alter that result or its acceptance rule.

- After seven regular moves per student, all three students had **zero
  applicable checks in each of the three skills**. Early open boards supplied
  little diagnostic evidence.
- The reviewed student's four targeted moves all passed the focus check.
  The teacher proposed a precaution, with uncertainty, rather than correcting
  a demonstrated failure. No classmate had eligible focus evidence.
- Recomputing the planner's first decision on the six original targeted
  snapshots, with the original planning seeds, gave the **same top direction
  on all six boards** for both `spaceWeight=12` and `spaceWeight=20`.
  This is a planner-only sensitivity check, not a replay of Muse inference or
  a claim that every later action is unchanged. Seven of the eight live paired
  rollouts also tied in utility.

## Implemented

An explicit **Focused practice** action gives every student a short exercise
in each of the three skills. It uses the existing exercise length (four moves
by default), up to 36 decisions across the class. Diagnostic boards must be
reachable and match the requested skill; an untagged fallback is not accepted.
Selection searches a bounded pool of six candidates per student and skill.

The step records actual moves for curriculum estimates and normal peer
selection. It supplies no advice and installs no lessons. Regular games and
workspaces are restored/preserved. Successes, failures and missing peer
eligibility remain possible; no advice is guaranteed to pass verification.

The action is available through both the local server and browser simulation,
and starts the guided first run. A classroom control also exposes it for an
existing run. Live exercises make paid calls; this implementation pass made
no new Muse requests.

Repeated exercises get separate deterministic episode IDs, keeping replay
boundaries and recent-move context separate. Pending candidates must be tested
before another review or diagnostic exercise; the UI disables those actions.
The walkthrough now labels verification deltas as utility, not raw game score.

Simulation review now prioritizes moves where the chosen skill actually
applied, including when all applicable moves passed. This avoids citing an
unrelated opening move despite having relevant diagnostic examples.

## Evaluation boundaries

- Verification thresholds, scoring, model prompts and strategy parameters are
  unchanged.
- All four conditions can use the same diagnostic action. Existing CLI and
  in-app comparison runners do not call it automatically; their protocol is
  unchanged. Compare conditions with the same preparation when studying the
  new stage, and report the extra decisions/tokens.
- This is an evidence-collection improvement. A new live run is still needed
  to validate peer feedback, accepted memory, and downstream performance.
- Core source changes require a new code freeze for a future formal study;
  do not resume a prior frozen study across these changes.

## Validation and next step

Tests cover skill-relevant evidence in all four conditions, preserved games
and memory, peer eligibility from real simulation traces, unique exercise
episodes, candidate protection, restoring a game after stopping, and keeping
exam boards separate from later training. All 36 tests and the production
build pass. A browser simulation check completed focused practice, a real
recorded peer contribution (Sam → Ada), and verification with zero model calls;
the candidate was rejected by the unchanged gate. The local export is
`data/focused-practice-check.json`.

Next: inspect a simulation run of focused practice → review → verification,
then separately authorize/budget a live test of that same flow. Preserve
negative outcomes and keep the acceptance gate fixed.
