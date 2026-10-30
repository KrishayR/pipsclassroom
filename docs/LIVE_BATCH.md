# Configurable live Muse batch

In Live model mode → Classroom, enter 1–100 in **Cycles**, then click
**Run [count] live cycles · $1 max**. The default is five. The total estimated
budget stays at $1 regardless of count; more cycles may not fit in it.
The server runs independently after the request returns; no assistant
supervision or repeated chat checks are needed. Keep the computer awake,
online, and the Node backend running. Closing the browser does not stop it.

## Parallel execution

Live classrooms now use concurrency 3. Ada, Lin, and Sam practice and take
exams side by side. Each student's moves remain sequential; focused practice
waits for all students before advancing to the next skill. Exams finish all
students on a seed before advancing to the next seed. Verification schedules
independent baseline/candidate rollouts with up to three workers and restores
the original snapshot order in its results. Each rollout keeps its own board,
spawn stream, recent-move context, and frozen workspace.

Cycles, focus → review → verification → exam, teacher/peer/student feedback,
and lesson adoption stay sequential. No prompts, seeds, move caps, scoring,
snapshot counts, or acceptance thresholds were weakened. Deterministic
simulation tests match sequential and parallel outcomes exactly; live Muse
outputs can still differ because model responses are stochastic. These
changes require a new source freeze before a formal study.

The model providers in the server share a three-request gate and the existing
request-start rate limiter. Per-operation usage is isolated so simultaneous
decisions do not double-count each other's tokens. Outstanding requests
reserve estimated spend against both the key ceiling and batch budget.
Transport failures with unknown usage retain a conservative estimate.
Reservations coordinate within this Node process; do not run a separate
spending process against the same credit ledger during a budgeted batch.

Stop prevents queued model calls from starting; active calls finish and their
results and usage are saved before the stage returns. Failures also drain
active stage workers before releasing the operation lock. The stopped earlier
run remains in its timestamped archive; new runs start a fresh classroom.
During a batch, its student boards are displayed in the Classroom view;
the manual classroom returns afterward. Exports include the concurrency
setting and the batch summary records elapsed time for completed stages.

This creates a separate fresh classroom and preserves the existing manual
session. It runs a baseline exam for all three students, then five cumulative
cycles by default of focused practice, review of one rotating student (Ada,
Lin, Sam, repeating), unchanged verification, and an exam for all students. Each exam
uses one public development seed and a 25-move cap. This is an exploratory
workflow check, not five independent experiments or a performance study.

The run checks an additional estimated $1 ceiling before each API request;
the existing key-spend limit may stop it sooner. No new live request starts
after the batch is stopped. API errors or exhausted budgets preserve partial
results. Cost estimates depend on configured prices and reported usage and
are not a provider billing guarantee. A server restart marks the batch
interrupted; it does not automatically resume or spend again.

Read `data/live-batch-latest.json` for status, baseline, per-cycle lesson
outcomes and exam rows. Its `directory` points to the timestamped archive.
Every completed stage saves a full classroom export there; `final.json`
preserves the final or partially completed state, including traces, peer
messages, frozen workspaces, verification pairs, and usage. The current
manual session's export also includes the batch summary. Runtime data stays
local and is excluded from Git.

For later analysis, inspect accepted/rejected lessons, teacher and peer
evidence, lesson citations in later moves, changes in frozen workspaces,
exam errors, and recorded spend. Compare exams cautiously: the same public
seed is reused and stochastic responses can vary even without learning.

Validation includes five-cycle and two-cycle batches, invalid counts,
rotating recipients, saved exports, deterministic sequential/parallel
equivalence, overlapping decisions, exact per-decision usage, draining on
failure/stop, request limits, and in-flight spending reservations. All checks
use local fake model responses, with no new paid calls. The paid batch is
left for the user to start; real speedup has not yet been measured.
