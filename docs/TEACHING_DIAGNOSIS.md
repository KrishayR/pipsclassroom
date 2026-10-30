# Conservative teaching diagnosis

Historical design: the automatic cutoff and two-correction requirement below
have been removed. See [contextual review](CONTEXTUAL_REVIEW.md) for current live behavior.

Live browser/batch protocols enable evidenceBasedTeaching. Existing directly
constructed/CLI study protocols keep the previous behavior unless explicitly
enabled; compare results only after declaring this protocol change.

Existing moveFacts classify each relevant choice before the random spawn. A
potential correction requires a legal alternative that preserves the focus,
leaves at least two legal slide options and gives up no immediate merge points.
This is a conservative immediate heuristic, not proof of optimal play. Outcomes
with no such alternative are excluded from the corrective evidence. Two distinct
starting boards are required; repeated copies of one board do not count twice.

Adaptive selection distinguishes coverage from supported correction evidence.
Sparse perfect results are not called a weakness because of their smoothed rate.
The existing random exploration share remains. Focused practice and the targeted
exercise still run. If evidence remains insufficient, review records its reason
without calling the teacher/peer or queuing verification. The round advances so
later practice samples are fresh.

When teaching is supported, the teacher receives verified per-move facts and
potential-correction examples first, within the existing bounded trace window.
It may return noLessonReason instead of a lesson. Only the current focus-
preservation intervention is supported; the prompt disallows inventing tie-break
lesson types. Candidate trigger/limits must cover two distinct cited practice
corrections; unsupported drafts/revisions are retained as rejected with a reason,
without a rollout verdict. This validates operational coverage, not the truth of
free-form advice. Formal verification and independent evaluation remain necessary.

Sessions continue to exams even if every review abstains. Existing batch details
show each student's note. No new screen, planner or general lesson framework is
introduced. Thresholds, revision limits, fresh retest pools and exam move recording
are unchanged. The new tests cover supported and insufficient evidence, unavoidable
losses, duplicate boards, teacher abstention and both batch modes with no candidates.
