// npm run redo-exam-games -- <report.json> [--out file]
// Replays a study report's errored exam games now, with the same saved notes, seed, cap
// and helper setting as scripts/evaluate.ts, while that run is still going (its own
// --resume would only replay them after it ends). Rows go to a separate file; each
// condition's usage is its own. Finished games are saved at once and skipped on rerun.
// Run it with its own MODEL_KEY_LEDGER: two processes writing one ledger collide.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  dollars,
  loadEnv,
  modelFromEnv,
  studentHelper,
} from "../server/config";
import { examEpisode } from "../src/core/evaluation";
import { DEFAULT_SKILL } from "../src/core/skills";
import type { Arm, ExamRow, Workspace } from "../src/core/types";
loadEnv();
const args = process.argv.slice(2);
const i = args.indexOf("--out");
const source = args.find(
  (a, j) => !a.startsWith("--") && args[j - 1] !== "--out",
);
if (!source) throw new Error("Pass a study report.");
const out = i < 0 ? source.replace(/\.json$/, "-redo.json") : args[i + 1];
const report = JSON.parse(readFileSync(source, "utf8"));
const cap: number = report.config.cap;
const examTokenBudget: number = report.config.examTokenBudget;
type Redo = {
  condition: string;
  rows: ExamRow[];
  usage: Record<string, number | null>;
};
const redo: { source: string; startedAt: string; exams: Redo[] } = existsSync(
  out,
)
  ? JSON.parse(readFileSync(out, "utf8"))
  : { source, startedAt: new Date().toISOString(), exams: [] };
// Replays that errored again are replayed once more.
for (const x of redo.exams)
  x.rows = x.rows.filter((r) => r.terminal !== "error");
const save = () => writeFileSync(out, JSON.stringify(redo, null, 2));
const jobs = (
  report.exams as { condition: string; repetition: number; rows: ExamRow[] }[]
).flatMap((e) =>
  e.rows
    .filter((r) => r.terminal === "error")
    .filter(
      (r) =>
        !redo.exams.some(
          (x) =>
            x.condition === e.condition &&
            x.rows.some(
              (y) => y.seed === r.seed && y.studentId === r.studentId,
            ),
        ),
    )
    .map((r) => ({ condition: e.condition, repetition: e.repetition, row: r })),
);
console.log(
  `${jobs.length} errored games to replay, cap ${cap}. Saving to ${out}`,
);
save();
await Promise.all(
  jobs.map(async ({ condition, repetition, row }) => {
    const arm = condition.split(":")[0] as Arm;
    const training = report.training.find(
      (t: { arm: Arm; repetition: number }) =>
        t.arm === arm && t.repetition === repetition,
    );
    const student = training.workspaces.find(
      (s: { id: string }) => s.id === row.studentId,
    ) as { id: string; name: string; workspace: Workspace };
    // Same condition definitions as scripts/evaluate.ts.
    const workspace =
      condition === "classroom:lessons-only"
        ? { ...student.workspace, skill: { ...DEFAULT_SKILL } }
        : student.workspace;
    const policy = modelFromEnv({
      tokenBudget: examTokenBudget,
      allowSkill:
        condition === "classroom:no-skill-tool" ? false : studentHelper(),
    });
    if (!policy) throw new Error("Set MODEL_API_KEY in .env.");
    const result = await examEpisode(
      policy,
      workspace,
      row.seed,
      cap,
      student,
      arm,
    );
    delete result.trajectory;
    const usage = policy.usage();
    let record = redo.exams.find((x) => x.condition === condition);
    if (!record) redo.exams.push((record = { condition, rows: [], usage: {} }));
    record.rows.push({ ...result, repetition });
    for (const [k, v] of Object.entries(usage))
      record.usage[k] = ((record.usage[k] as number) ?? 0) + v;
    record.usage.dollars = dollars(record.usage as never);
    save();
    console.log(
      `${condition} ${student.name}: score ${result.score}, ${result.moves} moves, ${result.terminal}${result.error ? ` (${result.error})` : ""}`,
    );
  }),
);
