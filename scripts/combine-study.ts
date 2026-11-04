// npm run combine-study -- <first report> <retrain report> [--redo file] [--out file]
// Combines a study report with a retrain of some groups (same sealed seeds and cap):
// groups and exam conditions in the retrain replace those in the first report. Live
// contrasts are recomputed, and the free full-game check is rerun on the combined notes.
// --redo adds games replayed by scripts/redo-exam-games.ts in place of errored ones.
import { readFileSync, writeFileSync } from "node:fs";
import { pairedContrast, summarize } from "../src/core/evaluation";
import { emptyWorkspace } from "../src/core/skills";
import type { Arm, ExamRow, Workspace } from "../src/core/types";
import {
  FULL_GAME_NOTE,
  fullGameRows,
  fullGameSummary,
} from "./lib/full-game-check";

const args = process.argv.slice(2);
const at = (key: string) => {
  const j = args.indexOf(`--${key}`);
  return j < 0 ? undefined : args[j + 1];
};
const out = at("out") ?? "data/study2/combined.json";
const redoPath = at("redo");
const [firstPath, retrainPath] = args.filter(
  (a, j) => !a.startsWith("--") && !args[j - 1]?.startsWith("--"),
);
if (!firstPath || !retrainPath) throw new Error("Pass two report files.");
type Report = {
  config: { seeds: number; cap: number; sealedSeedSha256: string | null };
  training: {
    arm: Arm;
    dollars: number | null;
    error?: string;
    ledger: { status: string }[];
    workspaces: { id: string; name: string; workspace: Workspace }[];
  }[];
  exams: {
    condition: string;
    rows: ExamRow[];
    usage: { dollars: number | null };
  }[];
};
const first: Report = JSON.parse(readFileSync(firstPath, "utf8"));
const retrain: Report = JSON.parse(readFileSync(retrainPath, "utf8"));
for (const key of ["seeds", "cap", "sealedSeedSha256"] as const)
  if (first.config[key] !== retrain.config[key])
    throw new Error(`Reports differ in ${key}; they cannot be combined.`);
const retrained = new Set(retrain.training.map((t) => t.arm));
const training = [
  ...first.training.filter((t) => !retrained.has(t.arm)),
  ...retrain.training,
];
const replaced = new Set(retrain.exams.map((e) => e.condition));
const exams = [
  ...first.exams.filter((e) => !replaced.has(e.condition)),
  ...retrain.exams,
];
if (redoPath) {
  const redo: { exams: Report["exams"] } = JSON.parse(
    readFileSync(redoPath, "utf8"),
  );
  for (const r of redo.exams) {
    const e = exams.find((x) => x.condition === r.condition)!;
    const replayed = (x: ExamRow) =>
      r.rows.some(
        (y) => !y.error && y.seed === x.seed && y.studentId === x.studentId,
      );
    e.rows = [...e.rows.filter((x) => !(x.error && replayed(x))), ...r.rows];
    e.usage = { dollars: (e.usage.dollars ?? 0) + (r.usage.dollars ?? 0) };
  }
}
const rows = (c: string) =>
  (exams.find((e) => e.condition === c)?.rows ?? []).filter((r) => !r.error);
const live: Record<string, unknown> = {};
for (const e of exams) live[e.condition] = summarize(e.rows, first.config.cap);
const pairs: [string, string, string][] = [
  ["primary", "classroom", "adaptive"],
  ["adaptation", "adaptive", "teacher"],
  ["teacher", "teacher", "solo"],
  ["classroomVsSolo", "classroom", "solo"],
  ...(["solo", "teacher", "adaptive", "classroom"].map((a) => [
    `${a}VsUntrained`,
    a,
    "baseline",
  ]) as [string, string, string][]),
  ["classroomVs:lessons-only", "classroom", "classroom:lessons-only"],
  ["classroomVs:no-skill-tool", "classroom", "classroom:no-skill-tool"],
];
const contrasts: Record<string, unknown> = {};
for (const [name, t, b] of pairs)
  if (rows(t).length && rows(b).length)
    contrasts[name] = {
      treatment: t,
      baseline: b,
      ...pairedContrast(rows(t), rows(b)),
    };

// Free full-game check on every group's saved notes, against untrained notes.
const games = 40;
const students = training[0].workspaces.map((s) => ({
  ...s,
  workspace: emptyWorkspace(),
}));
const untrained = await fullGameRows(students, "solo", games);
const fullGame: Record<string, unknown> = {};
const fullRows: Record<string, ExamRow[]> = {};
for (const t of training) {
  fullRows[t.arm] = await fullGameRows(t.workspaces, t.arm, games);
  fullGame[t.arm] = fullGameSummary(fullRows[t.arm], untrained);
}
const between = (a: Arm, b: Arm) =>
  fullRows[a] && fullRows[b] ? pairedContrast(fullRows[a], fullRows[b]) : null;
const report = {
  sources: [firstPath, retrainPath, redoPath ?? null],
  note: "Groups listed in the retrain replace the first report's groups, with their exam conditions. Same sealed seeds, cap and baseline.",
  config: first.config,
  training: training.map((t) => ({
    arm: t.arm,
    kept: t.ledger.filter((l) => l.status === "verified").length,
    tested: t.ledger.length,
    dollars: t.dollars,
    stopped: t.error,
    workspaces: t.workspaces,
  })),
  live: { summaries: live, contrasts },
  fullGameCheck: {
    note: FULL_GAME_NOTE,
    games,
    summaries: fullGame,
    contrasts: {
      primary: between("classroom", "adaptive"),
      adaptation: between("adaptive", "teacher"),
      teacher: between("teacher", "solo"),
    },
  },
  examDollars: exams.reduce((s, e) => s + (e.usage.dollars ?? 0), 0),
};
writeFileSync(out, JSON.stringify(report, null, 2));
const fmt = (c: unknown) => {
  const x = c as { meanDiff: number; ci95: (number | null)[]; pairs: number };
  return `${x.meanDiff >= 0 ? "+" : ""}${x.meanDiff.toFixed(0)} [${x.ci95.map((v) => v?.toFixed(0)).join(", ")}], ${x.pairs} pairs`;
};
for (const t of report.training)
  console.log(`${t.arm}: ${t.kept} of ${t.tested} lessons kept`);
for (const [k, v] of Object.entries(contrasts))
  console.log(`Live ${k}: ${fmt(v)}`);
for (const [k, v] of Object.entries(fullGame))
  console.log(
    `Full games ${k}: vs untrained ${fmt((v as { vsUntrained: unknown }).vsUntrained)}`,
  );
for (const [k, v] of Object.entries(report.fullGameCheck.contrasts))
  if (v) console.log(`Full games ${k}: ${fmt(v)}`);
console.log(`Saved: ${out}`);
