# Planner-free live runs

Set `MODEL_STUDENT_HELPER=off` (or the compatible alias `MODEL_USE_PLANNER=false`)
in the local ignored `.env` and restart the backend
to remove sampled move rankings from browser practice, focused exercises,
verification, revisions and exams. Both Classroom Session and Individual Cycles
use this setting. Either disabled flag wins if both are set. The study runner also
uses this shared setting consistently across arms. It defaults to enabled when
both flags are unset; explicit provider overrides still take precedence.

The live banner displays Planner OFF/ON. The current classroom export stores
`state.plannerEnabled`; new batch status also stores `plannerEnabled`. Start a
fresh batch to compare conditions rather than mixing existing manual history.

Without the planner, teachers propose written rules/exceptions and preserve
the existing strategy parameters. The planner-sensitivity draft check is disabled:
changing a sampled ranking is not meaningful in this condition. The acceptance
gate, revision limit, independent exams, legal move validation, board/per-move
facts and recent context remain. This is not completely unaided play.

An offline fake-provider session confirms no skill rankings, no run_skill traces,
zero planner transitions, unchanged strategy parameters, and planner-free teacher
instructions for original and revised lessons. Live performance remains unmeasured.
