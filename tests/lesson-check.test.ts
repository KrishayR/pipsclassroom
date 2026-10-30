import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lessonCheckRunner } from "../server/lesson-check";
import { keyPool } from "../server/keys";
import { emptyWorkspace } from "../src/core/skills";
import { simulationPolicy } from "../src/core/policy";
import { DEV_SEEDS } from "../src/core/evaluation";

function fixture(stopAt?: number) {
  const root = mkdtempSync(join(tmpdir(), "cl-lesson-check-")),
    directory = join(root, "source");
  mkdirSync(directory);
  const baseline = emptyWorkspace(),
    candidate = structuredClone(baseline);
  candidate.version = 2;
  candidate.lessons.push({
    id: "saved-lesson",
    title: "Keep room",
    rule: "Keep room when crowded.",
    trigger: "always",
    exception: "Unless a merge opens space.",
    source: "Teacher",
    evidence: ["trace"],
    status: "verified",
    skill: baseline.skill,
    createdAt: "fixture",
  });
  const source = {
    state: {
      students: [{ id: "student-2", name: "Lin", workspace: candidate }],
      exams: [{ frozen: { "student-2": baseline }, seeds: [123] }],
      ledger: [],
    },
  };
  writeFileSync(join(directory, "final.json"), JSON.stringify(source));
  writeFileSync(
    join(root, "live-batch-latest.json"),
    JSON.stringify({ status: "complete", plannerEnabled: false, directory }),
  );
  let active = 0,
    peak = 0,
    calls = 0;
  let runner: ReturnType<typeof lessonCheckRunner>;
  runner = lessonCheckRunner(() => {}, {
    root,
    createPool: () => keyPool({ keys: ["fixture"], prices: null, limitUsd: 1 }),
    getPrices: () => ({ input: 0.1, output: 0.2 }),
    createPolicy: () => ({
      ...simulationPolicy(),
      usesHelper: false,
      async decide(observation, workspace) {
        peak = Math.max(peak, ++active);
        try {
          calls++;
          if (calls === stopAt) runner.stop();
          await new Promise((r) => setImmediate(r));
          assert.deepEqual(
            workspace,
            workspace.lessons.length ? candidate : baseline,
          );
          return {
            action: observation.legal[0],
            summary: "fixture",
            tokens: 0,
            calls: 0,
            simulations: 0,
            tools: [],
          };
        } finally {
          active--;
        }
      },
    }),
  });
  return { runner, root, source, peak: () => peak };
}

test("lesson comparison freezes the source, saves paired controls and full trajectories, and makes no teaching calls", async () => {
  const { runner, source, peak } = fixture();
  await runner.start();
  const s = runner.status()!;
  assert.equal(s.status, "complete");
  assert.equal(s.completed, 18);
  assert.equal(s.trials.length, 18);
  assert.ok(peak() <= 6);
  assert.equal(s.spentUsd, 0);
  assert.deepEqual(
    JSON.parse(readFileSync(`${s.directory}/source.json`, "utf8")),
    source,
  );
  assert.equal(s.protocol.seeds.length, 3);
  assert.ok(
    s.protocol.seeds.every((seed) => !DEV_SEEDS.includes(seed) && seed !== 123),
  );
  for (const seed of s.protocol.seeds)
    for (const rep of [0, 1]) {
      const rows = s.trials.filter(
        (t) => t.row.seed === seed && t.repetition === rep,
      );
      assert.deepEqual(
        rows.map((t) => t.condition),
        ["control-a", "control-b", "lesson"],
      );
      assert.ok(
        rows.every(
          (t) => t.row.trajectory!.length === t.row.moves && t.row.moves <= 50,
        ),
      );
    }
  assert.equal(s.summary!.lessonMeanDelta, 0);
  assert.equal(s.summary!.controlMeanAbsoluteDelta, 0);
  const reloaded = lessonCheckRunner(() => {}, {
    root: s.directory.replace(/[/\\]lesson-check-\d+$/, ""),
  });
  assert.equal(reloaded.status()!.completed, 18);
});

test("stopped lesson comparison drains work and preserves partial trajectories without a complete summary", async () => {
  const { runner } = fixture(5);
  await runner.start();
  const s = runner.status()!;
  assert.equal(s.status, "stopped");
  assert.ok(s.completed < 18);
  assert.equal(s.summary, undefined);
  assert.ok(s.trials.some((t) => t.row.trajectory!.length > 0));
  assert.equal(
    JSON.parse(readFileSync(`${s.directory}/status.json`, "utf8")).status,
    "stopped",
  );
});
