import test from "node:test";
import assert from "node:assert/strict";
import { Classroom } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import { mapConcurrent, requestLimiter } from "../src/core/concurrency";
import { budgetedKeyPool, keyPool } from "../server/keys";

const pause = () => new Promise<void>((r) => setImmediate(r));
test("parallel stages preserve seeded game trajectories, evidence, verification and exam outcomes", async () => {
  const execute = async (
    concurrency: number,
    verificationConcurrency = concurrency,
  ) => {
    const base = simulationPolicy();
    let active = 0,
      peak = 0;
    const lab = new Classroom(
      {
        ...base,
        async decide(...args) {
          peak = Math.max(peak, ++active);
          try {
            await pause();
            return await base.decide(...args);
          } finally {
            active--;
          }
        },
      },
      undefined,
      { concurrency, verificationConcurrency },
    );
    await lab.practice(4);
    const practicePeak = peak;
    peak = 0;
    await lab.diagnose();
    const diagnosticPeak = peak;
    peak = 0;
    await lab.review("student-1");
    peak = 0;
    await lab.verify();
    const verificationPeak = peak;
    peak = 0;
    await lab.exam(2, 15);
    assert.equal(active, 0);
    return {
      peaks: [practicePeak, diagnosticPeak, verificationPeak, peak],
      traces: lab.state.students.map((s) =>
        s.traces.map((t) => ({
          before: t.before,
          after: t.after,
          action: t.action,
          episode: t.episodeId,
          exercise: t.exercise,
          version: t.workspaceVersion,
        })),
      ),
      workspaces: lab.state.students.map((s) => ({
        version: s.workspace.version,
        skill: s.workspace.skill,
        rules: s.workspace.lessons.map((l) => l.rule),
      })),
      checks: lab.state.ledger.map((l) => l.verification),
      exams: lab.state.exams.flatMap((e) =>
        e.rows.map(({ latencyMs, ...row }) => row),
      ),
      games: lab.state.students.map((s) => s.game),
      usage: {
        calls: lab.state.calls,
        tokens: lab.state.tokens,
        simulations: lab.state.simulations,
      },
    };
  };
  const serial = await execute(1),
    parallel = await execute(3);
  assert.deepEqual(serial.peaks, [1, 1, 1, 1]);
  assert.deepEqual(parallel.peaks, [3, 3, 3, 3]);
  const { peaks: a, ...expected } = serial;
  const { peaks: b, ...actual } = parallel;
  assert.deepEqual(actual, expected);
  const { peaks: c, ...sixWay } = await execute(3, 6);
  assert.deepEqual(c, [3, 3, 6, 3]);
  assert.deepEqual(sixWay, expected);
});

test("a failed parallel stage drains in-flight work and starts no queued jobs", async () => {
  let fail!: () => void, finish!: () => void;
  const failed = new Promise<void>((r) => {
    fail = r;
  });
  const drained = new Promise<void>((r) => {
    finish = r;
  });
  const started: number[] = [];
  let settled = false;
  const operation = mapConcurrent([0, 1, 2, 3], 2, async (n) => {
    started.push(n);
    if (n === 0) {
      await failed;
      throw new Error("fixture failure");
    }
    await drained;
    return n;
  });
  const rejected = assert.rejects(operation, /fixture failure/).then(() => {
    settled = true;
  });
  fail();
  await pause();
  assert.equal(settled, false);
  assert.deepEqual(started, [0, 1]);
  finish();
  await rejected;
  assert.equal(settled, true);
});

test("stopping parallel diagnostics drains decisions and restores all original games", async () => {
  const base = simulationPolicy();
  let active = 0;
  const lab = new Classroom(
    {
      ...base,
      async decide(...args) {
        active++;
        try {
          await pause();
          return await base.decide(...args);
        } finally {
          active--;
        }
      },
    },
    undefined,
    { concurrency: 3 },
  );
  const before = structuredClone(lab.state.students.map((s) => s.game));
  let stopped = false;
  lab.subscribe((s) => {
    if (!stopped && s.students.some((s) => s.traces.length)) {
      stopped = true;
      lab.stop();
    }
  });
  await lab.diagnose();
  assert.equal(active, 0);
  assert.equal(lab.state.busy, false);
  assert.deepEqual(
    lab.state.students.map((s) => s.game),
    before,
  );
  assert.ok(lab.state.students.every((s) => s.traces.length <= 1));
});

test("request limiter caps concurrent requests and releases slots after failure", async () => {
  const run = requestLimiter(3);
  let active = 0,
    peak = 0;
  const jobs = Array.from({ length: 8 }, (_, i) =>
    run(async () => {
      peak = Math.max(peak, ++active);
      try {
        await pause();
        if (i === 2) throw new Error("fixture");
        return i;
      } finally {
        active--;
      }
    }),
  );
  const results = await Promise.allSettled(jobs);
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 7);
});

test("batch and key ceilings include in-flight reservations and settle exactly once", () => {
  const rates = { input: 1000, output: 1000 };
  const pool = keyPool({ keys: ["fixture"], limitUsd: 10, prices: rates });
  const bounded = budgetedKeyPool(pool, rates, 1);
  const worst = { promptTokens: 200, completionTokens: 200 };
  const a = bounded.reserve!(worst),
    b = bounded.reserve!(worst);
  assert.throws(() => bounded.reserve!(worst), /batch budget/);
  a.settle({ promptTokens: 50, completionTokens: 50 });
  a.settle({ promptTokens: 50, completionTokens: 50 });
  const c = bounded.reserve!(worst);
  b.release();
  c.release();
  assert.equal(pool.status()[0].spentUsd, 0.1);
  const limited = keyPool({ keys: ["fixture"], limitUsd: 0.5, prices: rates });
  const held = limited.reserve!(worst);
  assert.throws(() => limited.reserve!(worst), /All 1 API keys/);
  held.release();
  limited.reserve!(worst).release();
});
