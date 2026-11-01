import test from "node:test";
import assert from "node:assert/strict";
import { snapshotPool, createGame, observe } from "../src/core/engine";
import { focusApplies, moveFacts } from "../src/core/curriculum";
import {
  activeLessons,
  DEFAULT_SKILL,
  emptyWorkspace,
  lessonMoves,
  validateLimits,
} from "../src/core/skills";
import {
  lessonSensitivity,
  plannedMove,
  simulationPolicy,
} from "../src/core/policy";
import { Classroom, candidateWorkspace } from "../src/core/classroom";
import { modelPolicy } from "../server/model";
import type { Lesson } from "../src/core/types";
const structureLesson = (): Lesson => ({
  id: "lesson-structure",
  title: "Keep the largest tile anchored",
  rule: "Keep the largest tile in its corner.",
  trigger: "when the skill applies",
  exception: "Unless no move keeps it.",
  source: "test",
  evidence: ["t"],
  focus: "structure",
  status: "verified",
  skill: { ...DEFAULT_SKILL },
  createdAt: "2026-10-30",
});
const boards = snapshotPool(
  "sensitivity",
  0,
  { key: "structure:test", applies: (b) => focusApplies("structure", b) },
  12,
).filter((b) => b.tagged);
test("a 'when the skill applies' lesson is shown exactly where its skill applies", () => {
  const w = { ...emptyWorkspace(), lessons: [structureLesson()] };
  for (const b of boards) assert.equal(activeLessons(w, b.board).length, 1);
  const open = createGame(1).board;
  assert.equal(
    activeLessons(w, open).length,
    focusApplies("structure", open) ? 1 : 0,
  );
});
test("a lesson steps in only when the planned move breaks its skill, then picks a move it recommends", () => {
  const lesson = structureLesson();
  const w = { ...emptyWorkspace(), lessons: [lesson] };
  let changed = 0;
  for (const b of boards) {
    const base = plannedMove(b.board, emptyWorkspace(), b.seed).action!;
    const plan = plannedMove(b.board, w, b.seed);
    // Never overrides a move that already keeps the skill.
    if (moveFacts(b.board)[base]!.keeps.structure)
      assert.equal(plan.action, base);
    if (plan.action !== base) {
      changed++;
      assert.ok(lessonMoves(lesson, b.board).includes(plan.action!));
      assert.equal(plan.lessonId, "lesson-structure");
    } else assert.equal(plan.lessonId, undefined);
  }
  // Reachable structure boards are rarer than the others; 12 draws give several.
  assert.ok(boards.length >= 3);
  assert.ok(changed >= 1);
  assert.equal(lessonSensitivity(emptyWorkspace(), w, boards).changed, changed);
});
test("limits narrow the recommended moves", () => {
  const lesson = structureLesson();
  for (const b of boards) {
    const facts = moveFacts(b.board);
    const best = Math.max(0, ...Object.values(facts).map((f) => f!.scoreGain));
    const strict = lessonMoves(
      { ...lesson, limits: { minOptions: 3, maxGainLoss: 0 } },
      b.board,
    );
    for (const d of strict) {
      assert.equal(facts[d]!.scoreGain, best);
      assert.ok(facts[d]!.legalMovesAfterSlide >= 3);
      assert.ok(facts[d]!.keeps.structure);
    }
    assert.ok(strict.every((d) => lessonMoves(lesson, b.board).includes(d)));
  }
  assert.throws(() => validateLimits({ minOptions: 5 }));
  assert.throws(() => validateLimits({ minOptions: 2, maxGainLoss: -1 }));
  assert.deepEqual(validateLimits({ minOptions: 3, maxGainLoss: 8 }), {
    minOptions: 3,
    maxGainLoss: 8,
  });
});
test("review records how many sample boards the candidate changes", async () => {
  const lab = new Classroom(simulationPolicy());
  lab.state.arm = "adaptive";
  await lab.diagnose();
  await lab.review("student-1");
  const s = lab.state.candidate!.lesson.sensitivity!;
  assert.equal(s.boards, 6);
  assert.ok(s.changed >= 0 && s.changed <= 6);
  assert.equal(lab.state.candidate!.lesson.trigger, "when the skill applies");
});
test("candidateWorkspace matches what verification installs", () => {
  const w = candidateWorkspace(emptyWorkspace(), {
    skill: { ...DEFAULT_SKILL, version: 2, structureWeight: 3 },
    trigger: "when the skill applies",
    focus: "structure",
  });
  assert.equal(w.version, 2);
  assert.equal(w.skill.structureWeight, 3);
  assert.equal(w.lessons[0].status, "verified");
});
test("students see per-move facts and lesson skills; a no-impact teacher draft is asked once, then still proceeds", async () => {
  const obs = observe(createGame(4));
  const workspace = { ...emptyWorkspace(), lessons: [structureLesson()] };
  workspace.lessons[0].trigger = "always";
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
  const sent: { messages: { content: string }[] }[] = [];
  const reply = (content: unknown) =>
    new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", ...(content as object) } }],
        usage: { total_tokens: 10 },
      }),
      { status: 200 },
    );
  const policy = modelPolicy({
    key: "test",
    baseUrl: "https://example.invalid/v1",
    model: "m",
    tokenBudget: 1e6,
    fetch: (async (_u, init) => {
      const body = JSON.parse(init!.body as string);
      sent.push(body);
      if (body.tools)
        return reply({
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
                  lesson_id: "lesson-structure",
                }),
              },
            },
          ],
        });
      return reply({
        content: JSON.stringify({
          title: "Anchor",
          rule: "Keep the big tile cornered.",
          trigger: "when the skill applies",
          exception: "Unless no move keeps it.",
          evidence: ["trace-1"],
          diagnosis: "It slid out.",
          uncertain: false,
          limits: { minOptions: 3, maxGainLoss: 8 },
          skill: { ...DEFAULT_SKILL, version: 2 },
        }),
      });
    }) as typeof fetch,
  });
  const d = await policy.decide(obs, workspace, 1);
  const provided = JSON.parse(sent[0].messages[1].content);
  assert.ok(provided.moveFacts[obs.legal[0]].keeps);
  assert.equal(provided.lessons[0].skill, "structure");
  const expectedPlan = plannedMove(obs.board, workspace, 1);
  assert.equal(provided.lessonPlan.action, expectedPlan.action);
  assert.equal(provided.lessonPlan.lessonId, expectedPlan.lessonId);
  assert.equal(d.lessonId, "lesson-structure");
  sent.length = 0;
  let checks = 0;
  const p = await policy.propose(
    {
      id: "student-1",
      name: "Ada",
      color: "sage",
      game: createGame(4),
      episodeId: "e",
      workspace: emptyWorkspace(),
      history: [],
      traces: [trace],
      episodes: 1,
      status: "",
    },
    "adaptive",
    undefined,
    {
      focus: "structure",
      name: "Maintain useful structure",
      reason: "t",
      adaptive: true,
    },
    { check: () => (checks++, "would not alter the planned move") },
  );
  assert.equal(sent.length, 2);
  assert.match(
    sent[1].messages.at(-1)!.content,
    /would not alter the planned move/,
  );
  assert.equal(checks, 1);
  assert.equal(p.lesson.trigger, "when the skill applies");
});
test("without the helper, the impact check is skipped and the teacher is told parameters do nothing", async () => {
  const base = simulationPolicy();
  let checked = false;
  const lab = new Classroom({
    ...base,
    usesHelper: false,
    propose: async (...args) => {
      checked =
        args[4]?.check?.({
          skill: { ...DEFAULT_SKILL },
          trigger: "when the skill applies",
          focus: "structure",
        }) !== null;
      return base.propose(...args);
    },
  });
  lab.state.arm = "adaptive";
  await lab.diagnose();
  await lab.review("student-1");
  assert.equal(checked, false);
  assert.equal(lab.state.candidate!.lesson.sensitivity, undefined);
  let prompt = "";
  const policy = modelPolicy({
    key: "test",
    baseUrl: "https://example.invalid/v1",
    model: "m",
    tokenBudget: 1e6,
    allowSkill: false,
    fetch: (async (_u, init) => {
      prompt = JSON.parse(init!.body as string).messages[0].content;
      return new Response("stop after capturing the prompt", { status: 400 });
    }) as typeof fetch,
  });
  assert.equal(policy.usesHelper, false);
  await assert.rejects(
    policy.propose(
      lab.state.students[0],
      "adaptive",
      undefined,
      lab.state.focus!,
    ),
  );
  assert.match(prompt, /without the skill ranking/);
});
