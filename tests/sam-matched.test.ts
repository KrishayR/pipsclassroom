import test from "node:test";
import assert from "node:assert/strict";
import { samJobs, runSamMatched, samSummary } from "../scripts/lib/sam-matched";
import { emptyWorkspace } from "../src/core/skills";
import type { Policy } from "../src/core/types";
import { simulationPolicy } from "../src/core/policy";

test("matched jobs pair seed and repeat and balance the leading condition", () => {
  const jobs = samJobs([11, 22, 33, 44]);
  assert.equal(jobs.length, 24);
  for (let repeat = 0; repeat < 3; repeat++)
    for (const seed of [11, 22, 33, 44])
      assert.deepEqual(
        jobs
          .filter((j) => j.seed === seed && j.repeat === repeat)
          .map((j) => j.condition)
          .sort(),
        ["empty", "trained"],
      );
  assert.equal(
    jobs.filter((j, i) => i % 2 === 0 && j.condition === "trained").length,
    6,
  );
});

test("each condition starts on matched boards, preserves frozen notes and saves separate traces", async () => {
  const notebook = emptyWorkspace();
  notebook.version = 4;
  notebook.skill.spaceWeight = 9;
  const before = JSON.stringify(notebook);
  const seen: number[] = [];
  const policy: Policy = {
    ...simulationPolicy(),
    decide: async (observation, workspace) => {
      seen.push(workspace.skill.spaceWeight);
      return {
        action: observation.legal[0],
        summary: "fixture",
        tools: [],
        tokens: 0,
        calls: 0,
        simulations: 0,
      };
    },
  };
  const rows = await runSamMatched(policy, notebook, samJobs([11, 22], 2), 4);
  assert.equal(rows.length, 8);
  assert.ok(seen.includes(9));
  assert.ok(seen.some((v) => v !== 9));
  assert.equal(JSON.stringify(notebook), before);
  for (const trained of rows.filter((r) => r.condition === "trained")) {
    const empty = rows.find(
      (r) =>
        r.condition === "empty" &&
        r.seed === trained.seed &&
        r.repeat === trained.repeat,
    )!;
    assert.deepEqual(
      trained.row.trajectory![0].before,
      empty.row.trajectory![0].before,
    );
    assert.equal(trained.row.trajectory!.length, 4);
  }
  const summary = samSummary(rows);
  assert.equal(summary.pairs, 4);
  assert.equal(summary.meanDelta, 0);
  // Missing or error control games must not be treated as zero-score controls.
  rows[0].row.terminal = "error";
  assert.equal(samSummary(rows).pairs, 3);
});

test("API errors retain partial games and stop queued comparisons", async () => {
  let calls = 0,
    saved = 0;
  const policy: Policy = {
    ...simulationPolicy(),
    decide: async () => {
      calls++;
      throw new Error("HTTP 504 fixture");
    },
  };
  await assert.rejects(
    runSamMatched(policy, emptyWorkspace(), samJobs([11, 22, 33, 44]), 300, {
      saved: (result) => {
        saved++;
        assert.equal(result.row.terminal, "error");
      },
    }),
    /HTTP 504 fixture/,
  );
  assert.ok(calls <= 6);
  assert.equal(calls, saved);
});
