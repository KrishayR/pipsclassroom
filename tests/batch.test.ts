import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { liveBatchRunner } from "../server/batch";
import { simulationPolicy } from "../src/core/policy";
import { keyPool } from "../server/keys";

test("configurable batches validate counts and save baseline, each cycle, and final evidence without network calls", async () => {
  for (const count of [5, 2]) {
    const root = mkdtempSync(join(tmpdir(), "cl-batch-"));
    const batch = liveBatchRunner(() => {}, {
      root,
      createPolicy: simulationPolicy,
      createPool: () =>
        keyPool({ keys: ["test-only"], limitUsd: 1, prices: null }),
      getPrices: () => ({ input: 0.1, output: 0.2 }),
      protocol: {
        verify: { practice: 1, regression: 1, moves: 1 },
        exerciseMoves: 1,
      },
    });
    for (const invalid of [0, -1, 1.5, 101, NaN])
      await assert.rejects(batch.start(invalid), /whole number/);
    assert.equal(batch.status(), undefined);
    await batch.start(count);
    const status = batch.status()!;
    assert.equal(status.status, "complete");
    assert.equal(status.completed, count);
    assert.equal(status.total, count);
    assert.equal(status.concurrency, 3);
    assert.equal(status.timings!.length, 1 + count * 4);
    assert.equal(status.baseline!.length, 3);
    assert.deepEqual(
      status.cycles.map((c) => c.student),
      ["Ada", "Lin", "Sam", "Ada", "Lin"].slice(0, count),
    );
    assert.ok(
      status.cycles.every(
        (c) => c.rows.length === 3 && !!c.lesson.verification,
      ),
    );
    assert.equal(status.spentUsd, 0);
    assert.ok(existsSync(`${status.directory}/cycle-${count}.json`));
    const report = JSON.parse(
      readFileSync(`${status.directory}/final.json`, "utf8"),
    );
    assert.equal(report.state.exams.length, count + 1);
    assert.equal(report.state.ledger.length, count);
    assert.equal(report.state.calls, 0);
    assert.equal(report.protocol.concurrency, 3);
    assert.equal(
      liveBatchRunner(() => {}, { root }).status()!.completed,
      count,
    );
  }
});
