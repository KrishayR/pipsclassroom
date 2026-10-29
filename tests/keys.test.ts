import test from "node:test";
import assert from "node:assert/strict";
import { keyPool, keyProblem } from "../server/keys";
import { modelPolicy } from "../server/model";
import { createGame, observe } from "../src/core/engine";
import { emptyWorkspace } from "../src/core/skills";
const move = (direction: string) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "c",
                type: "function",
                function: {
                  name: "apply_move",
                  arguments: JSON.stringify({ direction, summary: "ok" }),
                },
              },
            ],
          },
        },
      ],
      usage: {
        total_tokens: 3000,
        prompt_tokens: 2000,
        completion_tokens: 1000,
      },
    }),
    { status: 200 },
  );
const prices = { input: 1000, output: 1000 }; // $1 per 1k tokens, for round numbers
test("a key is skipped before a request could pass its limit, and spend is logged per key", async () => {
  const pool = keyPool({ keys: ["k1", "k2"], limitUsd: 10, prices });
  const used: string[] = [];
  const obs = observe(createGame(1));
  const policy = modelPolicy({
    keys: pool,
    baseUrl: "https://example.invalid/v1",
    model: "m",
    tokenBudget: 1e9,
    maxCompletionTokens: 1000,
    fetch: (async (_u, init) => {
      used.push((init!.headers as Record<string, string>).Authorization);
      return move(obs.legal[0]);
    }) as typeof fetch,
  });
  for (let i = 0; i < 4; i++) await policy.decide(obs, emptyWorkspace(), 1);
  // Each call costs $3; the worst case of the next call decides when to switch.
  const switched = used.indexOf("Bearer k2");
  assert.ok(switched >= 2);
  assert.ok(used.slice(switched).every((u) => u === "Bearer k2"));
  const status = pool.status();
  assert.equal(status[0].spentUsd, 3 * switched);
  assert.ok(status.every((s) => s.spentUsd <= 10));
  assert.ok(status.every((s) => !JSON.stringify(s).includes('k1"')));
});
test("an out-of-credit key is retired and the same request goes to the next key", async () => {
  const pool = keyPool({ keys: ["k1", "k2"], limitUsd: 150, prices: null });
  const used: string[] = [];
  const obs = observe(createGame(1));
  const policy = modelPolicy({
    keys: pool,
    baseUrl: "https://example.invalid/v1",
    model: "m",
    tokenBudget: 1e9,
    fetch: (async (_u, init) => {
      const auth = (init!.headers as Record<string, string>).Authorization;
      used.push(auth);
      return auth === "Bearer k1"
        ? new Response(
            JSON.stringify({
              error: { code: "insufficient_quota", message: "No credit left" },
            }),
            { status: 429 },
          )
        : move(obs.legal[0]);
    }) as typeof fetch,
  });
  const d = await policy.decide(obs, emptyWorkspace(), 1);
  assert.equal(d.action, obs.legal[0]);
  assert.deepEqual(used, ["Bearer k1", "Bearer k2"]);
  assert.match(pool.status()[0].retired!, /out of credit/);
  assert.equal(policy.usage().calls, 1);
});
test("plain rate limits do not switch keys, and an exhausted pool sends nothing", async () => {
  assert.equal(
    keyProblem(
      429,
      JSON.stringify({
        error: { code: "rate_limit_exceeded", message: "Slow down" },
      }),
    ),
    null,
  );
  assert.match(keyProblem(402, "")!, /out of credit/);
  assert.match(
    keyProblem(401, '{"error":{"code":"invalid_api_key"}}')!,
    /rejected/,
  );
  const pool = keyPool({ keys: ["k1"], limitUsd: 150, prices: null });
  pool.retire("key 1", "out of credit");
  let sent = false;
  const policy = modelPolicy({
    keys: pool,
    baseUrl: "https://example.invalid/v1",
    model: "m",
    tokenBudget: 1e9,
    fetch: (async () => {
      sent = true;
      return move("left");
    }) as typeof fetch,
  });
  await assert.rejects(
    policy.decide(observe(createGame(1)), emptyWorkspace(), 1),
    /All 1 API keys are used up/,
  );
  assert.equal(sent, false);
});
