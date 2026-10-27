import {
  createGame,
  fromBoard,
  hash,
  move,
  observe,
  snapshotPool,
} from "./engine";
import type {
  Arm,
  ExamRow,
  Lesson,
  Policy,
  Verification,
  Workspace,
} from "./types";
export const EXAM_SEEDS = Array.from({ length: 6 }, (_, i) =>
  hash(`sealed-exam-v1:${i}`),
);
export const DEFAULT_MOVE_CAP = 1500;
export const VERIFICATION_RULE =
  "Mean practice utility improves by ≥ 1; mean regression utility declines by no more than 2. Utility = rollout score gain / 8 + surviving moves + 2 × final empty cells. Six practice and three regression snapshots; 8 moves each.";
export async function rollout(
  policy: Policy,
  workspace: Workspace,
  board: number[],
  seed: number,
  cap = 8,
  onUsage?: (tokens: number, calls: number, simulations: number) => void,
) {
  let game = fromBoard(board, seed);
  let tokens = 0,
    calls = 0,
    simulations = 0;
  for (let i = 0; i < cap && !game.over; i++) {
    const d = await policy.decide(
      observe(game),
      workspace,
      hash(`verify-plan:${seed}:${i}`),
    );
    tokens += d.tokens;
    calls += d.calls;
    simulations += d.simulations;
    onUsage?.(d.tokens, d.calls, d.simulations);
    const next = move(game, d.action);
    if (!next.changed) throw new Error("Policy chose an illegal move.");
    game = next.game;
  }
  return {
    utility: game.score / 8 + game.moves + observe(game).empty * 2,
    tokens,
    calls,
    simulations,
  };
}
export async function verifyCandidate(
  policy: Policy,
  current: Workspace,
  lesson: Lesson,
  round: number,
  onUsage?: (tokens: number, calls: number, simulations: number) => void,
  onProgress?: (done: number, total: number) => void,
): Promise<Verification> {
  const candidate: Workspace = {
    version: current.version + 1,
    skill: lesson.skill,
    lessons: [
      ...current.lessons,
      { ...lesson, status: "verified" as const },
    ].slice(-3),
  };
  const rows: Verification["rows"] = [];
  for (const split of ["practice", "regression"] as const)
    for (const snapshot of snapshotPool(split, round)) {
      // Paired action-independent seeds. Neither student sees the spawn seed.
      const baseline = await rollout(
        policy,
        current,
        snapshot.board,
        snapshot.seed,
        8,
        onUsage,
      );
      const proposed = await rollout(
        policy,
        candidate,
        snapshot.board,
        snapshot.seed,
        8,
        onUsage,
      );
      rows.push({
        snapshot: snapshot.id,
        split,
        seed: snapshot.seed,
        baseline: baseline.utility,
        candidate: proposed.utility,
        delta: proposed.utility - baseline.utility,
      });
      onProgress?.(rows.length, 9);
    }
  const mean = (split: string) => {
    const r = rows.filter((r) => r.split === split);
    return r.reduce((s, r) => s + r.delta, 0) / r.length;
  };
  const meanDelta = mean("practice"),
    regressionDelta = mean("regression");
  return {
    rows,
    meanDelta,
    regressionDelta,
    accepted: meanDelta >= 1 && regressionDelta >= -2,
    rule: VERIFICATION_RULE,
    mode: policy.mode,
  };
}
export async function examEpisode(
  policy: Policy,
  workspace: Workspace,
  seed: number,
  cap: number,
  identity: { id: string; name: string },
  arm: Arm,
  onMove?: (game: ReturnType<typeof createGame>, completed: number) => void,
): Promise<ExamRow> {
  let game = createGame(seed),
    tokens = 0,
    calls = 0,
    simulations = 0;
  let error: string | undefined;
  try {
    for (let i = 0; i < cap && !game.over && !game.won; i++) {
      const d = await policy.decide(
        observe(game),
        workspace,
        hash(`exam-plan:${seed}:${i}`),
      );
      tokens += d.tokens;
      calls += d.calls;
      simulations += d.simulations;
      const next = move(game, d.action);
      if (!next.changed) throw new Error("Illegal exam move.");
      game = next.game;
      onMove?.(game, i + 1);
      if (i % 25 === 24) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Policy failed";
  }
  return {
    studentId: identity.id,
    name: identity.name,
    arm,
    seed,
    score: game.score,
    highest: Math.max(...game.board),
    moves: game.moves,
    reached: game.won,
    terminal: error
      ? "error"
      : game.won
        ? "target"
        : game.over
          ? "loss"
          : "cap",
    tokens,
    calls,
    simulations,
    workspaceVersion: workspace.version,
    error,
  };
}
export function summarize(rows: ExamRow[], cap: number) {
  const n = rows.length;
  const success = rows.filter((r) => r.reached);
  return {
    n,
    successes: success.length,
    successRate: n ? success.length / n : 0,
    meanScore: n ? rows.reduce((s, r) => s + r.score, 0) / n : 0,
    successfulMeanMoves: success.length
      ? success.reduce((s, r) => s + r.moves, 0) / success.length
      : null,
    cappedMeanMoves: n
      ? rows.reduce((s, r) => s + (r.reached ? r.moves : cap), 0) / n
      : 0,
    errors: rows.filter((r) => r.terminal === "error").length,
  };
}
