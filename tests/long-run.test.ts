import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { liveBatchRunner } from "../server/batch";
import { keyPool } from "../server/keys";
import { simulationPolicy } from "../src/core/policy";
import {
  longRunTuning,
  compactRanking,
  rankingColumns,
} from "../server/long-run-tuning";
import type { RequestDiagnostics } from "../src/core/types";

const makeRunner = () =>
  liveBatchRunner(() => {}, {
    root: mkdtempSync(join(tmpdir(), "cl-long-")),
    createPolicy: simulationPolicy,
    createPool: () =>
      keyPool({ keys: ["offline"], limitUsd: Infinity, prices: null }),
    getPrices: () => ({ input: 1, output: 1 }),
    protocol: {
      exerciseMoves: 1,
      reviseRejected: false,
      verify: { practice: 1, regression: 1, moves: 1 },
    },
  });
const limits = {
  budgetUsd: 20,
  examMoves: 2,
  examSeeds: 1,
  maxRuntimeMs: 600000,
  finalExamReserveMs: 0,
};

test("alternate long-run exams preserve teaching outcomes and practice evidence while ordinary runs still examine every cycle", async () => {
  const normal = makeRunner(),
    optimized = makeRunner();
  await normal.start(2, "classroom", false, limits);
  await optimized.start(2, "classroom", false, { ...limits, optimize: true });
  const load = (runner: typeof normal) =>
    JSON.parse(readFileSync(`${runner.status()!.directory}/final.json`, "utf8"))
      .state;
  const before = load(normal),
    after = load(optimized);
  assert.equal(before.exams.length, 3);
  assert.equal(after.exams.length, 2);
  assert.deepEqual(
    optimized.status()!.cycles.map((c) => c.examSkipped),
    [true, false],
  );
  assert.equal(optimized.status()!.cycles[0].rows.length, 0);
  assert.equal(optimized.status()!.finalExamCompleted, true);
  const normalize = (state: typeof before) => ({
    round: state.trainingRound,
    students: state.students.map((s: any) => ({
      skill: s.workspace.skill,
      version: s.workspace.version,
      traces: s.traces.map((t: any) => ({
        before: t.before,
        after: t.after,
        action: t.action,
        exercise: t.exercise,
      })),
    })),
    lessons: state.ledger.map((l: any) => ({
      title: l.title,
      rule: l.rule,
      trigger: l.trigger,
      exception: l.exception,
      limits: l.limits,
      skill: l.skill,
      status: l.status,
      verification: l.verification,
    })),
  });
  const stable = (state: typeof before) => {
    const ids = new Map(
      state.ledger.map((lesson: any, i: number) => [lesson.id, `lesson-${i}`]),
    );
    return JSON.parse(
      JSON.stringify(normalize(state), (key, value) =>
        key === "lessonId" && ids.has(value) ? ids.get(value) : value,
      ),
    );
  };
  assert.deepEqual(stable(after), stable(before));
});

test("an odd last teaching cycle receives a final independent exam", async () => {
  const runner = makeRunner();
  await runner.start(1, "classroom", false, { ...limits, optimize: true });
  assert.equal(runner.status()!.status, "complete");
  assert.equal(runner.status()!.finalExamCompleted, true);
  const final = JSON.parse(
    readFileSync(`${runner.status()!.directory}/final.json`, "utf8"),
  );
  assert.equal(final.state.exams.length, 2);
  assert.equal(runner.status()!.cycles[0].examSkipped, true);
  assert.ok(final.state.exams.at(-1).completedAt);
});

test("long-run table encoding retains every ranking value", () => {
  const ranking = [
    { action: "left", value: 1.2, lossRate: 3, meanEmpty: 5, samples: 9 },
    { action: "up", value: -2, lossRate: 0, meanEmpty: 4, samples: 6 },
  ];
  assert.deepEqual(
    compactRanking(ranking).map((row) =>
      Object.fromEntries(rankingColumns.map((column, i) => [column, row[i]])),
    ),
    ranking,
  );
});

test("long-run request slots only rise on measured headroom, stay bounded and fall back on errors", async () => {
  const tuning = longRunTuning(120);
  assert.equal(tuning.limit(), 6);
  const stats: RequestDiagnostics = {
    reasoningEffort: "low",
    queued: 0,
    active: 0,
    completed: 100,
    failed: 0,
    attempts: 100,
    retries: 0,
    rateLimited: 0,
    serverErrors: 0,
    transportErrors: 0,
    queueMs: 0,
    rateWaitMs: 1000,
    providerHeadersMs: 600000,
    bodyMs: 0,
    retryWaitMs: 0,
  };
  assert.equal(tuning.adapt(stats), 9);
  let active = 0,
    peak = 0;
  await Promise.all(
    Array.from({ length: 18 }, () =>
      tuning.run(async () => {
        peak = Math.max(peak, ++active);
        await new Promise<void>((r) => setImmediate(r));
        active--;
      }),
    ),
  );
  assert.equal(peak, 9);
  assert.equal(tuning.adapt({ ...stats, rateLimited: 1 }), 6);
  assert.equal(tuning.adapt({ ...stats, rateWaitMs: 500000 }), 6);
  assert.equal(tuning.adapt({ ...stats, attempts: 2 }), 6);
  assert.equal(tuning.adapt({ ...stats, providerHeadersMs: 200000 }), 6);
});
