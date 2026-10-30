import test from "node:test";
import assert from "node:assert/strict";
import { snapshotPool, createGame, observe } from "../src/core/engine";
import { focusApplies, moveFacts } from "../src/core/curriculum";
import {
  activeLessons,
  DEFAULT_SKILL,
  emptyWorkspace,
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
test("the planned move follows an applicable lesson whenever some move keeps its skill", () => {
  const w = { ...emptyWorkspace(), lessons: [structureLesson()] };
  let followed = 0;
  for (const b of boards) {
    const facts = moveFacts(b.board);
    const plan = plannedMove(b.board, w, b.seed);
    if (Object.values(facts).some((f) => f!.keeps.structure)) {
      assert.equal(facts[plan.action!]!.keeps.structure, true);
      assert.equal(plan.lessonId, "lesson-structure");
    }
    if (plan.action !== plannedMove(b.board, emptyWorkspace(), b.seed).action)
      followed++;
  }
  // Reachable structure boards are rarer than the others; 12 draws give several.
  assert.ok(boards.length >= 3);
  // The lesson must change behaviour on at least one board to be testable at all.
  assert.ok(followed >= 1);
  assert.equal(
    lessonSensitivity(emptyWorkspace(), w, boards).changed,
    followed,
  );
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
          skill: { ...DEFAULT_SKILL, version: 2 },
        }),
      });
    }) as typeof fetch,
  });
  const d = await policy.decide(obs, workspace, 1);
  const provided = JSON.parse(sent[0].messages[1].content);
  assert.ok(provided.moveFacts[obs.legal[0]].keeps);
  assert.equal(provided.lessons[0].skill, "structure");
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
