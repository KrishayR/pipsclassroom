import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { liveBatchRunner } from "../server/batch";
import { simulationPolicy } from "../src/core/policy";
import { keyPool } from "../server/keys";
import { batchFromEnv } from "../server/config";

test("timed learning test stops new work at its deadline, saves partial results and keeps normal budgets unchanged", async () => {
  const root = mkdtempSync(join(tmpdir(), "cl-timed-"));
  const normalBudget = batchFromEnv().budgetUsd;
  const base = simulationPolicy();
  const runner = liveBatchRunner(() => {}, {
    root,
    createPolicy: () => ({
      ...base,
      decide: async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 8));
        return base.decide(...args);
      },
    }),
    createPool: () =>
      keyPool({ keys: ["offline"], limitUsd: Infinity, prices: null }),
    getPrices: () => ({ input: 1, output: 1 }),
    protocol: {
      exerciseMoves: 0,
      verify: { practice: 1, regression: 1, moves: 1 },
      examConcurrency: 6,
    },
  });
  await runner.start(100, "classroom", false, {
    maxRuntimeMs: 40,
    budgetUsd: 20,
    examMoves: 10,
    examSeeds: 2,
  });
  const status = runner.status()!;
  assert.equal(status.status, "stopped");
  assert.equal(status.stopReason, "Five-hour time limit reached");
  assert.equal(status.canResume, false);
  assert.equal(status.completed, 0);
  assert.equal(status.budgetUsd, 20);
  assert.ok(status.deadlineAt);
  assert.ok(existsSync(`${status.directory}/final.json`));
  assert.equal(batchFromEnv().budgetUsd, normalBudget);
  await assert.rejects(runner.resume(), /no resumable checkpoint/);
});

test("resume preserves baseline, practice, exam settings and cumulative session spend across restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "cl-resume-"));
  const rates = { input: 1, output: 1 };
  const pool = keyPool({
    keys: ["offline-only"],
    limitUsd: Infinity,
    prices: rates,
  });
  let fail = true;
  const options = {
    root,
    createPool: () => pool,
    getPrices: () => rates,
    protocol: {
      reviseRejected: false,
      verify: { practice: 1, regression: 1, moves: 1 },
      exerciseMoves: 1,
    },
    createPolicy: () => {
      const policy = simulationPolicy();
      return {
        ...policy,
        propose: async (...args: Parameters<typeof policy.propose>) => {
          pool.record("key 1", {
            promptTokens: fail ? 200000 : 1000,
            completionTokens: 0,
          });
          if (fail) throw new Error("Simulated teaching outage");
          return policy.propose(...args);
        },
      };
    },
  };
  const batch = liveBatchRunner(() => {}, options);
  await batch.start(1, "classroom");
  assert.equal(batch.status()!.status, "error");
  assert.equal(batch.status()!.canResume, true);
  const directory = batch.status()!.directory;
  const baseline = readFileSync(`${directory}/baseline.json`, "utf8");
  const practice = readFileSync(`${directory}/cycle-1-practice.json`, "utf8");
  const originalBudget = batch.status()!.budgetUsd;
  const originalMoves = JSON.parse(baseline).state.exams[0].cap;
  assert.ok(batch.status()!.spentUsd >= 0.2);
  const originalBudgetEnv = process.env.BATCH_BUDGET_USD;
  const originalMovesEnv = process.env.BATCH_EXAM_MOVES;
  try {
    process.env.BATCH_BUDGET_USD = "9";
    process.env.BATCH_EXAM_MOVES = "1";
    fail = false;
    const restarted = liveBatchRunner(() => {}, options);
    await restarted.resume();
    const status = restarted.status()!;
    assert.equal(status.status, "complete");
    assert.equal(status.canResume, false);
    assert.equal(status.directory, directory);
    assert.equal(status.budgetUsd, originalBudget);
    assert.ok(Math.abs(status.spentUsd - pool.status()[0].spentUsd) < 1e-9);
    assert.equal(status.timings!.length, 4);
    assert.equal(status.cycles.length, 1);
    assert.equal(status.cycles[0].attempts!.length, 3);
    assert.equal(readFileSync(`${directory}/baseline.json`, "utf8"), baseline);
    assert.equal(
      readFileSync(`${directory}/cycle-1-practice.json`, "utf8"),
      practice,
    );
    const final = JSON.parse(readFileSync(`${directory}/final.json`, "utf8"));
    assert.equal(final.state.exams.length, 2);
    assert.equal(final.state.exams[1].cap, originalMoves);
    await assert.rejects(restarted.resume(), /no resumable checkpoint/);
  } finally {
    for (const [name, value] of [
      ["BATCH_BUDGET_USD", originalBudgetEnv],
      ["BATCH_EXAM_MOVES", originalMovesEnv],
    ]) {
      if (value === undefined) delete process.env[name!];
      else process.env[name!] = value;
    }
  }
});

test("configurable batches validate counts and save baseline, each cycle, and final evidence without network calls", async () => {
  for (const count of [5, 2]) {
    const root = mkdtempSync(join(tmpdir(), "cl-batch-"));
    const batch = liveBatchRunner(() => {}, {
      root,
      createPolicy: simulationPolicy,
      createPool: () =>
        keyPool({ keys: ["test-only"], limitUsd: 1, prices: null }),
      getPrices: () => ({ input: 0.1, output: 0.2 }),
      protocol: {
        reviseRejected: false,
        verify: { practice: 1, regression: 1, moves: 1 },
        exerciseMoves: 1,
      },
    });
    for (const invalid of [0, -1, 1.5, 101, NaN])
      await assert.rejects(batch.start(invalid), /whole number/);
    assert.equal(batch.status(), undefined);
    await batch.start(count);
    const status = batch.status()!;
    assert.equal(status.status, "complete");
    assert.equal(status.completed, count);
    assert.equal(status.total, count);
    assert.equal(status.concurrency, 3);
    assert.equal(status.verificationConcurrency, 6);
    assert.equal(status.timings!.length, 1 + count * 4);
    assert.equal(status.baseline!.length, 3);
    assert.deepEqual(
      status.cycles.map((c) => c.student),
      ["Ada", "Lin", "Sam", "Ada", "Lin"].slice(0, count),
    );
    assert.ok(
      status.cycles.every(
        (c) => c.rows.length === 3 && !!c.lesson.verification,
      ),
    );
    assert.equal(status.spentUsd, 0);
    assert.ok(existsSync(`${status.directory}/cycle-${count}.json`));
    const report = JSON.parse(
      readFileSync(`${status.directory}/final.json`, "utf8"),
    );
    assert.equal(report.state.exams.length, count + 1);
    assert.equal(report.state.ledger.length, count);
    assert.equal(report.state.calls, 0);
    assert.ok(
      report.state.exams.every((e: any) =>
        e.rows.every((r: any) => r.trajectory.length === r.moves),
      ),
    );
    assert.equal(report.protocol.concurrency, 3);
    assert.equal(report.protocol.verificationConcurrency, 6);
    assert.equal(
      liveBatchRunner(() => {}, { root }).status()!.completed,
      count,
    );
    batch.clearProgress();
    assert.equal(batch.status(), undefined);
    assert.equal(batch.archiveStatus()!.completed, count);
    assert.equal(liveBatchRunner(() => {}, { root }).status(), undefined);
    assert.ok(existsSync(`${status.directory}/final.json`));
  }
});
