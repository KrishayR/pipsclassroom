import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { initialState } from "../src/core/classroom";
import { listRecordings, loadRecording } from "../server/recordings";

test("recorded runs are listed in stage order and only listed files can be read", () => {
  const root = mkdtempSync(`${tmpdir()}/recordings-`);
  const dir = `${root}/batch-x/live-batch-1700000000000`;
  mkdirSync(dir, { recursive: true });
  const state = initialState("model");
  state.students[0].game.rng = 123;
  state.ledger = [
    { status: "verified" },
    { status: "rejected" },
  ] as typeof state.ledger;
  const write = (name: string) =>
    writeFileSync(`${dir}/${name}.json`, JSON.stringify({ state }));
  for (const name of [
    "final",
    "cycle-1-exam",
    "cycle-1",
    "baseline",
    "cycle-1-teaching",
    "cycle-1-practice",
  ])
    write(name);
  writeFileSync(
    `${dir}/status.json`,
    JSON.stringify({
      kind: "classroom",
      status: "complete",
      startedAt: "2026-11-02T00:00:00Z",
      completed: 1,
      total: 1,
      spentUsd: 0.1,
      cycles: [],
    }),
  );
  const [run] = listRecordings(root);
  assert.equal(run.id, "live-batch-1700000000000");
  assert.deepEqual(
    run.stages.map((s) => s.id),
    [
      "baseline",
      "cycle-1-practice",
      "cycle-1-teaching",
      "cycle-1-exam",
      "final",
    ],
  );
  assert.equal(run.lessonsKept, 1);
  assert.equal(run.lessonsTested, 2);
  const shown = loadRecording(run.id, "cycle-1-teaching", root);
  assert.equal(shown.students[0].game.rng, 0);
  assert.equal(shown.busy, false);
  assert.throws(() => loadRecording(run.id, "status", root));
  assert.throws(() => loadRecording(run.id, "../../../etc/passwd", root));
  assert.throws(() => loadRecording("../batch-x", "final", root));
});
