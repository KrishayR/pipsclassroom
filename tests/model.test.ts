import test from "node:test";
import assert from "node:assert/strict";
import { modelPolicy } from "../server/model";
import { createGame, observe } from "../src/core/engine";
import { emptyWorkspace } from "../src/core/skills";
const response = (message: unknown) =>
  new Response(
    JSON.stringify({ choices: [{ message }], usage: { total_tokens: 50 } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
test("model chooses tools, receives matched tool IDs, and selects a valid move", async () => {
  let calls = 0;
  const obs = observe(createGame(3));
  const policy = modelPolicy({
    key: "test",
    baseUrl: "https://example.invalid/v1",
    model: "test-model",
    tokenBudget: 100000,
    fetch: (async (_url, init) => {
      const request = JSON.parse(init!.body as string);
      calls++;
      if (calls === 1) {
        assert.equal(request.messages[1].content.includes("rng"), false);
        return response({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "run_skill", arguments: "{}" },
            },
          ],
        });
      }
      assert.ok(
        request.messages.some(
          (m: { tool_call_id?: string }) => m.tool_call_id === "call-1",
        ),
      );
      return response({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call-2",
            type: "function",
            function: {
              name: "apply_move",
              arguments: JSON.stringify({
                direction: obs.legal[0],
                summary: "Uses available space.",
              }),
            },
          },
        ],
      });
    }) as typeof fetch,
  });
  const d = await policy.decide(obs, emptyWorkspace(), 42);
  assert.equal(d.calls, 2);
  assert.equal(d.tokens, 100);
  assert.equal(d.action, obs.legal[0]);
  assert.ok(d.simulations <= 96);
});
test("budget exhaustion prevents network use", async () => {
  let called = false;
  const policy = modelPolicy({
    key: "test",
    baseUrl: "https://example.invalid",
    model: "test",
    tokenBudget: 1,
    fetch: (async () => {
      called = true;
      return response({});
    }) as typeof fetch,
  });
  await assert.rejects(
    policy.decide(observe(createGame(1)), emptyWorkspace(), 1),
    /ceiling/,
  );
  assert.equal(called, false);
});
test("API failure never falls back to a simulated move", async () => {
  const policy = modelPolicy({
    key: "test",
    baseUrl: "https://example.invalid",
    model: "test",
    tokenBudget: 100000,
    fetch: (async () => new Response("no", { status: 401 })) as typeof fetch,
  });
  await assert.rejects(
    policy.decide(observe(createGame(1)), emptyWorkspace(), 1),
    /HTTP 401/,
  );
  assert.equal(policy.usage().calls, 1);
  assert.ok(policy.usage().tokens > 0);
});
