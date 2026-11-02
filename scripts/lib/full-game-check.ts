// Free full-game check. Saved notes are played to the end of the game by the
// simulation student, which plays the same plan live Muse students are shown as
// lessonPlan. No model calls. Short live exams end at a move cap before strategy
// differences show; this reports what the notes do over whole games.
import { hash } from "../../src/core/engine";
import {
  examEpisode,
  pairedContrast,
  summarize,
} from "../../src/core/evaluation";
import { simulationPolicy } from "../../src/core/policy";
import type { Arm, ExamRow, Workspace } from "../../src/core/types";

// Fresh seeds, not DEV_SEEDS: the strategy probes were screened on development seeds,
// so checking on those would favour them.
export const FULL_GAME_SEEDS = Array.from({ length: 200 }, (_, i) =>
  hash(`full-game-check-v1:${i}`),
);
export const FULL_GAME_CAP = 5000;
export const FULL_GAME_NOTE =
  "Simulation student playing each saved workspace to the end of the game (5,000-move cap) on fresh seeds; no model calls. It shows what the saved notes do over whole games, not how live Muse plays them.";

export async function fullGameRows(
  students: { id: string; name: string; workspace: Workspace }[],
  arm: Arm,
  games: number,
  repetition = 0,
): Promise<ExamRow[]> {
  const policy = simulationPolicy();
  const rows: ExamRow[] = [];
  for (const seed of FULL_GAME_SEEDS.slice(0, games))
    for (const s of students) {
      const row = await examEpisode(
        policy,
        s.workspace,
        seed,
        FULL_GAME_CAP,
        s,
        arm,
      );
      delete row.trajectory;
      rows.push({ ...row, repetition });
    }
  return rows;
}

// Paired by seed and student: each student's notes against untrained notes.
export function fullGameSummary(rows: ExamRow[], untrained: ExamRow[]) {
  const base = untrained.flatMap((r) =>
    [...new Set(rows.map((x) => x.repetition ?? 0))].map((repetition) => ({
      ...r,
      repetition,
    })),
  );
  return {
    ...summarize(rows, FULL_GAME_CAP),
    vsUntrained: pairedContrast(rows, base),
  };
}
