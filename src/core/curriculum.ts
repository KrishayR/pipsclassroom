import { analyze, draw, hash, legalMoves, slide } from "./engine";
import type {
  Arm,
  Board,
  Direction,
  Focus,
  FocusChoice,
  Observation,
  Trace,
} from "./types";
export const FOCI: { id: Focus; name: string; question: string }[] = [
  {
    id: "space",
    name: "Preserve room",
    question:
      "A big merge looks good. But does it leave room for the next move?",
  },
  {
    id: "structure",
    name: "Maintain useful structure",
    question:
      "Is the largest tile still anchored, or did this move pull it loose?",
  },
  {
    id: "planning",
    name: "Plan beyond one merge",
    question: "After this merge, how many good options are left?",
  },
];
export const ADAPTIVE_SHARE = 0.8;
export const focusName = (focus: Focus) =>
  FOCI.find((f) => f.id === focus)!.name;
const corner = (board: Board) =>
  [0, 3, 12, 15].some((i) => board[i] === Math.max(...board));
// When a board position exercises a skill. Used to tag reachable snapshots and moves.
export function focusApplies(focus: Focus, board: Board): boolean {
  const f = analyze(board);
  if (f.legal === 0) return false;
  if (focus === "space") return f.empty <= 6 && f.empty >= 1;
  if (focus === "structure") return f.highest >= 32 && f.corner;
  return f.merges > 0 && f.empty <= 8;
}
// Observable outcome checks, not move-quality grades: a failed check can still be the best move.
export function focusOutcome(
  focus: Focus,
  before: Observation,
  after: Observation,
): boolean | null {
  if (!focusApplies(focus, before.board)) return null;
  if (focus === "space") return after.empty >= before.empty;
  if (focus === "structure") return corner(after.board);
  return after.legal.length >= 3;
}
// The same checks applied to a candidate move before the tile spawn, so a student
// (or a lesson) can see which moves would keep a skill. Spawns are never revealed.
export function moveFacts(board: Board) {
  const empty = board.filter((v) => !v).length;
  return Object.fromEntries(
    legalMoves(board).map((d) => {
      const s = slide(board, d);
      const emptyAfterSlide = s.board.filter((v) => !v).length;
      return [
        d,
        {
          scoreGain: s.gain,
          emptyAfterSlide,
          largestStaysInCorner: corner(s.board),
          legalMovesAfterSlide: legalMoves(s.board).length,
          keeps: {
            // A spawn fills one cell, so room is kept only if the slide merged.
            space: emptyAfterSlide - 1 >= empty,
            structure: corner(s.board),
            planning: legalMoves(s.board).length >= 3,
          } as Record<Focus, boolean>,
        },
      ];
    }),
  ) as Partial<
    Record<
      Direction,
      {
        scoreGain: number;
        emptyAfterSlide: number;
        largestStaysInCorner: boolean;
        legalMovesAfterSlide: number;
        keeps: Record<Focus, boolean>;
      }
    >
  >;
}
export type SkillEstimates = Record<
  Focus,
  { attempts: number; successes: number }
>;
// Potential corrections, not optimality labels: preserve the focus, leave two
// slide options and give up no immediate merge points. No lookahead is used.
export function diagnoseMove(
  focus: Focus,
  before: Observation,
  action: Direction,
) {
  const facts = moveFacts(before.board),
    chosen = facts[action];
  const applicable = focusApplies(focus, before.board);
  const alternatives = Object.entries(facts)
    .filter(
      ([d, f]) =>
        d !== action &&
        f!.keeps[focus] &&
        f!.legalMovesAfterSlide >= 2 &&
        f!.scoreGain >= (chosen?.scoreGain ?? 0),
    )
    .map(([d]) => d as Direction);
  const kind = !applicable
    ? "not-applicable"
    : chosen?.keeps[focus]
      ? "kept"
      : alternatives.length
        ? "potential-correction"
        : Object.values(facts).some((f) => f!.keeps[focus])
          ? "tradeoff"
          : "unavoidable";
  return { kind, alternatives, moveFacts: facts };
}
export function correctionEvidence(traces: Trace[], focus: Focus) {
  const seen = new Set<string>();
  return traces.filter((t) => {
    const key = JSON.stringify(t.before.board);
    if (
      seen.has(key) ||
      diagnoseMove(focus, t.before, t.action).kind !== "potential-correction"
    )
      return false;
    seen.add(key);
    return true;
  });
}
export function skillEstimates(traces: Trace[]): SkillEstimates {
  const out = Object.fromEntries(
    FOCI.map((f) => [f.id, { attempts: 0, successes: 0 }]),
  ) as SkillEstimates;
  for (const t of traces)
    for (const { id } of FOCI) {
      const ok = focusOutcome(id, t.before, t.after);
      if (ok === null) continue;
      out[id].attempts++;
      if (ok) out[id].successes++;
    }
  return out;
}
// Laplace-smoothed success rate, so untried skills are neither best nor worst.
const mastery = (e: { attempts: number; successes: number }) =>
  (e.successes + 1) / (e.attempts + 2);
export function chooseFocus(
  arm: Arm,
  estimates: SkillEstimates,
  key: string,
  evidenceBased = false,
): FocusChoice {
  const [u, r] = draw(hash(`curriculum:${key}`));
  const [v] = draw(r);
  const random = FOCI[Math.floor(v * FOCI.length)];
  const adaptiveArm = arm === "adaptive" || arm === "classroom";
  if (!adaptiveArm)
    return {
      focus: random.id,
      name: random.name,
      reason: "Random exercise (this group does not use targeted practice).",
      adaptive: false,
    };
  if (u >= ADAPTIVE_SHARE)
    return {
      focus: random.id,
      name: random.name,
      reason: `Exploration draw (${Math.round((1 - ADAPTIVE_SHARE) * 100)}% of selections keep coverage).`,
      adaptive: false,
    };
  const supported = FOCI.filter(
    (f) => estimates[f.id].attempts - estimates[f.id].successes >= 2,
  );
  if (evidenceBased && !supported.length) {
    const next = [...FOCI].sort(
      (a, b) => estimates[a.id].attempts - estimates[b.id].attempts,
    )[0];
    return {
      focus: next.id,
      name: next.name,
      reason:
        "Coverage exercise: insufficient evidence of a recurring correctable weakness.",
      adaptive: false,
    };
  }
  const weakest = [...(evidenceBased ? supported : FOCI)].sort(
    (a, b) =>
      (evidenceBased
        ? estimates[a.id].successes / estimates[a.id].attempts -
          estimates[b.id].successes / estimates[b.id].attempts
        : mastery(estimates[a.id]) - mastery(estimates[b.id])) ||
      estimates[a.id].attempts - estimates[b.id].attempts,
  )[0];
  const e = estimates[weakest.id];
  return {
    focus: weakest.id,
    name: weakest.name,
    reason: evidenceBased
      ? `Review focus: ${e.attempts - e.successes} observed choices involved a tradeoff or potential correction. These are discussion opportunities, not optimality grades.`
      : `Weakest measured skill: ${e.successes}/${e.attempts} recent checks passed.`,
    adaptive: true,
  };
}
