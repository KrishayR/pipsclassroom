# One revision after rejection

Live UI and batch runs allow one teacher revision after a lesson fails its
paired development test. Existing CLI study protocols keep revision disabled
unless explicitly enabled through ClassroomOptions; this changes the learning
protocol and must be declared in any study comparison.

Verification now saves both trajectories for every pair: before/after boards,
actions, short model explanations, and lesson citations. The teacher receives
the rejected lesson, per-board utility differences and these trajectories. It
may narrow the rule, improve an exception or adjust evidence-supported strategy
parameters. Original practice evidence IDs remain validated. No new peer or
student reflection call is repeated for the revision. Structured-output repair
is still bounded by the existing provider adapter; it is not another lesson test.

The revision uses a separate development snapshot namespace, excluding the
original test's starting boards and rollout seeds. Targeted/general board counts,
rollout length, utility formula and acceptance thresholds are unchanged. Neither
attempt receives independent exam evidence. The original rejection stays in the
ledger, and the revision links to it through revisionOf. A second rejection ends
the attempt with unchanged memory. There is no automatic third proposal. Stop,
rate, spending reservation and token controls continue to apply.

Exams now retain each move's before/after observation, action, short explanation
and cited lesson in ExamRow.trajectory. This adds storage but no API calls. Full
provider hidden reasoning is not collected. Older saved exams cannot be backfilled.

The classroom keeps Practice → Discuss → Verify → Exam. Detailed paired moves
are expandable in lesson cards; completed batch attempts are expandable beneath
the batch status. Three cycles rotate teaching through Ada, Lin and Sam, with
all three students assessed each cycle. Results and exam trajectories save in
data/live-batch-*/final.json and the per-stage checkpoints.

The batch defaults to three live cycles, with the existing $1 estimated cap.
Revisions add teacher and verification calls when the first lesson fails, so
runtime and cost can exceed a batch without revisions. This mechanism is an
experiment, not evidence that useful learning has occurred. Retained lessons
still need longer, multi-seed independent evaluation.
