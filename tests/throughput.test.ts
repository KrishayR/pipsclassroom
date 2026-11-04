import test from "node:test";
import assert from "node:assert/strict";
import { Classroom } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import { modelPolicy } from "../server/model";
import { requestLimiter } from "../src/core/concurrency";
import { createGame, observe } from "../src/core/engine";
import { emptyWorkspace } from "../src/core/skills";

test("six exam workers run independent seeds together with identical deterministic results", async () => {
  const run = async (workers: number) => {
    let active = 0,
      peak = 0;
    const base = simulationPolicy();
    const lab = new Classroom(
      {
        ...base,
        decide: async (...args) => {
          peak = Math.max(peak, ++active);
          try {
            await new Promise<void>((resolve) => setImmediate(resolve));
            return await base.decide(...args);
          } finally {
            active--;
          }
        },
      },
      undefined,
      { examConcurrency: workers },
    );
    const notes = structuredClone(lab.state.students.map((s) => s.workspace));
    await lab.exam(3, 6);
    assert.equal(peak, workers);
    assert.deepEqual(
      lab.state.students.map((s) => s.workspace),
      notes,
    );
    return {
      rows: lab.state.exams[0].rows.map(({ latencyMs, ...row }) => row),
      games: lab.state.students.map((s) => s.game),
    };
  };
  assert.deepEqual(await run(6), await run(1));
});

test("stopping parallel exams drains active games without starting queued games", async () => {
  const base = simulationPolicy();
  let calls = 0;
  const lab = new Classroom(
    {
      ...base,
      decide: async (...args) => {
        calls++;
        await new Promise<void>((resolve) => setImmediate(resolve));
        lab.stop();
        return base.decide(...args);
      },
    },
    undefined,
    { examConcurrency: 6 },
  );
  await lab.exam(3, 10);
  assert.equal(calls, 6);
  assert.equal(lab.state.exams[0].rows.length, 6);
  assert.equal(lab.state.exams[0].completedAt, undefined);
});

test("request diagnostics separate concurrency queue, pacing and provider waiting without recording secrets", async () => {
  const policy = modelPolicy({
    key: "private-test-value",
    baseUrl: "https://example.invalid",
    model: "fixture",
    tokenBudget: 1000000,
    reasoningEffort: "low",
    requestGate: requestLimiter(1),
    limiter: () => new Promise((resolve) => setTimeout(resolve, 3)),
    fetch: (async (_url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const data = JSON.parse(init!.body as string);
      const board = JSON.parse(data.messages[1].content).observation;
      return new Response(
        JSON.stringify({
          usage: { total_tokens: 50 },
          choices: [
            {
              message: {
                role: "assistant",
                tool_calls: [
                  {
                    id: "move",
                    type: "function",
                    function: {
                      name: "apply_move",
                      arguments: JSON.stringify({
                        direction: board.legal[0],
                        summary: "fixture",
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    }) as typeof fetch,
  });
  await Promise.all(
    [1, 2, 3].map((seed) =>
      policy.decide(observe(createGame(seed)), emptyWorkspace(), seed),
    ),
  );
  const stats = policy.diagnostics!();
  assert.equal(stats.completed, 3);
  assert.equal(stats.attempts, 3);
  assert.equal(stats.failed, 0);
  assert.equal(stats.active, 0);
  assert.equal(stats.queued, 0);
  assert.ok(
    stats.queueMs > 0 && stats.rateWaitMs > 0 && stats.providerHeadersMs > 0,
  );
  assert.equal(stats.reasoningEffort, "low");
  assert.ok(!JSON.stringify(stats).includes("private-test-value"));
});
