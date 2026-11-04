import test from "node:test";
import assert from "node:assert/strict";
import {
  newWalkthrough,
  walkthroughReducer as update,
} from "../src/walkthrough";
import { Classroom, initialState } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import type { Exam, ExamRow, Lesson } from "../src/core/types";

const idea = (id: string): Lesson => ({
  id,
  studentId: "student-1",
  title: "Fixture",
  rule: "Fixture",
  trigger: "always",
  exception: "",
  source: "Teacher",
  evidence: [],
  status: "candidate",
  skill: initialState().students[0].workspace.skill,
  createdAt: "2026-11-03",
});
const exam = (id: string, terminal: "cap" | "error" = "cap"): Exam => ({
  id,
  mode: "simulation",
  arm: "classroom",
  cap: 100,
  seeds: [1],
  frozen: {},
  rows: [{ terminal } as ExamRow],
  startedAt: "start",
  completedAt: "finish",
});

test("explanation navigation and existing classroom history never mark actions complete", () => {
  const state = initialState();
  state.messages.push({
    id: "old",
    role: "system",
    title: "Diagnostic practice finished",
    text: "",
    time: "",
  });
  state.exams.push(exam("old-exam"));
  let tour = newWalkthrough();
  for (let step = 0; step < 5; step++) {
    tour = update(tour, { type: "view", step });
    tour = update(tour, { type: "observe", state });
  }
  assert.deepEqual(tour.completed, [false, false, false, false, false]);
  assert.equal(state.calls, 0);
  tour = update(tour, { type: "view", step: 0 });
  tour = update(tour, { type: "start", state, studentId: "student-1" });
  tour = update(tour, { type: "accepted", result: { ok: true } });
  tour = update(tour, { type: "observe", state });
  assert.equal(tour.completed[0], false);
  state.messages.push({
    id: "new",
    role: "system",
    title: "Diagnostic practice finished",
    text: "",
    time: "",
  });
  tour = update(tour, { type: "observe", state });
  assert.equal(tour.completed[0], true);
  assert.equal(tour.step, 0); // Completion does not silently navigate or start another action.
});

test("review belongs to the selected student and rejected verification still completes", () => {
  const state = initialState();
  let tour = update(newWalkthrough(), { type: "view", step: 1 });
  tour = update(tour, { type: "start", state, studentId: "student-1" });
  tour = update(tour, { type: "accepted", result: { ok: true } });
  state.candidate = { studentId: "student-2", lesson: idea("other") };
  tour = update(tour, { type: "observe", state });
  assert.equal(tour.completed[1], false);
  state.candidate = { studentId: "student-1", lesson: idea("mine") };
  tour = update(tour, { type: "observe", state });
  assert.equal(tour.completed[1], true);
  tour = update(tour, { type: "view", step: 2 });
  tour = update(tour, { type: "start", state, studentId: "student-1" });
  tour = update(tour, { type: "accepted", result: { ok: true } });
  state.ledger.push({
    ...idea("mine"),
    status: "rejected",
    verification: {
      rows: [],
      meanDelta: -1,
      regressionDelta: 0,
      accepted: false,
      rule: "test",
      mode: "simulation",
    },
  });
  state.candidate = null;
  tour = update(tour, { type: "observe", state });
  assert.equal(tour.completed[2], true);
});

test("request failures, interrupted actions and error exams cannot claim completion", () => {
  const state = initialState();
  let tour = update(newWalkthrough(), {
    type: "start",
    state,
    studentId: "student-1",
  });
  tour = update(tour, {
    type: "accepted",
    result: { ok: false, error: "HTTP fixture" },
  });
  assert.equal(tour.failure?.message, "HTTP fixture");
  assert.equal(tour.activity, undefined);
  tour = update(tour, { type: "start", state, studentId: "student-1" });
  tour = update(tour, { type: "accepted", result: { ok: true } });
  tour = update(tour, { type: "observe", state: { ...state, busy: true } });
  tour = update(tour, { type: "observe", state });
  assert.match(tour.failure!.message, /stopped before finishing/);
  tour = update(tour, { type: "view", step: 3 });
  state.exams = [exam("historic")];
  tour = update(tour, { type: "start", state, studentId: "student-1" });
  tour = update(tour, { type: "accepted", result: { ok: true } });
  tour = update(tour, { type: "observe", state });
  assert.equal(tour.completed[3], false);
  state.exams.push(exam("new", "error"));
  tour = update(tour, { type: "observe", state });
  assert.equal(tour.completed[3], false);
  assert.match(tour.failure!.message, /exam ended with an error/);
});

test("guided actions follow real classroom completion events without changing notebooks", async () => {
  const lab = new Classroom(simulationPolicy(), undefined, {
    exerciseMoves: 1,
    verify: { practice: 1, regression: 1, moves: 1 },
  });
  let tour = newWalkthrough();
  lab.subscribe((s) => {
    tour = update(tour, { type: "observe", state: s });
  });
  const run = async (step: number, work: () => Promise<void>) => {
    tour = update(tour, { type: "view", step });
    tour = update(tour, {
      type: "start",
      state: lab.state,
      studentId: "student-1",
    });
    const task = work();
    tour = update(tour, { type: "accepted", result: { ok: true } });
    await task;
    tour = update(tour, { type: "observe", state: lab.state });
    assert.equal(tour.completed[step], true, tour.failure?.message);
  };
  await run(0, () => lab.diagnose());
  await run(1, () => lab.review("student-1"));
  await run(2, () => lab.verify());
  const frozen = structuredClone(lab.state.students.map((s) => s.workspace));
  await run(3, () => lab.exam(1, 3));
  assert.deepEqual(
    lab.state.students.map((s) => s.workspace),
    frozen,
  );
  assert.deepEqual(tour.completed, [true, true, true, true, false]);
  assert.deepEqual(newWalkthrough().completed, [
    false,
    false,
    false,
    false,
    false,
  ]);
});
