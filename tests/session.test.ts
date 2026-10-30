import test from "node:test";
import assert from "node:assert/strict";
import { Classroom } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import type { Policy } from "../src/core/types";
import { liveBatchRunner } from "../server/batch";
import { keyPool } from "../server/keys";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const normalize = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (key, v) =>
      [
        "id",
        "revisionOf",
        "createdAt",
        "time",
        "durationMs",
        "latencyMs",
        "evidence",
      ].includes(key)
        ? undefined
        : key === "lessonId"
          ? !!v
          : v,
    ),
  );

test("classroom teaching preserves deterministic serial results, freezes peers and shares six slots", async () => {
  async function execute(concurrency: number) {
    const base = simulationPolicy();
    let active = 0,
      peak = 0,
      proposals = 0;
    let frozen: ReturnType<typeof structuredClone<Classroom["state"]>>;
    const policy: Policy = {
      ...base,
      async decide(...args) {
        peak = Math.max(peak, ++active);
        try {
          await new Promise((r) => setImmediate(r));
          const d = await base.decide(...args);
          return { ...d, tokens: 7, calls: 1 };
        } finally {
          active--;
        }
      },
      async propose(student, arm, peer, focus, options) {
        proposals++;
        if (peer) {
          const original = frozen.students.find((s) => s.id === peer.id)!;
          assert.deepEqual(peer.workspace, original.workspace);
          assert.deepEqual(peer.traces, original.traces);
        }
        return base.propose(student, arm, peer, focus, options);
      },
    };
    const lab = new Classroom(policy, undefined, {
      concurrency,
      verificationConcurrency: 6,
      reviseRejected: true,
      exerciseMoves: 1,
      verify: { practice: 2, regression: 1, moves: 2 },
    });
    await lab.diagnose();
    frozen = structuredClone(lab.state);
    peak = 0;
    await lab.teachClassroom();
    assert.ok(peak <= 6);
    assert.equal(active, 0);
    assert.ok(proposals >= 3 && proposals <= 6);
    assert.equal(lab.state.pendingCandidates!.length, 0);
    assert.equal(lab.state.trainingRound, 6);
    assert.equal(lab.state.calls, lab.state.tokens / 7);
    for (const student of lab.state.students) {
      const lessons = lab.state.ledger.filter(
        (l) => l.studentId === student.id,
      );
      assert.ok(lessons.length >= 1 && lessons.length <= 2);
      assert.ok(
        student.workspace.lessons.every((l) => l.studentId === student.id),
      );
    }
    return {
      lab,
      result: normalize({
        students: lab.state.students.map((s) => ({
          name: s.name,
          workspace: s.workspace,
          traces: s.traces.map((t) => ({
            before: t.before,
            after: t.after,
            action: t.action,
          })),
        })),
        ledger: lab.state.ledger.map((l) => ({
          studentId: l.studentId,
          status: l.status,
          rule: l.rule,
          verification: l.verification,
        })),
        calls: lab.state.calls,
        tokens: lab.state.tokens,
        simulations: lab.state.simulations,
      }),
    };
  }
  const serial = await execute(1),
    parallel = await execute(3);
  assert.deepEqual(parallel.result, serial.result);
});

test("classroom batch shares practice and exams while individual cycles rotate Ada Lin Sam", async () => {
  for (const kind of ["classroom", "individual"] as const) {
    const root = mkdtempSync(join(tmpdir(), "cl-session-"));
    const batch = liveBatchRunner(() => {}, {
      root,
      createPolicy: simulationPolicy,
      createPool: () =>
        keyPool({ keys: ["fixture"], limitUsd: 1, prices: null }),
      getPrices: () => ({ input: 0.1, output: 0.2 }),
      protocol: {
        exerciseMoves: 1,
        reviseRejected: false,
        verify: { practice: 1, regression: 1, moves: 1 },
      },
    });
    await batch.start(kind === "classroom" ? 2 : 3, kind);
    const status = batch.status()!;
    assert.equal(status.status, "complete");
    assert.equal(status.kind, kind);
    const saved = JSON.parse(
      readFileSync(`${status.directory}/final.json`, "utf8"),
    );
    if (kind === "classroom") {
      assert.equal(saved.state.exams.length, 3);
      assert.equal(status.timings!.length, 7);
      assert.ok(status.cycles.every((c) => c.attempts!.length === 3));
      assert.equal(saved.state.ledger.length, 6);
      assert.equal(saved.state.trainingRound, 12);
      assert.equal(
        Object.keys(saved.state.sessionTeaching.frozenWorkspaces).length,
        3,
      );
    } else
      assert.deepEqual(
        status.cycles.map((c) => c.student),
        ["Ada", "Lin", "Sam"],
      );
    assert.ok(
      saved.state.exams.every((e: any) =>
        e.rows.every((r: any) => r.trajectory.length === r.moves),
      ),
    );
  }
});

test("stopping a classroom session drains requests, saves candidates and leaves no busy child", async () => {
  const base = simulationPolicy();
  let lab: Classroom;
  let stop = false,
    started = 0;
  const policy: Policy = {
    ...base,
    async decide(...args) {
      started++;
      if (stop) lab.stop();
      return base.decide(...args);
    },
  };
  lab = new Classroom(policy, undefined, {
    concurrency: 3,
    exerciseMoves: 1,
    verificationConcurrency: 6,
  });
  await lab.diagnose();
  stop = true;
  await lab.teachClassroom().catch(() => {});
  const ended = started;
  await new Promise((r) => setImmediate(r));
  assert.equal(started, ended);
  assert.equal(lab.state.busy, false);
  assert.ok(lab.state.students.every((s) => s.workspace.version === 1));
});

test("a failed session preserves partial evidence and never starts the final exam", async () => {
  const base = simulationPolicy();
  const root = mkdtempSync(join(tmpdir(), "cl-session-error-"));
  const batch = liveBatchRunner(() => {}, {
    root,
    createPolicy: () => ({
      ...base,
      async propose(...args) {
        if (args[0].name === "Lin") throw new Error("fixture provider failure");
        return base.propose(...args);
      },
    }),
    createPool: () => keyPool({ keys: ["fixture"], limitUsd: 1, prices: null }),
    getPrices: () => ({ input: 0.1, output: 0.2 }),
    protocol: {
      exerciseMoves: 1,
      verify: { practice: 1, regression: 1, moves: 1 },
    },
  });
  await batch.start(1, "classroom");
  assert.equal(batch.status()!.status, "error");
  assert.equal(batch.status()!.completed, 0);
  const saved = JSON.parse(
    readFileSync(`${batch.status()!.directory}/final.json`, "utf8"),
  );
  assert.equal(saved.state.exams.length, 1);
  assert.ok(saved.state.students.every((s: any) => s.traces.length >= 3));
  assert.equal(saved.state.busy, false);
});
