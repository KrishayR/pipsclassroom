// npm run live-full-game -- <batch final.json> [--seeds 2] [--cap 3000] [--out file] [--resume]
// Live Muse plays whole games with each student's saved notes and with untrained notes,
// on the same fresh seeds, all games in parallel. Paid: about 1,000-1,500 calls per game.
// Each finished game is saved at once; --resume skips finished games.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dollars, loadEnv, modelFromEnv, modelId } from "../server/config";
import { examEpisode, pairedContrast } from "../src/core/evaluation";
import { emptyWorkspace } from "../src/core/skills";
import type { Arm, ExamRow, Workspace } from "../src/core/types";
import { FULL_GAME_SEEDS } from "./lib/full-game-check";
loadEnv();
const args = process.argv.slice(2);
const at = (key: string) => {
  const i = args.indexOf(`--${key}`);
  return i < 0 ? undefined : args[i + 1];
};
const file = args.find(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);
if (!file) throw new Error("Pass a batch final.json.");
const seeds = Number(at("seeds") ?? 2),
  cap = Number(at("cap") ?? 3000);
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10)
  throw new Error("--seeds must be 1..10.");
if (!Number.isInteger(cap) || cap < 1 || cap > 5000)
  throw new Error("--cap must be 1..5000.");
const out = at("out") ?? `data/live-full-game-${Date.now()}.json`;
const data = JSON.parse(readFileSync(file, "utf8"));
const state = data.state ?? data;
const arm: Arm = state.arm ?? "classroom";
const students: { id: string; name: string; workspace: Workspace }[] =
  state.students.filter(
    (s: { workspace: Workspace }) => s.workspace.lessons.length,
  );
if (!students.length) throw new Error("No student has a saved lesson.");
const report =
  args.includes("--resume") && existsSync(out)
    ? JSON.parse(readFileSync(out, "utf8"))
    : {
        source: file,
        model: modelId(),
        seeds,
        cap,
        note: "Live Muse, one game per student, seed and condition. Same seed means the same random tile stream; boards diverge after the first different move. A handful of games is an illustration, not evidence.",
        startedAt: new Date().toISOString(),
        completedAt: null as string | null,
        games: [] as (ExamRow & {
          condition: string;
          dollars: number | null;
        })[],
      };
const save = () => writeFileSync(out, JSON.stringify(report, null, 2));
const done = new Set(
  report.games.map(
    (g: ExamRow & { condition: string }) =>
      `${g.condition}:${g.studentId}:${g.seed}`,
  ),
);
const jobs = FULL_GAME_SEEDS.slice(0, seeds).flatMap((seed) =>
  students.flatMap((s) =>
    (["lessons", "untrained"] as const).map((condition) => ({
      seed,
      s,
      condition,
    })),
  ),
);
const todo = jobs.filter(
  (j) => !done.has(`${j.condition}:${j.s.id}:${j.seed}`),
);
console.log(
  `${todo.length} of ${jobs.length} games to play, cap ${cap} moves. Saving to ${out}`,
);
save();
const progress = new Map<string, number>();
const timer = setInterval(() => {
  console.log(
    `${new Date().toLocaleTimeString()} · ${[...progress].map(([k, n]) => `${k} ${n}`).join(" · ")}`,
  );
}, 300000);
await Promise.all(
  todo.map(async ({ seed, s, condition }) => {
    // A fresh provider per game, so each game's cost is its own.
    const policy = modelFromEnv({ tokenBudget: 100000000 });
    if (!policy) throw new Error("Set MODEL_API_KEY in .env.");
    const key = `${s.name}/${condition}/${seed % 1000}`;
    const workspace = condition === "lessons" ? s.workspace : emptyWorkspace();
    const row = await examEpisode(
      policy,
      workspace,
      seed,
      cap,
      s,
      arm,
      (_, n) => progress.set(key, n),
    );
    delete row.trajectory;
    const usage = policy.usage?.();
    report.games.push({
      ...row,
      latencyMs: undefined,
      condition,
      dollars: usage && "promptTokens" in usage ? dollars(usage) : null,
    });
    progress.delete(key);
    save();
    console.log(
      `${key}: score ${row.score}, highest ${row.highest}, ${row.moves} moves, ${row.terminal}${row.error ? ` (${row.error})` : ""}`,
    );
  }),
);
clearInterval(timer);
const games = report.games as (ExamRow & { condition: string })[];
const contrast = pairedContrast(
  games.filter((g) => g.condition === "lessons" && !g.error),
  games.filter((g) => g.condition === "untrained" && !g.error),
);
report.contrast = contrast;
report.completedAt = new Date().toISOString();
save();
for (const s of students)
  for (const seed of FULL_GAME_SEEDS.slice(0, seeds)) {
    const g = (c: string) =>
      games.find(
        (x) => x.condition === c && x.studentId === s.id && x.seed === seed,
      );
    console.log(
      `${s.name}, seed ${seed % 1000}: with lesson ${g("lessons")?.score} · without ${g("untrained")?.score}`,
    );
  }
const cost = report.games.reduce(
  (t: number, g: { dollars: number | null }) => t + (g.dollars ?? 0),
  0,
);
console.log(
  `With lessons − without: ${contrast.meanDiff >= 0 ? "+" : ""}${contrast.meanDiff.toFixed(0)} points, 95% CI [${contrast.ci95.map((v) => v?.toFixed(0)).join(", ")}], ${contrast.pairs} pairs · $${cost.toFixed(2)}`,
);
