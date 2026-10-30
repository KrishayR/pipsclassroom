import test from "node:test";
import assert from "node:assert/strict";
import { Classroom } from "../src/core/classroom";
import {
  chooseFocus,
  correctionEvidence,
  diagnoseMove,
  focusApplies,
} from "../src/core/curriculum";
import {
  snapshotPool,
  fromBoard,
  move,
  observe,
  legalMoves,
} from "../src/core/engine";
import { simulationPolicy } from "../src/core/policy";
import { modelPolicy } from "../server/model";
import type { Trace, Policy } from "../src/core/types";
import { liveBatchRunner } from "../server/batch";
import { keyPool } from "../server/keys";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function corrections() {
  const traces: Trace[] = [];
  for (let round = 0; traces.length < 2 && round < 30; round++)
    for (const s of snapshotPool(
      "exercise",
      round,
      { key: "space", applies: (b) => focusApplies("space", b) },
      6,
    )) {
      const game = fromBoard(s.board, s.seed),
        before = observe(game);
      const action = legalMoves(s.board).find(
        (d) => diagnoseMove("space", before, d).kind === "potential-correction",
      );
      if (!action) continue;
      const next = move(game, action);
      traces.push({
        id: `trace-${traces.length}`,
        studentId: "student-1",
        episodeId: "fixture",
        before,
        after: observe(next.game),
        action,
        summary: "fixture",
        tools: [],
        spawn: next.spawn,
        scoreDelta: next.gain,
        workspaceVersion: 1,
        mode: "model",
        tokens: 0,
        calls: 0,
        simulations: 0,
        durationMs: 0,
      });
      if (traces.length === 2) break;
    }
  assert.equal(traces.length, 2);
  return traces;
}
function labWith(policy: Policy) {
  const lab = new Classroom(policy, undefined, {
    evidenceBasedTeaching: true,
    exerciseMoves: 0,
  });
  lab.state.arm = "adaptive";
  lab.state.students[0].traces = corrections();
  while (
    !chooseFocus(
      "adaptive",
      {
        space: { attempts: 2, successes: 0 },
        structure: { attempts: 0, successes: 0 },
        planning: { attempts: 0, successes: 0 },
      },
      `student-1:${lab.state.trainingRound}`,
      true,
    ).adaptive
  )
    lab.state.trainingRound++;
  return lab;
}

test("sparse perfect checks are coverage, not a diagnosed weakness", () => {
  const estimates = {
    space: { attempts: 12, successes: 12 },
    structure: { attempts: 4, successes: 4 },
    planning: { attempts: 11, successes: 11 },
  };
  const result = chooseFocus("adaptive", estimates, "student-1:0", true);
  assert.equal(result.adaptive, false);
  assert.doesNotMatch(result.reason, /weakest/i);
});
test("unavoidable space loss is not a correctable failure and duplicate boards do not establish recurrence", () => {
  const trace = corrections()[0];
  assert.equal(
    correctionEvidence([trace, { ...trace, id: "duplicate" }], "space").length,
    1,
  );
  let found = false;
  for (let round = 0; !found && round < 20; round++)
    for (const s of snapshotPool("exercise", round, undefined, 6))
      for (const action of legalMoves(s.board)) {
        const d = diagnoseMove(
          "space",
          observe(fromBoard(s.board, s.seed)),
          action,
        );
        if (d.kind === "unavoidable") {
          assert.deepEqual(d.alternatives, []);
          found = true;
        }
      }
  assert.ok(found);
});
test("review without recurring corrections abstains before paid teacher calls", async () => {
  let proposed = 0;
  const base = simulationPolicy();
  const lab = new Classroom(
    {
      ...base,
      async propose(...args) {
        proposed++;
        return base.propose(...args);
      },
    },
    undefined,
    { evidenceBasedTeaching: true, exerciseMoves: 1 },
  );
  await lab.diagnose();
  await lab.review("student-1");
  assert.equal(proposed, 0);
  assert.equal(lab.state.candidate, null);
  assert.ok(lab.state.students[0].teachingNote);
  assert.equal(lab.state.trainingRound, 1);
});
test("supported corrections can queue a lesson, but unsupported evidence cannot", async () => {
  for (const supported of [true, false]) {
    const base = simulationPolicy();
    const lab = labWith({
      ...base,
      usesHelper: false,
      async propose(student, _arm, _peer, choice) {
        return {
          lesson: {
            title: "Preserve room",
            rule: "When a move loses room, prefer the supported space-preserving alternative.",
            trigger: "when the skill applies",
            exception: "Do not sacrifice immediate merge points.",
            evidence: student.traces
              .slice(0, supported ? 2 : 1)
              .map((t) => t.id),
            skill: student.workspace.skill,
            focus: choice!.focus,
            limits: { minOptions: 2, maxGainLoss: 0 },
            source: "Teacher",
          },
          messages: [],
          tokens: 0,
          calls: 0,
        };
      },
    });
    await lab.review("student-1");
    assert.equal(!!lab.state.candidate, supported);
    assert.equal(lab.state.error, null);
    if (!supported)
      assert.match(lab.state.ledger[0].rejectionReason!, /not rollout-tested/);
  }
});
test("teacher sees verified alternatives and may return no lesson without skill parameters", async () => {
  let requests = 0;
  const policy = modelPolicy({
    key: "fixture",
    baseUrl: "https://example.invalid/v1",
    model: "fixture",
    allowSkill: false,
    tokenBudget: 100000,
    fetch: (async (_url, init) => {
      requests++;
      const body = JSON.parse(init!.body as string),
        context = JSON.parse(body.messages[1].content);
      assert.ok(context.traces[0].diagnosis.moveFacts);
      assert.match(body.messages[0].content, /noLessonReason/);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  noLessonReason:
                    "No robust correction beyond an immediate heuristic.",
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
  const lab = labWith(policy);
  await lab.review("student-1");
  assert.equal(requests, 1);
  assert.equal(lab.state.candidate, null);
  assert.match(lab.state.students[0].teachingNote!, /No robust correction/);
  assert.equal(lab.state.calls, 1);
});

test("both batch modes finish exams and save abstention notes when no candidate exists", async () => {
  for (const kind of ["classroom", "individual"] as const) {
    const root = mkdtempSync(join(tmpdir(), "cl-abstain-"));
    const base = simulationPolicy();
    const batch = liveBatchRunner(() => {}, {
      root,
      createPolicy: () => ({
        ...base,
        async propose() {
          return {
            lesson: null,
            noLessonReason: "Insufficient evidence.",
            messages: [],
            calls: 0,
            tokens: 0,
          };
        },
      }),
      createPool: () =>
        keyPool({ keys: ["fixture"], prices: null, limitUsd: 1 }),
      getPrices: () => ({ input: 0.1, output: 0.2 }),
      protocol: { evidenceBasedTeaching: true, exerciseMoves: 1 },
    });
    await batch.start(1, kind);
    const status = batch.status()!;
    assert.equal(status.status, "complete");
    assert.equal(status.cycles[0].attempts!.length, 0);
    assert.equal(status.cycles[0].lesson, undefined);
    assert.equal(status.cycles[0].notes!.length, kind === "classroom" ? 3 : 1);
    const saved = JSON.parse(
      readFileSync(`${status.directory}/final.json`, "utf8"),
    );
    assert.equal(saved.state.exams.length, 2);
    assert.ok(
      saved.state.students.every((s: any) => s.workspace.version === 1),
    );
  }
});
