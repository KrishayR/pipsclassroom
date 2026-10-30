# Contextual review and longer games

This replaces the automatic two-correction cutoff introduced in ff57486. Every
eligible review reaches the teacher; classroom review also receives a recorded
peer, using a trace-bearing classmate as fallback when no focus-passing peer is
available. Missing peer evidence is never fabricated. A teacher may still abstain
after reviewing, but the engine does not suppress review because no heuristic
failure qualified. Sparse perfect checks remain coverage evidence, not weakness.

Teacher evidence prioritizes tradeoffs and difficult/terminal boards. At most six
anchors plus up to four actual following moves from the same episode are supplied.
Peer discussion may include successes, failures and tradeoffs. Immediate moveFacts
remain deterministic before-spawn facts; observed continuations are real outcomes,
not predicted alternative futures or proof of causation. Teachers are instructed
to formulate a specific conditional hypothesis and acknowledge spawn uncertainty.

New model-generated lessons in the live evidence-based protocol are marked
intervention=contextual. Muse weighs their written rule/exception among legal
moves, even when its initial choice keeps the Boolean focus skill. The old
recommendedMoves/keeps-skill override does not constrain these lessons. Legacy
lessons keep their preserve-focus behavior. The local simulation cannot interpret
arbitrary contextual language and does not claim to execute it. The planner stays
controlled by the existing helper setting. Legal moves, evidence IDs, memory limits,
structured-output validation, paired verification and one-revision bounds remain.

Live batch defaults now add 100 normal practice moves per student before focused
practice and use 100-move baseline/final exams. These are bounded longer games,
not a guarantee of reaching late-game difficulty or playing to failure. Existing
focused exercises remain. Practice trajectories are separate from exam records;
teachers/peers do not receive the exams. Effective lengths are saved in batch.design.
Tests can override lengths; formal CLI studies retain their separately declared
protocols. More observations mean more paid calls and runtime. The $1 estimated
batch cap and existing rate/reservation controls remain.

The independent Test lesson vs chance button now uses 100 moves/game on three
fresh source-specific seeds, two repeats and two unchanged controls. It selects
a retained notebook (Lin preferred if present), freezes source/workspaces before
calls, and makes no new teaching changes. All trajectories save. It has the same
$1 estimated cap and a six-million-token ceiling; a cap/network failure preserves
partial data. Results remain exploratory with only three unique seeds. New seeds
derive from the frozen source hash, so repeatedly clicking for the same source is
not fresh independent evidence. Do not weaken the short acceptance gate merely to
produce adopted lessons; assess usefulness independently.
