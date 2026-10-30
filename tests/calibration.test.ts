import test from "node:test";
import assert from "node:assert/strict";
import {
  calibrateGate,
  DEFAULT_CALIBRATION,
  summarizeCalibration,
  validateOptions,
  calibrationCases,
  type CalibrationRow,
} from "../scripts/lib/gate-calibration";
import { rollout, verifyCandidate } from "../src/core/evaluation";
import { simulationPolicy } from "../src/core/policy";
import { fromBoard, snapshotPool } from "../src/core/engine";
import type { Lesson } from "../src/core/types";

test("calibration rejects invalid sizes and a reference no longer than short tests", () => {
  for (const options of [
    { rounds: 1 },
    { rounds: 2.5 },
    { lengths: [0] },
    { lengths: [4, 4] },
    { referenceMoves: 24 },
    { regression: 0 },
    { referenceBoards: 0 },
  ])
    assert.throws(() =>
      validateOptions({ ...DEFAULT_CALIBRATION, ...options }),
    );
});

test("calibration selects on development rounds only and does not retune on holdout", () => {
  const rows: CalibrationRow[] = [];
  for (const length of [4, 8])
    for (const split of ["selection", "holdout"] as const)
      for (let i = 0; i < 4; i++) {
        rows.push({
          caseId: String(i),
          round: 0,
          split,
          length,
          beneficial: i < 2,
          accepted: length === 4 && split === "holdout" ? true : i < 2,
          targetDelta: 0,
          generalDelta: 0,
          referenceTargetScoreDelta: 0,
          referenceGeneralScoreDelta: 0,
          referenceTargetUtilityDelta: 0,
          referenceGeneralUtilityDelta: 0,
          referenceGateAccepted: false,
          referenceTruncated: 0,
          shortMs: 0,
          shortDecisions: 0,
        });
      }
  const result = summarizeCalibration(rows, [8, 4]);
  assert.equal(result.selectionChoice, 4);
  assert.equal(result.recommendation, null);
  assert.equal(result.table[1].holdout.agreement, 1);
  assert.equal(
    summarizeCalibration(
      rows.filter((r) => !r.beneficial),
      [4, 8],
    ).selectionChoice,
    null,
  );
});

test("saved checkpoints match the unchanged gate, preserve terminal scores and use disjoint reference boards", async () => {
  const report = await calibrateGate({
    lengths: [1, 3],
    rounds: 2,
    practice: 1,
    regression: 1,
    referenceBoards: 1,
    referenceMoves: 8,
  });
  assert.equal(report.calls, 0);
  assert.equal(report.museCostUsd, 0);
  assert.equal(report.rows.length, calibrationCases().length * 2 * 2);
  const unchanged = report.rows.filter((r) => r.caseId === "no-change-control");
  assert.ok(
    unchanged.every(
      (r) =>
        !r.accepted &&
        !r.beneficial &&
        r.targetDelta === 0 &&
        r.generalDelta === 0,
    ),
  );
  const probe = calibrationCases().find(
    (c) => c.id === "structure-rule-and-strategy",
  )!;
  const lesson: Lesson = { ...probe.candidate.lessons[0], status: "candidate" };
  const direct = await verifyCandidate(
    simulationPolicy(),
    probe.current,
    lesson,
    10000,
    undefined,
    undefined,
    { practice: 1, regression: 1, moves: 3 },
  );
  const row = report.rows.find(
    (r) => r.caseId === probe.id && r.round === 0 && r.length === 3,
  )!;
  assert.equal(row.targetDelta, direct.meanDelta);
  assert.equal(row.generalDelta, direct.regressionDelta);
  assert.equal(row.accepted, direct.accepted);
  const seeds = { short: new Set<number>(), reference: new Set<number>() };
  for (const block of report.evidence as {
    caseId: string;
    samples: { set: "short" | "reference"; snapshot: { seed: number } }[];
  }[])
    for (const sample of block.samples)
      seeds[sample.set].add(sample.snapshot.seed);
  assert.ok([...seeds.short].every((seed) => !seeds.reference.has(seed)));
  // Score checkpoints must be exact even if a reachable reference game ends early.
  const sample = snapshotPool("practice", 20000, undefined, 1)[0];
  let lastGame = fromBoard(sample.board, sample.seed);
  await rollout(
    simulationPolicy(),
    calibrationCases()[0].current,
    sample.board,
    sample.seed,
    8,
    undefined,
    (game) => {
      lastGame = game;
    },
  );
  const block = report.evidence[0] as {
    samples: { set: string; split: string; baseline: { score: number } }[];
  };
  const saved = block.samples.find(
    (s) => s.set === "reference" && s.split === "practice",
  )!;
  assert.equal(saved.baseline.score, lastGame.score);
});
