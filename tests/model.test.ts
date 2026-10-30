import test from "node:test";
import assert from "node:assert/strict";
import { modelPolicy } from "../server/model";
import { createGame, observe } from "../src/core/engine";
import { emptyWorkspace } from "../src/core/skills";
test("concurrent decisions report their own tokens and calls, without double counting", async () => {
  let active = 0,
    peak = 0;
  const policy = modelPolicy({
    key: "fixture",
    baseUrl: "https://example.invalid/v1",
    model: "fixture",
    tokenBudget: 1000000,
    fetch: (async (_url, init) => {
      peak = Math.max(peak, ++active);
      const request = JSON.parse(init!.body as string);
      const observation = JSON.parse(request.messages[1].content).observation;
      await new Promise<void>((r) => setImmediate(r));
      active--;
      return response({
        role: "assistant",
        tool_calls: [
          {
            id: "fixture",
            type: "function",
            function: {
              name: "apply_move",
              arguments: JSON.stringify({
                direction: observation.legal[0],
                summary: "fixture",
              }),
            },
          },
        ],
      });
    }) as typeof fetch,
  });
  const decisions = await Promise.all(
    [1, 2, 3, 4, 5, 6].map((seed) =>
      policy.decide(observe(createGame(seed)), emptyWorkspace(), seed),
    ),
  );
  assert.equal(peak, 3);
  assert.ok(decisions.every((d) => d.tokens === 50 && d.calls === 1));
  assert.equal(policy.usage().tokens, 300);
  assert.equal(policy.usage().calls, 6);
});
const response = (message: unknown) =>
  new Response(
    JSON.stringify({ choices: [{ message }], usage: { total_tokens: 50 } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
test("stopping prevents queued model requests from being sent and drains active ones", async () => {
  let stopped = false,
    sent = 0;
  let release!: () => void;
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const policy = modelPolicy({
    key: "fixture",
    baseUrl: "https://example.invalid/v1",
    model: "fixture",
    tokenBudget: 1000000,
    beforeRequest: () => {
      if (stopped) throw new Error("fixture stopped");
    },
    fetch: (async (_url, init) => {
      sent++;
      const request = JSON.parse(init!.body as string);
      const obs = JSON.parse(request.messages[1].content).observation;
      await barrier;
      return response({
        role: "assistant",
        tool_calls: [
          {
            id: "fixture",
            type: "function",
            function: {
              name: "apply_move",
              arguments: JSON.stringify({
                direction: obs.legal[0],
                summary: "fixture",
              }),
            },
          },
        ],
      });
    }) as typeof fetch,
  });
  const jobs = [1, 2, 3, 4, 5, 6].map((seed) =>
    policy.decide(observe(createGame(seed)), emptyWorkspace(), seed),
  );
  const finished = Promise.allSettled(jobs);
  await new Promise<void>((r) => setImmediate(r));
  assert.equal(sent, 3);
  stopped = true;
  release();
  const results = await finished;
  assert.equal(sent, 3);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  assert.equal(results.filter((r) => r.status === "rejected").length, 3);
  assert.equal(policy.usage().calls, 3);
});
test("skill ranking is provided up front; a disallowed tool gets a matched error and the move is still validated", async () => {
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
        const provided = JSON.parse(request.messages[1].content);
        assert.ok(provided.skillRanking.length >= 1);
        assert.deepEqual(
          request.tools.map(
            (t: { function: { name: string } }) => t.function.name,
          ),
          ["apply_move"],
        );
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
  assert.equal(d.invalid, 1);
  assert.ok(d.simulations > 0 && d.simulations <= 96);
  assert.deepEqual(
    d.tools.map((t) => t.name),
    ["provided_context", "run_skill", "run_skill", "apply_move"],
  );
});
test("rate limits and server errors are retried with backoff; the call is counted once", async () => {
  let n = 0;
  const obs = observe(createGame(3));
  const policy = modelPolicy({
    key: "test",
    baseUrl: "https://example.invalid/v1",
    model: "test-model",
    tokenBudget: 100000,
    fetch: (async () => {
      n++;
      if (n === 1)
        return new Response('{"error":{"code":"rate_limit_exceeded"}}', {
          status: 429,
          headers: { "retry-after": "0" },
        });
      if (n === 2) return new Response("busy", { status: 503 });
      return response({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "c",
            type: "function",
            function: {
              name: "apply_move",
              arguments: JSON.stringify({
                direction: obs.legal[0],
                summary: "ok",
              }),
            },
          },
        ],
      });
    }) as typeof fetch,
  });
  const d = await policy.decide(obs, emptyWorkspace(), 1);
  assert.equal(n, 3);
  assert.equal(d.calls, 1);
});
test("a reply truncated by the completion cap is not echoed back", async () => {
  let calls = 0;
  const obs = observe(createGame(3));
  const policy = modelPolicy({
    key: "test",
    baseUrl: "https://example.invalid/v1",
    model: "test-model",
    tokenBudget: 100000,
    reasoningEffort: "low",
    fetch: (async (_url, init) => {
      const request = JSON.parse(init!.body as string);
      calls++;
      assert.equal(request.reasoning_effort, "low");
      assert.ok(
        request.messages.every(
          (m: { role: string; content?: string | null; tool_calls?: [] }) =>
            m.role !== "assistant" || m.content || m.tool_calls?.length,
        ),
      );
      if (calls === 1) return response({ role: "assistant", content: null });
      return response({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "apply_move",
              arguments: JSON.stringify({
                direction: obs.legal[0],
                summary: "Retried after truncation.",
              }),
            },
          },
        ],
      });
    }) as typeof fetch,
  });
  const d = await policy.decide(obs, emptyWorkspace(), 42);
  assert.equal(d.calls, 2);
  assert.equal(d.action, obs.legal[0]);
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
test("context is provided up front, lesson_id is validated, and the no-skill ablation hides run_skill", async () => {
  const obs = observe(createGame(5));
  const workspace = emptyWorkspace();
  workspace.lessons = [
    {
      id: "lesson-1",
      title: "t",
      rule: "Keep room.",
      trigger: "always",
      exception: "e",
      source: "test",
      evidence: ["x"],
      status: "verified",
      skill: workspace.skill,
      createdAt: "2026-10-28",
    },
  ];
  let calls = 0;
  const policy = modelPolicy({
    key: "test",
    baseUrl: "https://example.invalid/v1",
    model: "test-model",
    tokenBudget: 100000,
    allowSkill: false,
    fetch: (async (_url, init) => {
      const request = JSON.parse(init!.body as string);
      calls++;
      if (calls === 1) {
        assert.deepEqual(
          request.tools.map(
            (t: { function: { name: string } }) => t.function.name,
          ),
          ["apply_move"],
        );
        const provided = JSON.parse(request.messages[1].content);
        assert.equal(provided.lessons[0].id, "lesson-1");
        assert.equal(provided.recentMoves[0].action, "left");
        assert.equal("skill" in provided, false);
        assert.equal(request.messages[1].content.includes("rng"), false);
      }
      const lesson_id = calls === 1 ? "made-up" : "lesson-1";
      return response({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: `call-${calls}`,
            type: "function",
            function: {
              name: "apply_move",
              arguments: JSON.stringify({
                direction: obs.legal[0],
                summary: "Keeps room.",
                lesson_id,
              }),
            },
          },
        ],
      });
    }) as typeof fetch,
  });
  const d = await policy.decide(obs, workspace, 1, {
    recent: [
      { action: "left", scoreDelta: 4, emptyBefore: 10, emptyAfter: 10 },
    ],
  });
  assert.equal(calls, 2);
  assert.equal(d.invalid, 1);
  assert.equal(d.lessonId, "lesson-1");
  assert.equal(d.tools[0].name, "provided_context");
});
test("a teacher reply that fails validation gets one correction with the specific problem", async () => {
  const obs = observe(createGame(2));
  const trace = {
    id: "trace-1",
    studentId: "student-1",
    episodeId: "e",
    before: obs,
    after: obs,
    action: obs.legal[0],
    summary: "s",
    tools: [],
    spawn: null,
    scoreDelta: 0,
    workspaceVersion: 1,
    mode: "model" as const,
    tokens: 0,
    calls: 0,
    simulations: 0,
    durationMs: 0,
  };
  const student = {
    id: "student-1",
    name: "Ada",
    color: "sage",
    game: createGame(2),
    episodeId: "e",
    workspace: emptyWorkspace(),
    history: [],
    traces: [trace],
    episodes: 1,
    status: "",
  };
  const candidate = (diagnosis: string) => ({
    title: "Keep room",
    rule: "Prefer moves that keep space.",
    trigger: "always",
    exception: "Unless a merge opens space.",
    evidence: ["trace-1"],
    diagnosis,
    uncertain: true,
    skill: { ...emptyWorkspace().skill, version: 2 },
  });
  const sent: string[] = [];
  const policy = modelPolicy({
    key: "test",
    baseUrl: "https://example.invalid/v1",
    model: "test-model",
    tokenBudget: 100000,
    fetch: (async (_url, init) => {
      const request = JSON.parse(init!.body as string);
      sent.push(request.messages.at(-1).content);
      return response({
        role: "assistant",
        content: JSON.stringify(
          candidate(sent.length === 1 ? "x".repeat(900) : "Lost room."),
        ),
      });
    }) as typeof fetch,
  });
  const p = await policy.propose(student, "teacher", undefined, {
    focus: "space",
    name: "Preserve room",
    reason: "test",
    adaptive: true,
  });
  assert.equal(sent.length, 2);
  assert.match(sent[1], /diagnosis is 900 characters \(max 700\)/);
  assert.equal(p.lesson.focus, "space");
  assert.match(p.messages[0].text, /^\(Uncertain\) Lost room\./);
});
