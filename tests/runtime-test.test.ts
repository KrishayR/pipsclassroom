import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runtimeTestRunner } from "../server/runtime-test";
import { initialState } from "../src/core/classroom";

test("temporary runtime test runs all four cases, saves results and preserves classroom state", async () => {
  const root = mkdtempSync(join(tmpdir(), "cl-runtime-"));
  const source = initialState("model"),
    before = structuredClone(source);
  const runner = runtimeTestRunner(() => {}, { root, simulation: true });
  const operation = runner.start(source);
  assert.throws(() => runner.start(source), /already running/);
  await operation;
  const status = runner.status()!;
  assert.equal(status.status, "complete");
  assert.equal(status.completedGames, 24);
  assert.equal(status.totalGames, 24);
  assert.equal(status.budgetUsd, 2);
  assert.equal(status.spentUsd, 0);
  assert.deepEqual(
    status.results.map((r) => [r.effort, r.concurrency]),
    [
      ["low", 3],
      ["low", 6],
      ["minimal", 6],
      ["minimal", 3],
    ],
  );
  assert.ok(existsSync(status.reportPath));
  const report = await runner.report();
  assert.equal(report.plan.maxDecisions, 240);
  assert.equal(report.plan.budgetUsd, 2);
  assert.equal(report.frozenWorkspaces.length, 1);
  assert.ok(
    report.results.every(
      (r) =>
        r.rows.length === 6 &&
        r.rows.every((row) => row.trajectory?.length === row.moves),
    ),
  );
  assert.deepEqual(source, before);
  assert.equal(
    runtimeTestRunner(() => {}, { root, simulation: true }).status()!.status,
    "complete",
  );
});

test("stopping the runtime test preserves a downloadable partial report and never runs remaining cases", async () => {
  const root = mkdtempSync(join(tmpdir(), "cl-runtime-stop-"));
  let requested = false;
  const runner = runtimeTestRunner(
    () => {
      if (!requested && (runner.status()?.completedGames ?? 0) > 0) {
        requested = true;
        runner.stop();
      }
    },
    { root, simulation: true },
  );
  await runner.start(initialState("model"));
  assert.equal(runner.status()!.status, "stopped");
  assert.ok(runner.status()!.completedGames < 24);
  assert.equal((await runner.report()).results.length, 1);
  assert.equal(runner.status()!.reportAvailable, true);
});
