# Test lesson vs chance

Current version uses 100 moves/game, source-specific fresh seeds, a retained
student notebook (Lin preferred), and a six-million-token ceiling. The $1 cap
and matched-control design remain. See [current protocol](CONTEXTUAL_REVIEW.md).

The live Classroom button runs a fixed, exploratory diagnostic for Lin's retained
lesson from the latest completed planner-free batch. It does not teach new lessons
or replace the classroom. It refuses to start without a retained lesson and empty
baseline in that batch. The source export and frozen workspaces are saved before
any API calls, including the source SHA-256 in manifest.json.

Three fresh development game seeds, excluding public exam seeds and the source
batch's exam/verification seeds, are each repeated twice. Each seed/repetition has
three independent Muse games: unchanged control A, unchanged control B, and the
retained lesson. Each game starts from the same seeded initial board and has a
50-move cap. Launch order rotates; at most six games execute concurrently behind
the existing shared provider gate. The planner is explicitly disabled for all
conditions. No teacher or peer operates during these exams.

The primary descriptive measure is mean lesson score minus the average of the
two matched controls. Control B minus A and its mean absolute difference show
ordinary repeat-run variation. These are not confidence intervals or an automatic
learning verdict. Only three unique seeds are tested; repetitions are correlated
by seed. Positive results need broader independent validation.

The frozen historical lesson is evaluated using the current conditional-lesson
implementation, including default limits when its saved limits are absent. This
is a new experiment under current code, not an exact replay of the earlier run.
The code does not update the candidate after seeing results or rerun losing seeds.

The existing $1 estimated reservation-aware cap, rate controls and a four-million
token ceiling apply. All other live browser actions are blocked while it runs.
Stop drains outstanding calls and saves partial trajectories; failed/interrupted
runs do not receive a complete summary. Every completed/partial game stores its
move observations, choices and short explanations in data/lesson-check-*/status.json.
The separate data/lesson-check-latest.json never overwrites the source classroom
batch. The browser displays progress and an expandable results table, and full
run export includes the check. Restart recovery marks a running check interrupted.

The first version is a diagnostic button, not a configurable study builder. It
uses the same frozen candidate on repeated clicks and fixed seeds; repeated clicks
are not fresh independent replication. No paid run starts during implementation.
