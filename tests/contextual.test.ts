import test from "node:test";
import assert from "node:assert/strict";
import { Classroom } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import { modelPolicy } from "../server/model";
import { emptyWorkspace } from "../src/core/skills";
import { createGame, observe } from "../src/core/engine";
import { liveBatchRunner } from "../server/batch";
import { keyPool } from "../server/keys";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("contextual review receives peer tradeoffs and observed continuations, with no correction-count gate", async () => {
  const lab = new Classroom(simulationPolicy());
  await lab.practice(30);
  const student = lab.state.students[0],
    peer = lab.state.students[1];
  let peers = 0,
    teachers = 0,
    reflections = 0;
  const policy = modelPolicy({
    key: "fixture",
    model: "fixture",
    baseUrl: "https://example.invalid/v1",
    allowSkill: false,
    tokenBudget: 1000000,
    fetch: (async (_url, init) => {
      const request = JSON.parse(init!.body as string),
        ctx = JSON.parse(request.messages[1].content);
      let result;
      if (ctx.yourTraces) {
        peers++;
        assert.ok(ctx.yourTraces.some((t: any) => t.observedFollowing?.length));
        result = {
          advice: "Compare immediate reward against later space.",
          evidence: [ctx.yourTraces[0].id],
        };
      } else if (ctx.currentSkill) {
        teachers++;
        assert.ok(ctx.traces.some((t: any) => t.observedFollowing?.length));
        for (const t of ctx.traces)
          for (const next of t.observedFollowing ?? [])
            assert.ok(next.before.moves > t.before.moves);
        assert.match(
          request.messages[0].content,
          /no minimum correction count/,
        );
        result = {
          title: "Tradeoffs",
          rule: "When a large merge leaves room, consider it even if it changes the corner; otherwise preserve future options.",
          trigger: "always",
          exception: "Avoid a merge that traps the board.",
          limits: { minOptions: 2, maxGainLoss: 16 },
          evidence: [ctx.traces[0].id],
          diagnosis:
            "The observed continuation motivates a hypothesis, not proof.",
          skill: ctx.currentSkill,
        };
      } else {
        reflections++;
        result = { plan: "I will test this advice on unseen boards." };
      }
      return new Response(
        JSON.stringify({
          choices: [
            { message: { role: "assistant", content: JSON.stringify(result) } },
          ],
          usage: { total_tokens: 50 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch,
  });
  const result = await policy.propose(
    student,
    "classroom",
    peer,
    {
      focus: "space",
      name: "Room",
      reason: "Review a tradeoff",
      adaptive: false,
    },
    { evidenceBased: true },
  );
  assert.equal(peers, 1);
  assert.equal(teachers, 1);
  assert.equal(reflections, 1);
  assert.equal(result.lesson!.intervention, "contextual");
  assert.deepEqual(result.lesson!.skill, student.workspace.skill);
});

test("contextual lessons are presented without the legacy recommended-move filter", async () => {
  const workspace = emptyWorkspace();
  workspace.lessons.push({
    id: "contextual",
    title: "Tradeoff",
    rule: "Weigh immediate points against future room.",
    trigger: "always",
    exception: "Avoid becoming stuck.",
    source: "Teacher",
    evidence: ["trace"],
    status: "verified",
    skill: workspace.skill,
    createdAt: "fixture",
    focus: "space",
    intervention: "contextual",
  });
  const observation = observe(createGame(12));
  const policy = modelPolicy({
    key: "fixture",
    model: "fixture",
    baseUrl: "https://example.invalid/v1",
    allowSkill: false,
    tokenBudget: 100000,
    fetch: (async (_url, init) => {
      const body = JSON.parse(init!.body as string),
        ctx = JSON.parse(body.messages[1].content);
      assert.equal(ctx.lessons[0].intervention, "contextual");
      assert.equal(ctx.lessons[0].recommendedMoves, undefined);
      assert.match(body.messages[0].content, /Do not impose keeps-skill/);
      assert.equal(ctx.skillRanking, undefined);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
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
                        lesson_id: "contextual",
                      }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 50 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch,
  });
  const d = await policy.decide(observation, workspace, 1);
  assert.equal(d.lessonId, "contextual");
  assert.equal(d.simulations, 0);
});

test("extended batch practice reaches teacher evidence and longer exams remain isolated", async () => {
  const root = mkdtempSync(join(tmpdir(), "cl-extended-"));
  const base = simulationPolicy();
  const batch = liveBatchRunner(() => {}, {
    root,
    practiceMoves: 30,
    examMoves: 60,
    createPolicy: () => ({
      ...base,
      async propose(student, arm, peer, focus, options) {
        assert.ok(
          student.traces.some((t) => t.episodeId.startsWith("practice:")),
        );
        assert.ok(student.traces.length >= 30);
        return base.propose(student, arm, peer, focus, options);
      },
    }),
    createPool: () => keyPool({ keys: ["fixture"], prices: null, limitUsd: 1 }),
    getPrices: () => ({ input: 0.1, output: 0.2 }),
    protocol: {
      exerciseMoves: 1,
      evidenceBasedTeaching: true,
      reviseRejected: false,
      verify: { practice: 1, regression: 1, moves: 1 },
    },
  });
  await batch.start(1, "classroom");
  assert.equal(batch.status()!.status, "complete");
  assert.deepEqual(batch.status()!.design, {
    practiceMoves: 30,
    examMoves: 60,
  });
  const saved = JSON.parse(
    readFileSync(`${batch.status()!.directory}/final.json`, "utf8"),
  );
  assert.ok(saved.state.exams.every((e: any) => e.cap === 60));
  assert.ok(
    saved.state.exams.every((e: any) =>
      e.rows.every((r: any) => r.trajectory.length === r.moves),
    ),
  );
  assert.ok(
    saved.state.students.every((s: any) =>
      s.traces.every((t: any) => !t.episodeId.startsWith("exam")),
    ),
  );
});
