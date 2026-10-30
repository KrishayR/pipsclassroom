# Classroom Session and Individual Cycles

Both live batch modes start a fresh classroom, share the existing estimated $1
budget/reservations and provider rate controls, save baseline evidence, and run
entirely in the backend after the browser request returns.

**Classroom Session**: all students receive focused practice, followed by three
independent teaching pipelines. Each pipeline retains the existing targeted
exercise, teacher/eligible peer feedback, paired verification, at most one
revision, and fresh-board retest. Their work overlaps under one shared maximum
of six requests. One final exam per student follows after all teaching finishes.
Each additional session repeats this sequence with cumulative student notebooks.

Every pipeline begins from the same pre-teaching classroom snapshot. Peer moves
and notebooks cannot change because another learner finishes first. Each child
may add its own targeted exercise evidence, but classmates do not see it until
the next session. Only that child's recipient state is merged back. Rejected
lessons, revised candidates, usage and partial records are preserved. Each
student reserves two round IDs (original/revision) so seeds and outcomes do not
depend on completion order. Saved sessionTeaching metadata identifies frozen
workspaces, peer trace IDs and assigned rounds. pendingCandidates records any
unfinished proposals after stop/failure.

**Individual Cycles** retains the existing Ada → Lin → Sam → Ada order, with
focused practice, one student's teaching/verification and exams each cycle.
Count selects 1–100 sessions or individual cycles. One Classroom Session teaches
all three; three Individual Cycles teach each student once. Sessions avoid two
extra focused practice stages and two intermediate sets of exams compared with
three individual cycles. They are different experimental protocols, so historical
results should not be treated as an identical comparison.

No board count, rollout length, utility formula, acceptance threshold, memory
isolation, revision limit or final exam recording is reduced. Stops drain in-flight
work; errors save partial results and prevent a final exam from being reported as
complete. The manual classroom returns after the batch. Planner configuration
is unchanged by this scheduling feature.

Runtime improvement is expected from overlapping teaching and sharing stages;
live speed and learning benefit require measurement. Offline tests compare serial
and parallel executions of the same frozen session protocol, not a session with
the old three-cycle protocol. Live model variation can still change outcomes.
