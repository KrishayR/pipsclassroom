import test from "node:test";
import assert from "node:assert/strict";
import { Classroom } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import { summarize } from "../src/core/evaluation";
test("full classroom cycle records actual tools, verifies candidate, and freezes exams", async () => {
  const lab = new Classroom(simulationPolicy());
  await lab.practice(8);
  assert.equal(lab.state.students[0].traces.length, 8);
  const trace = lab.state.students[0].traces[0];
  assert.ok(trace.tools.some((t) => t.name === "run_skill"));
  assert.ok(trace.tools.some((t) => t.name === "apply_move"));
  await lab.review("student-1");
  assert.ok(lab.state.candidate);
  const evidence = lab.state.candidate!.lesson.evidence;
  assert.ok(
    evidence.every((id) =>
      lab.state.students.some((s) => s.traces.some((t) => t.id === id)),
    ),
  );
  await lab.verify();
  const lesson = lab.state.ledger[0];
  assert.equal(lesson.verification!.rows.length, 9);
  assert.equal(
    lab.state.students[0].workspace.version,
    lesson.verification!.accepted ? 2 : 1,
  );
  const frozen = structuredClone(lab.state.students.map((s) => s.workspace));
  await lab.exam(1, 20);
  assert.deepEqual(
    lab.state.students.map((s) => s.workspace),
    frozen,
  );
  assert.equal(lab.state.exams[0].rows.length, 3);
  assert.ok(
    lab.state.exams[0].rows.every((r) => r.moves <= 20 && r.tokens === 0),
  );
  assert.equal(lab.state.calls, 0);
});
test("operation lock and condition isolation", async () => {
  const lab = new Classroom(simulationPolicy());
  const running = lab.practice(5);
  await assert.rejects(lab.review(), /already running/);
  lab.stop();
  await running;
  assert.throws(() => lab.setArm("solo"), /Reset/);
  lab.reset();
  lab.setArm("solo");
  assert.equal(lab.state.arm, "solo");
});
test("unknown evidence from a teacher cannot enter memory", async () => {
  const base = simulationPolicy();
  const lab = new Classroom({
    ...base,
    propose: async (...args) => {
      const p = await base.propose(...args);
      p.lesson.evidence = ["invented"];
      return p;
    },
  });
  await lab.practice(1);
  await assert.rejects(lab.review(), /unknown evidence/);
  assert.equal(lab.state.candidate, null);
  assert.equal(lab.state.students[0].workspace.version, 1);
});
test("capped time-to-target includes failures, successful move mean does not", () => {
  const rows = [
    { reached: true, moves: 100, score: 1000, terminal: "target" },
    { reached: false, moves: 10, score: 20, terminal: "loss" },
  ] as Parameters<typeof summarize>[0];
  const s = summarize(rows, 1500);
  assert.equal(s.successRate, 0.5);
  assert.equal(s.successfulMeanMoves, 100);
  assert.equal(s.cappedMeanMoves, 800);
});
test("practice after an exam starts a separate training episode, including after restore", async () => {
  const lab = new Classroom(simulationPolicy());
  await lab.exam(1, 3);
  const restored = new Classroom(
    simulationPolicy(),
    structuredClone(lab.state),
  );
  await restored.practice(1);
  assert.ok(
    restored.state.students.every(
      (s) => s.game.moves === 1 && s.episodeId.startsWith("practice:"),
    ),
  );
});
test("comparison uses fresh groups, keeps current notebooks, and records all three conditions", async () => {
  const lab = new Classroom(simulationPolicy());
  await lab.practice(1);
  const originals = structuredClone(
    lab.state.students.map((s) => ({
      workspace: s.workspace,
      game: s.game,
      traces: s.traces,
    })),
  );
  await lab.compare(5);
  const comparison = lab.state.comparisons[0];
  assert.deepEqual(
    comparison.runs.map((r) => r.arm),
    ["solo", "teacher", "classroom"],
  );
  assert.equal(comparison.status, "complete");
  assert.ok(
    comparison.runs.every(
      (r) => r.status === "complete" && r.rows.length === 3,
    ),
  );
  assert.ok(comparison.runs.every((r) => r.trainingSimulations <= 50000));
  assert.deepEqual(
    lab.state.students.map((s) => ({
      workspace: s.workspace,
      game: s.game,
      traces: s.traces,
    })),
    originals,
  );
  assert.ok(comparison.runs[2].messages.some((m) => m.role === "peer"));
  assert.ok(
    comparison.runs[0].messages.every(
      (m) => m.role !== "peer" && m.role !== "teacher",
    ),
  );
});
test("peer feedback changes a proposed skill only when an actual peer example exists", async () => {
  const lab = new Classroom(simulationPolicy());
  await lab.practice(12);
  const policy = simulationPolicy();
  const a = await policy.propose(
    lab.state.students[0],
    "teacher",
    lab.state.students[1],
  );
  const b = await policy.propose(
    lab.state.students[0],
    "classroom",
    lab.state.students[1],
  );
  assert.ok(b.messages.some((m) => m.role === "peer"));
  assert.ok(b.messages.some((m) => m.role === "student"));
  assert.notDeepEqual(a.lesson.skill, b.lesson.skill);
  assert.ok(b.lesson.evidence.length > a.lesson.evidence.length);
});
