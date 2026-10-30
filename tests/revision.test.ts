import test from "node:test";
import assert from "node:assert/strict";
import { Classroom } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import { emptyWorkspace } from "../src/core/skills";
import type { Lesson, Policy } from "../src/core/types";
import { move, fromBoard } from "../src/core/engine";
import { modelPolicy } from "../server/model";

function fixture(reviseRejected = true, failRevision = false) {
  const base = simulationPolicy();
  const feedback: Lesson[] = [];
  const policy: Policy = {
    ...base,
    // Ignore candidate memory: both sides tie and must be rejected.
    decide: (observation, _workspace, seed, context) =>
      base.decide(observation, emptyWorkspace(), seed, context),
    async propose(...args) {
      if (args[4]?.rejection) {
        feedback.push(args[4].rejection);
        if (failRevision) throw new Error("fixture budget exhausted");
      }
      return base.propose(...args);
    },
  };
  return {
    feedback,
    lab: new Classroom(policy, undefined, {
      reviseRejected,
      exerciseMoves: 1,
      verify: { practice: 2, regression: 1, moves: 3 },
      verificationConcurrency: 3,
    }),
  };
}

test("one revision gets paired failures, uses fresh boards, and cannot retry a second rejection", async () => {
  const { lab, feedback } = fixture();
  await lab.diagnose();
  await lab.review("student-1");
  const workspace = structuredClone(lab.state.students[0].workspace);
  await lab.verify();
  assert.equal(feedback.length, 1);
  assert.equal(lab.state.ledger.length, 2);
  const [original, revision] = lab.state.ledger;
  assert.equal(original.status, "rejected");
  assert.equal(revision.status, "rejected");
  assert.equal(revision.revisionOf, original.id);
  assert.deepEqual(feedback[0], original);
  const oldBoards = new Set(
    original.verification!.rows.map((r) =>
      JSON.stringify(r.trajectories!.baseline[0].before.board),
    ),
  );
  const oldSeeds = new Set(original.verification!.rows.map((r) => r.seed));
  for (const r of revision.verification!.rows) {
    assert.ok(!oldSeeds.has(r.seed));
    assert.ok(
      !oldBoards.has(JSON.stringify(r.trajectories!.baseline[0].before.board)),
    );
    assert.equal(r.delta, 0);
    for (const side of ["baseline", "candidate"] as const) {
      const trajectory = r.trajectories![side];
      let game = fromBoard(trajectory[0].before.board, r.seed);
      for (const t of trajectory) {
        assert.deepEqual(t.before.board, game.board);
        game = move(game, t.action).game;
        assert.deepEqual(t.after.board, game.board);
      }
      assert.equal(
        game.score / 8 + game.moves + trajectory.at(-1)!.after.empty * 2,
        r[side],
      );
    }
  }
  assert.deepEqual(lab.state.students[0].workspace, workspace);
  assert.equal(lab.state.candidate, null);
  await assert.rejects(lab.verify(), /Review an attempt/);
});

test("revision stays opt-in for existing study protocols", async () => {
  const { lab, feedback } = fixture(false);
  await lab.diagnose();
  await lab.review();
  await lab.verify();
  assert.equal(lab.state.ledger.length, 1);
  assert.equal(feedback.length, 0);
});

test("revision provider failure preserves rejection and unchanged memory without starting a retest", async () => {
  const { lab, feedback } = fixture(true, true);
  await lab.diagnose();
  await lab.review();
  const workspace = structuredClone(lab.state.students[0].workspace);
  await assert.rejects(lab.verify(), /budget exhausted/);
  assert.match(lab.state.error!, /budget exhausted/);
  assert.equal(feedback.length, 1);
  assert.equal(lab.state.ledger.length, 1);
  assert.equal(lab.state.candidate, null);
  assert.deepEqual(lab.state.students[0].workspace, workspace);
});

test("live teacher receives rejection trajectories and revises without repeating peer calls", async () => {
  const { lab } = fixture(false);
  await lab.diagnose();
  await lab.review("student-1");
  await lab.verify();
  const rejected = lab.state.ledger[0];
  let requests = 0;
  const policy = modelPolicy({
    key: "fixture",
    baseUrl: "https://example.invalid/v1",
    model: "fixture",
    tokenBudget: 100000,
    fetch: (async (_url, init) => {
      requests++;
      const body = JSON.parse(init!.body as string);
      const context = JSON.parse(body.messages[1].content);
      assert.equal(context.rejectionFeedback.rejectedLesson.id, rejected.id);
      assert.ok(
        context.rejectionFeedback.rejectedLesson.verification.rows[0]
          .trajectories.candidate.length,
      );
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  ...rejected,
                  diagnosis: "Narrow the condition after the failed moves.",
                  uncertain: true,
                }),
              },
            },
          ],
          usage: { total_tokens: 50 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch,
  });
  const result = await policy.propose(
    lab.state.students[0],
    "classroom",
    lab.state.students[1],
    lab.state.focus!,
    { rejection: rejected },
  );
  assert.equal(requests, 1);
  assert.equal(result.calls, 1);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].role, "teacher");
});

test("a useful revision installs once after rejection while preserving both attempts", async () => {
  const base = simulationPolicy();
  let proposals = 0;
  const policy: Policy = {
    ...base,
    async decide(observation, workspace, seed) {
      const choices = observation.legal
        .map((action) => {
          const next = move(fromBoard(observation.board, seed), action).game;
          return {
            action,
            utility:
              next.score / 8 + next.board.filter((v) => v === 0).length * 2,
          };
        })
        .sort((a, b) => a.utility - b.utility);
      const action = workspace.lessons.some((l) => l.rule === "improved")
        ? choices.at(-1)!.action
        : choices[0].action;
      return {
        action,
        summary: "fixture",
        tools: [],
        tokens: 0,
        calls: 0,
        simulations: 0,
      };
    },
    async propose(...args) {
      proposals++;
      const result = await base.propose(...args);
      if (args[4]?.rejection) result.lesson!.rule = "improved";
      return result;
    },
  };
  const lab = new Classroom(policy, undefined, {
    reviseRejected: true,
    exerciseMoves: 1,
    verify: { practice: 6, regression: 2, moves: 1 },
  });
  await lab.diagnose();
  await lab.review("student-1");
  await lab.verify();
  assert.equal(proposals, 2);
  assert.deepEqual(
    lab.state.ledger.map((l) => l.status),
    ["rejected", "verified"],
  );
  assert.equal(lab.state.students[0].workspace.version, 2);
  assert.equal(lab.state.students[0].history.length, 1);
  assert.equal(
    lab.state.students[0].workspace.lessons[0].id,
    lab.state.ledger[1].id,
  );
});
