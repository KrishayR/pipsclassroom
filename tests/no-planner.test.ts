import test from "node:test";
import assert from "node:assert/strict";
import { modelPolicy } from "../server/model";
import { liveBatchRunner } from "../server/batch";
import { keyPool } from "../server/keys";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SKILL } from "../src/core/skills";

test("planner-free live sessions omit all sampled rankings, preserve strategy and record the condition", async () => {
  let decisions = 0,
    teachers = 0;
  const policy = modelPolicy({
    allowSkill: false,
    key: "fixture",
    baseUrl: "https://example.invalid/v1",
    model: "fixture",
    tokenBudget: 1000000,
    fetch: (async (_url, init) => {
      const request = JSON.parse(init!.body as string);
      const system = request.messages[0].content;
      const context = JSON.parse(request.messages[1].content);
      let message;
      if (context.observation) {
        decisions++;
        assert.ok(!("skillRanking" in context));
        assert.ok(!("skill" in context));
        assert.ok(context.moveFacts);
        assert.ok(context.observation.legal.length);
        message = {
          role: "assistant",
          tool_calls: [
            {
              id: "fixture",
              type: "function",
              function: {
                name: "apply_move",
                arguments: JSON.stringify({
                  direction: context.observation.legal[0],
                  summary: "fixture decision",
                }),
              },
            },
          ],
        };
      } else if (context.yourTraces) {
        message = {
          role: "assistant",
          content: JSON.stringify({
            advice: "Compare safe moves.",
            evidence: [context.yourTraces[0].id],
          }),
        };
      } else if (context.currentSkill) {
        teachers++;
        assert.match(system, /planner is OFF/);
        assert.doesNotMatch(system, /must alter the planned move/);
        message = {
          role: "assistant",
          content: JSON.stringify({
            title: "Keep room",
            rule: "Prefer room unless a merge opens more space.",
            trigger: "always",
            exception: "A merge may open space.",
            evidence: [context.traces[0].id],
            diagnosis: "Test room preservation.",
            uncertain: true,
            skill: { ...context.currentSkill, spaceWeight: 40, version: 2 },
          }),
        };
      } else
        message = {
          role: "assistant",
          content: JSON.stringify({
            plan: "I will test the advice on new boards.",
          }),
        };
      return new Response(
        JSON.stringify({ choices: [{ message }], usage: { total_tokens: 50 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch,
  });
  const root = mkdtempSync(join(tmpdir(), "cl-no-planner-"));
  const batch = liveBatchRunner(() => {}, {
    root,
    createPolicy: () => policy,
    createPool: () => keyPool({ keys: ["fixture"], limitUsd: 1, prices: null }),
    getPrices: () => ({ input: 0.1, output: 0.2 }),
    protocol: {
      exerciseMoves: 1,
      reviseRejected: true,
      verify: { practice: 1, regression: 1, moves: 1 },
    },
  });
  await batch.start(1, "classroom");
  assert.equal(batch.status()!.status, "complete");
  assert.equal(batch.status()!.plannerEnabled, false);
  const saved = JSON.parse(
    readFileSync(`${batch.status()!.directory}/final.json`, "utf8"),
  );
  assert.equal(saved.state.plannerEnabled, false);
  assert.equal(saved.state.simulations, 0);
  assert.ok(decisions > 150);
  assert.equal(teachers, 6);
  assert.ok(
    saved.state.ledger.every(
      (l: any) =>
        !l.sensitivity &&
        JSON.stringify(l.skill) === JSON.stringify(DEFAULT_SKILL),
    ),
  );
  assert.ok(
    saved.state.students.every((s: any) =>
      s.traces.every(
        (t: any) => !t.tools.some((e: any) => e.name === "run_skill"),
      ),
    ),
  );
});
