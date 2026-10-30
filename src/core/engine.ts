import type { Board, Direction, Game, Observation } from "./types";
export const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];
export const ENGINE_VERSION = "cl-2048-1";
export const RNG_VERSION = "mulberry32-1";
export function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function draw(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}
export function validateBoard(board: Board): void {
  if (
    board.length !== 16 ||
    board.some(
      (v) =>
        !Number.isSafeInteger(v) ||
        v < 0 ||
        (v !== 0 && (v < 2 || !Number.isInteger(Math.log2(v)))),
    )
  )
    throw new Error("Expected 16 empty cells or powers of two.");
}
export function slide(
  board: Board,
  direction: Direction,
): { board: Board; gain: number; changed: boolean } {
  if (!DIRECTIONS.includes(direction)) throw new Error("Unknown direction.");
  const result = board.slice();
  let gain = 0;
  for (let line = 0; line < 4; line++) {
    const indices = Array.from({ length: 4 }, (_, p) =>
      direction === "left"
        ? line * 4 + p
        : direction === "right"
          ? line * 4 + 3 - p
          : direction === "up"
            ? p * 4 + line
            : (3 - p) * 4 + line,
    );
    const values = indices.map((i) => board[i]).filter(Boolean);
    const merged: number[] = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] === values[i + 1]) {
        const v = values[i] * 2;
        merged.push(v);
        gain += v;
        i++;
      } else merged.push(values[i]);
    }
    indices.forEach((idx, p) => (result[idx] = merged[p] ?? 0));
  }
  return {
    board: result,
    gain,
    changed: result.some((v, i) => v !== board[i]),
  };
}
export function legalMoves(board: Board): Direction[] {
  return DIRECTIONS.filter((d) => slide(board, d).changed);
}
export function spawn(
  board: Board,
  rng: number,
): {
  board: Board;
  rng: number;
  spawn: { index: number; value: number } | null;
} {
  const empty = board.flatMap((v, i) => (v === 0 ? [i] : []));
  if (!empty.length) return { board: board.slice(), rng, spawn: null };
  const [a, r1] = draw(rng);
  const [b, r2] = draw(r1);
  const index = empty[Math.floor(a * empty.length)];
  const value = b < 0.9 ? 2 : 4;
  const next = board.slice();
  next[index] = value;
  return { board: next, rng: r2, spawn: { index, value } };
}
export function createGame(seed: number): Game {
  let board = Array(16).fill(0);
  let rng = seed >>> 0;
  for (let i = 0; i < 2; i++) {
    const s = spawn(board, rng);
    board = s.board;
    rng = s.rng;
  }
  return { board, score: 0, moves: 0, rng, seed, won: false, over: false };
}
export function fromBoard(board: Board, seed: number): Game {
  validateBoard(board);
  return {
    board: board.slice(),
    score: 0,
    moves: 0,
    rng: seed >>> 0,
    seed,
    won: Math.max(...board) >= 2048,
    over: legalMoves(board).length === 0,
  };
}
export function move(
  game: Game,
  direction: Direction,
): {
  game: Game;
  spawn: { index: number; value: number } | null;
  gain: number;
  changed: boolean;
} {
  const s = slide(game.board, direction);
  if (!s.changed) return { game, spawn: null, gain: 0, changed: false };
  const next = spawn(s.board, game.rng);
  return {
    game: {
      ...game,
      board: next.board,
      rng: next.rng,
      score: game.score + s.gain,
      moves: game.moves + 1,
      won: game.won || Math.max(...next.board) >= 2048,
      over: legalMoves(next.board).length === 0,
    },
    spawn: next.spawn,
    gain: s.gain,
    changed: true,
  };
}
export function observe(game: Game): Observation {
  return {
    board: game.board.slice(),
    score: game.score,
    moves: game.moves,
    legal: legalMoves(game.board),
    highest: Math.max(...game.board),
    empty: game.board.filter((v) => v === 0).length,
  };
}
export function analyze(board: Board) {
  let roughness = 0,
    merges = 0;
  for (let i = 0; i < 16; i++)
    for (const j of [i % 4 < 3 ? i + 1 : -1, i < 12 ? i + 4 : -1])
      if (j >= 0 && board[i] && board[j]) {
        roughness += Math.abs(Math.log2(board[i]) - Math.log2(board[j]));
        if (board[i] === board[j]) merges++;
      }
  const highest = Math.max(...board);
  return {
    empty: board.filter((v) => !v).length,
    legal: legalMoves(board).length,
    roughness,
    merges,
    highest,
    corner: [0, 3, 12, 15].some((i) => board[i] === highest),
  };
}
// Reachable snapshots are collected exclusively through legal trajectories.
// With a filter, the latest trajectory state matching it is used (tagged exercises).
export function snapshotPool(
  split:
    | "practice"
    | "regression"
    | "exercise"
    | "sensitivity"
    | "revision-practice"
    | "revision-regression",
  round = 0,
  filter?: { key: string; applies: (board: Board) => boolean },
  count = split === "regression" ? 3 : 6,
): { id: string; board: Board; seed: number; tagged: boolean }[] {
  const pool = [];
  const prefix = filter ? `${split}:${filter.key}` : split;
  for (let n = 0; n < count; n++) {
    const seed = hash(`${prefix}:${round}:${n}`);
    let game = createGame(seed);
    let usable = game.board.slice();
    let tagged: Board | null = null;
    let r = hash(`policy:${seed}`);
    for (let k = 0; k < 70 + n * 9; k++) {
      const legal = legalMoves(game.board);
      if (!legal.length) break;
      const [u, next] = draw(r);
      r = next;
      game = move(game, legal[Math.floor(u * legal.length)]).game;
      if (!game.over && game.board.filter((v) => v === 0).length >= 2)
        usable = game.board.slice();
      if (!game.over && filter?.applies(game.board))
        tagged = game.board.slice();
    }
    pool.push({
      id: `${filter ? `${split}-${filter.key}` : split}-${round}-${n}`,
      board: tagged ?? usable,
      seed: hash(`rollout:${seed}`),
      tagged: !!tagged,
    });
  }
  return pool;
}
