import test from "node:test";
import assert from "node:assert/strict";
import { snapshotPool, legalMoves } from "../src/core/engine";
import {
  DEFAULT_SKILL,
  simulate,
  clearPlanningCache,
  planningCacheStats,
} from "../src/core/skills";

test("cached planning exactly matches uncached results across boards, strategies, seeds, budgets and action orders", () => {
  clearPlanningCache();
  for (const sample of snapshotPool("sensitivity", 13, undefined, 5)) {
    for (const skill of [
      DEFAULT_SKILL,
      { ...DEFAULT_SKILL, depth: 3, structureWeight: 4, version: 2 },
    ]) {
      for (const budget of [0, 32, 96])
        for (const seed of [sample.seed, sample.seed + 1]) {
          const actions = legalMoves(sample.board).reverse();
          const expected = simulate(
            sample.board,
            skill,
            seed,
            budget,
            actions,
            false,
          );
          assert.deepEqual(
            simulate(sample.board, skill, seed, budget, actions),
            expected,
          );
          assert.deepEqual(
            simulate(sample.board, { ...skill }, seed, budget, [...actions]),
            expected,
          );
        }
    }
  }
  assert.equal(planningCacheStats().hits, 60);
  assert.equal(planningCacheStats().misses, 60);
});

test("callers cannot mutate cached plans, stale inputs miss, and invalid inputs are still rejected", () => {
  clearPlanningCache();
  const { board, seed } = snapshotPool("sensitivity", 17, undefined, 1)[0];
  const actions = legalMoves(board);
  const original = simulate(board, DEFAULT_SKILL, seed);
  const expected = structuredClone(original);
  original.ranking[0].value = 123456;
  const hit = simulate(board, DEFAULT_SKILL, seed);
  assert.deepEqual(hit, expected);
  hit.ranking.length = 0;
  assert.deepEqual(simulate(board, DEFAULT_SKILL, seed), expected);
  const variants = [
    { ...DEFAULT_SKILL, depth: 3 },
    { ...DEFAULT_SKILL, spaceWeight: 20 },
    { ...DEFAULT_SKILL, structureWeight: 4 },
    { ...DEFAULT_SKILL, mergeWeight: 3 },
    { ...DEFAULT_SKILL, riskWeight: 180 },
    { ...DEFAULT_SKILL, version: 2 },
  ];
  for (const skill of variants)
    assert.deepEqual(
      simulate(board, skill, seed),
      simulate(board, skill, seed, 96, actions, false),
    );
  simulate(board, DEFAULT_SKILL, seed + 1);
  simulate(board, DEFAULT_SKILL, seed, 32);
  simulate(board, DEFAULT_SKILL, seed, 96, [...actions].reverse());
  assert.equal(planningCacheStats().misses, 10);
  assert.throws(
    () => simulate(board, { ...DEFAULT_SKILL, depth: 0 }, seed),
    /Invalid skill/,
  );
  assert.throws(
    () => simulate(board, DEFAULT_SKILL, seed, 96, ["invalid" as never]),
    /legal actions/,
  );
  const changed = [...board];
  changed[0] = -1;
  assert.throws(() => simulate(changed, DEFAULT_SKILL, seed));
});

test("planning cache evicts least-recently-used entries and stays bounded", () => {
  clearPlanningCache();
  const { board } = snapshotPool("sensitivity", 18, undefined, 1)[0];
  const { limit } = planningCacheStats();
  for (let i = 0; i < limit; i++) simulate(board, DEFAULT_SKILL, i, 0);
  simulate(board, DEFAULT_SKILL, 0, 0); // Keep oldest key alive.
  simulate(board, DEFAULT_SKILL, limit, 0);
  assert.equal(planningCacheStats().size, limit);
  let misses = planningCacheStats().misses;
  simulate(board, DEFAULT_SKILL, 0, 0);
  assert.equal(planningCacheStats().misses, misses);
  simulate(board, DEFAULT_SKILL, 1, 0);
  assert.equal(planningCacheStats().misses, misses + 1);
  assert.equal(planningCacheStats().size, limit);
});
