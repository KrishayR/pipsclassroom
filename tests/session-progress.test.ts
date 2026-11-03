import test from "node:test";
import assert from "node:assert/strict";
import { sessionProgress } from "../src/components/SessionProgress";
import type { LiveBatch } from "../src/core/types";

test("session progress counts checkpoints without marking a stopped run complete", () => {
  const batch = {
    kind: "classroom",
    total: 2,
    status: "running",
    timings: [{ stage: "baseline", elapsedMs: 1 }],
  } as LiveBatch;
  assert.deepEqual(sessionProgress(batch), { completed: 1, total: 7 });
  assert.deepEqual(sessionProgress({ ...batch, kind: "individual" }), {
    completed: 1,
    total: 9,
  });
  assert.deepEqual(sessionProgress({ ...batch, status: "complete" }), {
    completed: 7,
    total: 7,
  });
  assert.deepEqual(
    sessionProgress({
      ...batch,
      status: "stopped",
      timings: Array(20).fill(batch.timings![0]),
    }),
    { completed: 6, total: 7 },
  );
  assert.deepEqual(sessionProgress({ ...batch, timings: undefined }), {
    completed: 0,
    total: 7,
  });
});
