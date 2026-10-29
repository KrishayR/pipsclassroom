import test from "node:test";
import assert from "node:assert/strict";
import { Classroom } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import {
  pairedContrast,
  planningTarget,
  summarize,
} from "../src/core/evaluation";
import {
  chooseFocus,
  focusApplies,
  focusOutcome,
  skillEstimates,
  FOCI,
} from "../src/core/curriculum";
import { snapshotPool } from "../src/core/engine";
import type { ExamRow, FocusChoice } from "../src/core/types";
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
  const otherNotebooks = structuredClone(lab.state.students.slice(1).map(s => s.workspace));
  await lab.verify();
  const lesson = lab.state.ledger[0];
  assert.equal(lesson.studentId, "student-1");
  assert.deepEqual(lab.state.students.slice(1).map(s => s.workspace), otherNotebooks);
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
test("comparison uses fresh groups, keeps current notebooks, and records all four conditions", async () => {
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
    ["solo", "teacher", "adaptive", "classroom"],
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
  assert.ok(comparison.runs[3].messages.some((m) => m.role === "peer"));
  assert.ok(
    comparison.runs
      .slice(0, 3)
      .every((r) => r.messages.every((m) => m.role !== "peer")),
  );
  assert.ok(
    comparison.runs[0].messages.every(
      (m) => m.role !== "peer" && m.role !== "teacher",
    ),
  );
});
test("peer feedback changes a proposed skill only when an actual peer example exists", async () => {
  const lab = new Classroom(simulationPolicy());
  await lab.practice(40);
  const policy = simulationPolicy();
  const peer = lab.state.students[1];
  const focus = FOCI.find((f) =>
    peer.traces.some((t) => focusOutcome(f.id, t.before, t.after) === true),
  )!;
  assert.ok(focus, "peer should have passed at least one focus check");
  const choice: FocusChoice = {
    focus: focus.id,
    name: focus.name,
    reason: "test",
    adaptive: true,
  };
  const a = await policy.propose(
    lab.state.students[0],
    "adaptive",
    peer,
    choice,
  );
  const b = await policy.propose(
    lab.state.students[0],
    "classroom",
    peer,
    choice,
  );
  assert.ok(b.messages.some((m) => m.role === "peer"));
  assert.ok(b.messages.some((m) => m.role === "student"));
  assert.notDeepEqual(a.lesson.skill, b.lesson.skill);
  assert.ok(b.lesson.evidence.length > a.lesson.evidence.length);
});
test("adaptive arms target the weakest measured skill about 80% of the time; random arms do not", () => {
  const estimates = {
    space: { attempts: 20, successes: 2 },
    structure: { attempts: 20, successes: 18 },
    planning: { attempts: 20, successes: 17 },
  };
  const picks = (arm: "adaptive" | "teacher") =>
    Array.from({ length: 1000 }, (_, i) =>
      chooseFocus(arm, estimates, `k${i}`),
    );
  const adaptive = picks("adaptive");
  const targeted = adaptive.filter((c) => c.adaptive);
  assert.ok(targeted.every((c) => c.focus === "space"));
  assert.ok(Math.abs(targeted.length / 1000 - 0.8) < 0.05);
  const random = picks("teacher");
  assert.ok(random.every((c) => !c.adaptive));
  const share = random.filter((c) => c.focus === "space").length / 1000;
  assert.ok(Math.abs(share - 1 / 3) < 0.06);
  assert.deepEqual(
    chooseFocus("adaptive", estimates, "same"),
    chooseFocus("adaptive", estimates, "same"),
  );
});
test("review chooses a focus, runs a targeted exercise, and records evidence without touching the practice game", async () => {
  const lab = new Classroom(simulationPolicy());
  lab.state.arm = "adaptive";
  await lab.practice(6);
  const student = lab.state.students[0];
  const game = structuredClone(student.game);
  await lab.review(student.id);
  assert.ok(lab.state.focus);
  assert.equal(lab.state.candidate!.lesson.focus, lab.state.focus!.focus);
  const exercise = student.traces.filter((t) => t.exercise);
  assert.equal(exercise.length, 4);
  assert.ok(exercise.every((t) => t.exercise === lab.state.focus!.focus));
  assert.deepEqual(student.game, game);
  assert.ok(skillEstimates(student.traces));
  assert.ok(
    lab.state.messages.some((m) => m.title.startsWith("Practice focus")),
  );
});
test("tagged snapshot pools are reachable and match their focus where possible", () => {
  for (const f of FOCI) {
    const pool = snapshotPool("practice", 0, {
      key: f.id,
      applies: (b) => focusApplies(f.id, b),
    });
    assert.equal(pool.length, 6);
    assert.ok(
      pool.filter((p) => p.tagged).every((p) => focusApplies(f.id, p.board)),
    );
  }
});
test("an agent failure ends the episode but not the practice session", async () => {
  const base = simulationPolicy();
  let n = 0;
  const lab = new Classroom({
    ...base,
    decide: async (...args) => {
      if (++n === 2)
        throw new Error(
          "Agent failed to select a legal move within its call budget.",
        );
      return base.decide(...args);
    },
  });
  await lab.practice(2);
  assert.equal(lab.state.students[1].episodes, 2);
  assert.ok(lab.state.messages.some((m) => /episode ended/.test(m.title)));
  assert.equal(lab.state.students.flatMap((s) => s.traces).length, 5);
});
test("summary reports median, milestones, truncation; contrasts pair by seed and student", () => {
  const row = (
    score: number,
    seed: number,
    studentId: string,
    terminal = "cap",
  ) =>
    ({
      score,
      seed,
      studentId,
      highest: score > 1000 ? 512 : 128,
      terminal,
      reached: false,
      moves: 150,
    }) as ExamRow;
  const base = [
    row(1000, 1, "a"),
    row(1200, 2, "a"),
    row(900, 1, "b"),
    row(1100, 2, "b"),
  ];
  const treat = [
    row(1300, 1, "a"),
    row(1500, 2, "a"),
    row(1100, 1, "b"),
    row(1400, 2, "b", "loss"),
  ];
  const s = summarize(treat, 150);
  assert.equal(s.medianScore, 1350);
  assert.equal(s.truncated, 3);
  assert.equal(s.losses, 1);
  assert.equal(s.milestones[512], 1);
  const c = pairedContrast(treat, base, 500);
  assert.equal(c.pairs, 4);
  assert.equal(c.meanDiff, 275);
  assert.ok(c.ci95[0]! > 0 && c.ci95[1]! <= 300);
  assert.equal(c.exploratory, true);
  assert.equal(planningTarget(treat, base, c).met, true);
});
