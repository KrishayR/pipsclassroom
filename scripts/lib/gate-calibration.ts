import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { candidateWorkspace } from "../../src/core/classroom";
import { focusApplies } from "../../src/core/curriculum";
import { analyze, snapshotPool } from "../../src/core/engine";
import { rollout, verificationRule } from "../../src/core/evaluation";
import { simulationPolicy } from "../../src/core/policy";
import { emptyWorkspace } from "../../src/core/skills";
import type { Focus, Lesson, Workspace } from "../../src/core/types";

export interface CalibrationOptions {
  lengths: number[];
  rounds: number;
  practice: number;
  regression: number;
  referenceBoards: number;
  referenceMoves: number;
}
export const DEFAULT_CALIBRATION: CalibrationOptions = {
  lengths: [4, 8, 12, 24],
  rounds: 4,
  practice: 6,
  regression: 2,
  referenceBoards: 3,
  referenceMoves: 150,
};
export function validateOptions(o: CalibrationOptions) {
  for (const [key, min, max] of [
    ["rounds", 2, 20],
    ["practice", 1, 24],
    ["regression", 1, 24],
    ["referenceBoards", 1, 24],
    ["referenceMoves", 2, 1000],
  ] as const)
    if (!Number.isInteger(o[key]) || o[key] < min || o[key] > max)
      throw new Error(`${key} must be ${min}–${max}.`);
  if (
    !o.lengths.length ||
    new Set(o.lengths).size !== o.lengths.length ||
    o.lengths.some(
      (n) => !Number.isInteger(n) || n < 1 || n >= o.referenceMoves,
    )
  )
    throw new Error(
      "Rollout lengths must be distinct positive integers shorter than the reference games.",
    );
}
// Fixed probes, not hand-picked winners. Stress controls are measured, never assumed harmful.
export function calibrationCases() {
  const current = emptyWorkspace();
  const cases: {
    id: string;
    focus?: Focus;
    current: Workspace;
    candidate: Workspace;
  }[] = [];
  const add = (
    id: string,
    focus: Focus | undefined,
    skill: Workspace["skill"],
    rule: boolean,
    limits?: Lesson["limits"],
  ) => {
    const lesson: Lesson = {
      id,
      title: id,
      rule: `Preserve ${focus ?? "baseline"} when applicable.`,
      exception: "Avoid clearly dangerous moves.",
      trigger: "when the skill applies",
      source: "fixed calibration probe",
      evidence: [],
      focus,
      ...(limits ? { limits } : {}),
      status: "candidate",
      skill,
      createdAt: "fixed",
    };
    const candidate = candidateWorkspace(current, lesson);
    candidate.lessons = rule ? [{ ...lesson, status: "verified" }] : [];
    cases.push({ id, focus, current: structuredClone(current), candidate });
  };
  add("no-change-control", undefined, { ...current.skill }, false);
  for (const focus of ["space", "structure", "planning"] as const) {
    add(`${focus}-rule-only`, focus, { ...current.skill }, true);
    // Conditional version: steps in only where the move breaks the skill, keeping
    // three options and giving up at most a small merge.
    add(`${focus}-conditional-rule`, focus, { ...current.skill }, true, {
      minOptions: 3,
      maxGainLoss: 8,
    });
    const skill = { ...current.skill, version: 2 };
    if (focus === "space") skill.spaceWeight = 20;
    if (focus === "structure") {
      skill.structureWeight = 4;
      skill.depth = 3;
    }
    if (focus === "planning") {
      skill.depth = 3;
      skill.riskWeight = 180;
    }
    add(`${focus}-rule-and-strategy`, focus, skill, true);
  }
  add(
    "reckless-strategy-stress-control",
    undefined,
    {
      ...current.skill,
      version: 2,
      depth: 1,
      spaceWeight: 0,
      structureWeight: 0,
      mergeWeight: 8,
      riskWeight: 20,
    },
    false,
  );
  return cases;
}
export interface CalibrationRow {
  caseId: string;
  round: number;
  split: "selection" | "holdout";
  length: number;
  accepted: boolean;
  beneficial: boolean;
  targetDelta: number;
  generalDelta: number;
  referenceTargetScoreDelta: number;
  referenceGeneralScoreDelta: number;
  referenceTargetUtilityDelta: number;
  referenceGeneralUtilityDelta: number;
  referenceGateAccepted: boolean;
  referenceTruncated: number;
  shortMs: number;
  shortDecisions: number;
}
export function agreement(rows: CalibrationRow[]) {
  const positives = rows.filter((r) => r.beneficial).length;
  const falseAccepts = rows.filter((r) => r.accepted && !r.beneficial).length;
  const falseRejects = rows.filter((r) => !r.accepted && r.beneficial).length;
  return {
    n: rows.length,
    positives,
    negatives: rows.length - positives,
    agreement: rows.length
      ? (rows.length - falseAccepts - falseRejects) / rows.length
      : null,
    falseAccepts,
    falseRejects,
    accepted: rows.filter((r) => r.accepted).length,
    meanShortMs: rows.length
      ? rows.reduce((n, r) => n + r.shortMs, 0) / rows.length
      : 0,
    meanShortDecisions: rows.length
      ? rows.reduce((n, r) => n + r.shortDecisions, 0) / rows.length
      : 0,
  };
}
export function summarizeCalibration(
  rows: CalibrationRow[],
  lengths: number[],
) {
  const table = [...lengths]
    .sort((a, b) => a - b)
    .map((length) => ({
      length,
      selection: agreement(
        rows.filter((r) => r.length === length && r.split === "selection"),
      ),
      holdout: agreement(
        rows.filter((r) => r.length === length && r.split === "holdout"),
      ),
    }));
  // Choose only on selection rounds; do not retry other lengths after seeing holdout.
  const qualifies = (s: ReturnType<typeof agreement>) =>
    s.positives >= 2 &&
    s.negatives >= 2 &&
    (s.agreement ?? 0) >= 0.8 &&
    s.falseAccepts === 0;
  const picked = table.find((t) => qualifies(t.selection));
  return {
    table,
    selectionChoice: picked?.length ?? null,
    recommendation: picked && qualifies(picked.holdout) ? picked.length : null,
    note: !picked
      ? "No tested length had enough balanced evidence and acceptable agreement on selection rounds. No recommendation."
      : !qualifies(picked.holdout)
        ? "The selection choice did not pass the held-out check. No recommendation; do not choose a replacement using these holdout results."
        : "Provisional simulation-only recommendation. Confirm with Muse and independent development repetitions before freezing a study.",
  };
}

export async function calibrateGate(
  options: CalibrationOptions = DEFAULT_CALIBRATION,
  progress?: (text: string) => void,
) {
  validateOptions(options);
  const policy = simulationPolicy();
  const cases = calibrationCases();
  const started = performance.now();
  const rows: CalibrationRow[] = [];
  const evidence: unknown[] = [];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  let totalDecisions = 0;
  const trajectory = async (
    workspace: Workspace,
    snapshot: ReturnType<typeof snapshotPool>[number],
    horizons: number[],
  ) => {
    const checkpoints = new Map<
      number,
      {
        utility: number;
        score: number;
        terminal: boolean;
        elapsedMs: number;
        decisions: number;
      }
    >();
    const max = Math.max(...horizons);
    let steps = 0;
    const began = performance.now();
    let final = {
      utility: analyze(snapshot.board).empty * 2,
      score: 0,
      terminal: false,
      elapsedMs: 0,
      decisions: 0,
    };
    const last = await rollout(
      policy,
      workspace,
      snapshot.board,
      snapshot.seed,
      max,
      () => {
        totalDecisions++;
      },
      (game) => {
        steps++;
        final = {
          utility: game.score / 8 + game.moves + analyze(game.board).empty * 2,
          score: game.score,
          terminal: game.over,
          elapsedMs: performance.now() - began,
          decisions: steps,
        };
        if (horizons.includes(steps)) checkpoints.set(steps, final);
      },
    );
    for (const cap of horizons)
      if (!checkpoints.has(cap)) {
        // A terminal trajectory is valid for every longer cap, with no extra moves.
        checkpoints.set(cap, { ...final, utility: last.utility });
      }
    if (last.errors)
      throw new Error(
        "A calibration decision failed; do not interpret an incomplete trajectory as a valid result.",
      );
    return { checkpoints, steps };
  };
  for (let round = 0; round < options.rounds; round++) {
    for (const probe of cases) {
      progress?.(`Round ${round + 1}/${options.rounds}: ${probe.id}`);
      const pools = (reference: boolean, split: "practice" | "regression") =>
        snapshotPool(
          split,
          (reference ? 20000 : 10000) + round,
          split === "practice" && probe.focus
            ? {
                key: probe.focus,
                applies: (board) => focusApplies(probe.focus!, board),
              }
            : undefined,
          reference
            ? options.referenceBoards
            : split === "practice"
              ? options.practice
              : options.regression,
        );
      const checks = new Map(
        options.lengths.map((length) => [
          length,
          {
            target: [] as number[],
            general: [] as number[],
            elapsedMs: 0,
            decisions: 0,
          },
        ]),
      );
      const samples: unknown[] = [];
      for (const split of ["practice", "regression"] as const)
        for (const snapshot of pools(false, split)) {
          const base = await trajectory(
            probe.current,
            snapshot,
            options.lengths,
          );
          const next = await trajectory(
            probe.candidate,
            snapshot,
            options.lengths,
          );
          for (const length of options.lengths) {
            const a = base.checkpoints.get(length)!,
              b = next.checkpoints.get(length)!;
            const check = checks.get(length)!;
            check[split === "practice" ? "target" : "general"].push(
              b.utility - a.utility,
            );
            check.elapsedMs += a.elapsedMs + b.elapsedMs;
            check.decisions += a.decisions + b.decisions;
          }
          samples.push({
            set: "short",
            split,
            snapshot,
            baseline: Object.fromEntries(base.checkpoints),
            candidate: Object.fromEntries(next.checkpoints),
          });
        }
      const reference = {
        targetScore: [] as number[],
        generalScore: [] as number[],
        targetUtility: [] as number[],
        generalUtility: [] as number[],
        truncated: 0,
      };
      for (const split of ["practice", "regression"] as const)
        for (const snapshot of pools(true, split)) {
          const base = await trajectory(probe.current, snapshot, [
            options.referenceMoves,
          ]);
          const next = await trajectory(probe.candidate, snapshot, [
            options.referenceMoves,
          ]);
          const a = base.checkpoints.get(options.referenceMoves)!,
            b = next.checkpoints.get(options.referenceMoves)!;
          reference[split === "practice" ? "targetScore" : "generalScore"].push(
            b.score - a.score,
          );
          reference[
            split === "practice" ? "targetUtility" : "generalUtility"
          ].push(b.utility - a.utility);
          reference.truncated += Number(!a.terminal) + Number(!b.terminal);
          samples.push({
            set: "reference",
            split,
            snapshot,
            baseline: a,
            candidate: b,
          });
        }
      const targetScore = mean(reference.targetScore),
        generalScore = mean(reference.generalScore);
      for (const length of options.lengths) {
        const check = checks.get(length)!;
        rows.push({
          caseId: probe.id,
          round,
          split:
            round < Math.ceil(options.rounds / 2) ? "selection" : "holdout",
          length,
          accepted: mean(check.target) >= 1 && mean(check.general) >= -2,
          beneficial: targetScore > 0 && generalScore >= 0,
          targetDelta: mean(check.target),
          generalDelta: mean(check.general),
          referenceTargetScoreDelta: targetScore,
          referenceGeneralScoreDelta: generalScore,
          referenceTargetUtilityDelta: mean(reference.targetUtility),
          referenceGeneralUtilityDelta: mean(reference.generalUtility),
          referenceGateAccepted:
            mean(reference.targetUtility) >= 1 &&
            mean(reference.generalUtility) >= -2,
          referenceTruncated: reference.truncated,
          // Actual measured runtime covers shared prefix work, not independent runs per length.
          shortMs: check.elapsedMs,
          shortDecisions: check.decisions,
        });
      }
      evidence.push({ caseId: probe.id, round, samples });
      await new Promise<void>((r) => setImmediate(r));
    }
  }
  return {
    schemaVersion: 1,
    mode: "simulation",
    createdAt: new Date().toISOString(),
    options,
    fixturesHash: createHash("sha256")
      .update(JSON.stringify(cases))
      .digest("hex"),
    cases,
    rule: verificationRule({
      practice: options.practice,
      regression: options.regression,
      moves: 4,
    }),
    referenceDefinition:
      "Independent development snapshots, longer capped games: positive mean targeted score gain and nonnegative mean general score gain. This is a noisy operational reference, not ground truth.",
    recommendationPolicy:
      "Shortest length with >=80% selection agreement, zero false accepts, >=2 positive and >=2 nonbeneficial cases; validate that single choice on held-out rounds using the same requirements. No fallback tuned on holdout.",
    limitations: [
      "Local heuristic simulation, not Muse learning evidence.",
      "Fixed synthetic lesson probes, not a representative population of teacher lessons.",
      "Rounds reuse probe families and are not independent teaching experiments.",
      "Short and reference pools are disjoint development snapshots; no sealed seeds used.",
      "Truncated reference games and small samples can make labels unreliable.",
      "Shared-prefix measurements are not per-length wall-time benchmarks.",
      "No gate settings are automatically changed.",
    ],
    calls: 0,
    tokens: 0,
    museCostUsd: 0,
    totalDecisions,
    elapsedMs: performance.now() - started,
    rows,
    evidence,
    ...summarizeCalibration(rows, options.lengths),
  };
}
