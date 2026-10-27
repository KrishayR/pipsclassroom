import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  slide,
  move,
  legalMoves,
  fromBoard,
  observe,
  snapshotPool,
} from "../src/core/engine";
import {
  DEFAULT_SKILL,
  simulate,
  validateSkill,
  emptyWorkspace,
  installLesson,
} from "../src/core/skills";
const board = (row: number[]) => [...row, ...Array(12).fill(0)];
test("tiles merge once, in direction order, and score correctly", () => {
  assert.deepEqual(slide(board([2, 2, 2, 2]), "left"), {
    board: board([4, 4, 0, 0]),
    gain: 8,
    changed: true,
  });
  assert.deepEqual(
    slide(board([2, 2, 4, 0]), "left").board,
    board([4, 4, 0, 0]),
  );
  assert.deepEqual(
    slide(board([2, 2, 4, 0]), "right").board,
    board([0, 0, 4, 4]),
  );
  const vertical = [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0];
  assert.deepEqual(
    slide(vertical, "up").board,
    [4, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  );
});
test("no-op moves do not consume RNG, move count, score, or spawn", () => {
  const game = fromBoard(board([2, 0, 0, 0]), 42);
  const result = move(game, "left");
  assert.equal(result.game, game);
  assert.equal(result.spawn, null);
  assert.equal(result.changed, false);
});
test("seeded legal trajectory replays exactly and conserves mass plus spawn", () => {
  let a = createGame(922),
    b = createGame(922);
  for (let i = 0; i < 200; i++) {
    const legal = legalMoves(a.board);
    if (!legal.length) break;
    const direction = legal[i % legal.length];
    const before = a.board.reduce((s, v) => s + v, 0);
    const result = move(a, direction);
    a = result.game;
    b = move(b, direction).game;
    assert.deepEqual(a, b);
    assert.equal(
      a.board.reduce((s, v) => s + v, 0),
      before + result.spawn!.value,
    );
    assert.equal(a.moves, i + 1);
  }
});
test("terminal and target detection", () => {
  assert.equal(
    fromBoard([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2], 1).over,
    true,
  );
  assert.equal(
    move(fromBoard(board([1024, 1024, 0, 0]), 1), "left").game.won,
    true,
  );
});
test("planning cannot observe or alter actual future RNG", () => {
  const a = createGame(4),
    before = structuredClone(a);
  const obs = observe(a);
  assert.ok(!("rng" in obs));
  assert.ok(!("seed" in obs));
  const first = simulate(obs.board, DEFAULT_SKILL, 99);
  a.rng = 123;
  assert.deepEqual(first, simulate(observe(a).board, DEFAULT_SKILL, 99));
  assert.deepEqual(a.board, before.board);
  assert.ok(first.transitions <= 96);
  assert.ok(first.ranking.every((r) => obs.legal.includes(r.action)));
});
test("skill bounds and memory gate reject unchecked candidates", () => {
  assert.throws(() => validateSkill({ ...DEFAULT_SKILL, depth: 99 }));
  assert.throws(() => validateSkill({ ...DEFAULT_SKILL, spaceWeight: NaN }));
  assert.throws(() =>
    installLesson(emptyWorkspace(), { status: "candidate" } as never),
  );
});
test("verification pools reproduce and remain disjoint", () => {
  assert.deepEqual(snapshotPool("practice"), snapshotPool("practice"));
  assert.ok(
    [...snapshotPool("practice"), ...snapshotPool("regression")].every(
      (s) => legalMoves(s.board).length > 0,
    ),
  );
  const a = new Set(snapshotPool("practice").map((s) => s.seed));
  assert.ok(snapshotPool("regression").every((s) => !a.has(s.seed)));
});
test("accepted workspace retains bounded memory and previous workspace stays immutable", () => {
  const before = emptyWorkspace();
  const accepted = {
    id: "fixture",
    title: "A verified test fixture",
    rule: "Keep options open.",
    trigger: "always",
    exception: "Check the board.",
    source: "test",
    evidence: ["trace"],
    status: "verified" as const,
    skill: { ...DEFAULT_SKILL, version: 2, spaceWeight: 18 },
    createdAt: "2026-10-27",
    verification: {
      rows: [
        {
          snapshot: "test",
          split: "practice" as const,
          seed: 1,
          baseline: 1,
          candidate: 3,
          delta: 2,
        },
      ],
      meanDelta: 2,
      regressionDelta: 0,
      accepted: true,
      rule: "fixture",
      mode: "simulation" as const,
    },
  };
  const after = installLesson(before, accepted);
  assert.equal(after.version, 2);
  assert.equal(after.skill.spaceWeight, 18);
  assert.equal(before.lessons.length, 0);
  assert.equal(before.skill.spaceWeight, 12);
});
