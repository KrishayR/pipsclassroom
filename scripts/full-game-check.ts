// npm run full-game-check -- <batch final.json or classroom export> [--games 40] [--out file]
// Free: plays each student's saved notes, and untrained notes, to the end of the game in
// simulation on fresh seeds, and reports the paired difference. No model calls.
import { readFileSync, writeFileSync } from "node:fs";
import { emptyWorkspace } from "../src/core/skills";
import type { Arm, Workspace } from "../src/core/types";
import {
  FULL_GAME_NOTE,
  fullGameRows,
  fullGameSummary,
} from "./lib/full-game-check";

const args = process.argv.slice(2);
const at = (key: string) => {
  const i = args.indexOf(`--${key}`);
  return i < 0 ? undefined : args[i + 1];
};
const file = args.find(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);
if (!file) throw new Error("Pass a batch final.json or classroom export.");
const games = Number(at("games") ?? 40);
if (!Number.isInteger(games) || games < 2 || games > 200)
  throw new Error("--games must be 2..200.");
const data = JSON.parse(readFileSync(file, "utf8"));
const state = data.state ?? data;
const arm: Arm = state.arm ?? "classroom";
const students: { id: string; name: string; workspace: Workspace }[] =
  state.students.map(
    (s: { id: string; name: string; workspace: Workspace }) => ({
      id: s.id,
      name: s.name,
      workspace: s.workspace,
    }),
  );
const started = Date.now();
const untrained = await fullGameRows(
  students.map((s) => ({ ...s, workspace: emptyWorkspace() })),
  arm,
  games,
);
const results = [];
const trained = [];
for (const s of students) {
  const rows = await fullGameRows([s], arm, games);
  trained.push(...rows);
  const summary = fullGameSummary(
    rows,
    untrained.filter((r) => r.studentId === s.id),
  );
  const k = s.workspace.skill;
  results.push({
    student: s.name,
    lessons: s.workspace.lessons.map((l) => l.title),
    skill: {
      depth: k.depth,
      spaceWeight: k.spaceWeight,
      mergeWeight: k.mergeWeight,
      structureWeight: k.structureWeight,
      riskWeight: k.riskWeight,
    },
    meanScore: summary.meanScore,
    ...summary.vsUntrained,
  });
  const c = summary.vsUntrained;
  console.log(
    `${s.name}: ${s.workspace.lessons.length} saved lesson(s) · mean ${summary.meanScore.toFixed(0)} · vs untrained ${c.meanDiff >= 0 ? "+" : ""}${c.meanDiff.toFixed(0)} points, 95% CI [${c.ci95.map((v) => v?.toFixed(0)).join(", ")}], ${c.pairs} games`,
  );
}
const all = fullGameSummary(trained, untrained);
console.log(
  `All students: vs untrained ${all.vsUntrained.meanDiff >= 0 ? "+" : ""}${all.vsUntrained.meanDiff.toFixed(0)} points, 95% CI [${all.vsUntrained.ci95.map((v) => v?.toFixed(0)).join(", ")}] · ${((Date.now() - started) / 1000).toFixed(0)} s`,
);
console.log(FULL_GAME_NOTE);
const out = at("out");
if (out) {
  writeFileSync(
    out,
    JSON.stringify(
      {
        source: file,
        games,
        note: FULL_GAME_NOTE,
        students: results,
        all: { meanScore: all.meanScore, ...all.vsUntrained },
      },
      null,
      2,
    ),
  );
  console.log(`Saved: ${out}`);
}
