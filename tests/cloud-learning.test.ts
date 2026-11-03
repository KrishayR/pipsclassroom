import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve("scripts/cloud-learning.ts");
const tsx = import.meta.resolve("tsx");
function run(budget: string, live = false) {
  const cwd = mkdtempSync(join(tmpdir(), "classroom-cloud-"));
  const env: NodeJS.ProcessEnv = { ...process.env, CLOUD_BUDGET_USD: budget };
  delete env.MODEL_API_KEY;
  delete env.MODEL_API_KEYS;
  const result = spawnSync(
    process.execPath,
    ["--import", tsx, script, ...(live ? ["--live"] : [])],
    { cwd, env, encoding: "utf8", timeout: 15000 },
  );
  return { ...result, cwd };
}

test("cloud dry-run matches the five-hour profile without a key or saved experiment", () => {
  const r = run("20");
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.live, false);
  assert.equal(plan.kind, "classroom");
  assert.equal(plan.cycles, 100);
  assert.deepEqual(plan.limits, {
    budgetUsd: 20,
    examMoves: 300,
    examSeeds: 2,
    maxRuntimeMs: 18000000,
    optimize: true,
    finalExamReserveMs: 2700000,
  });
  assert.equal(existsSync(join(r.cwd, "cloud-results")), false);
});

test("cloud budgets are bounded before any paid operation", () => {
  for (const invalid of ["0", "-1", "21", "NaN"]) {
    const r = run(invalid);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /at most \$20/);
    assert.equal(existsSync(join(r.cwd, "cloud-results")), false);
  }
  assert.equal(JSON.parse(run("5").stdout).limits.budgetUsd, 5);
});

test("missing cloud secret fails clearly and saves a readable failure summary", () => {
  const r = run("5", true);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /MODEL_API_KEY repository secret/);
  const summary = readFileSync(
    join(r.cwd, "cloud-results", "SUMMARY.md"),
    "utf8",
  );
  assert.match(summary, /Status: not started/);
  assert.match(summary, /Completed learning cycles: 0/);
  assert.match(summary, /\$0.000 \/ \$5/);
});
