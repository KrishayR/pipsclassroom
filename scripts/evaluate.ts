import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { Classroom, initialState } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import { modelPolicy } from "../server/model";
import {
  createGame,
  hash,
  ENGINE_VERSION,
  RNG_VERSION,
} from "../src/core/engine";
import { examEpisode, EXAM_SEEDS, summarize } from "../src/core/evaluation";
import { DEFAULT_SKILL, emptyWorkspace } from "../src/core/skills";
import type { Arm, Mode, Policy, Workspace, ExamRow } from "../src/core/types";
const args = process.argv.slice(2);
const arg = (key: string, fallback: string) => {
  const index = args.indexOf(`--${key}`);
  return index < 0 ? fallback : args[index + 1];
};
const integer = (key: string, fallback: number, min: number, max: number) => {
  const n = Number(arg(key, String(fallback)));
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`--${key} must be ${min}..${max}`);
  return n;
};
const mode = arg("mode", "simulation") as Mode;
if (!["simulation", "model"].includes(mode))
  throw new Error("Mode must be simulation or model.");
const repetitions = integer("repetitions", 1, 1, 10),
  seeds = integer("seeds", 3, 1, 6),
  cap = integer("cap", 1500, 1, 5000),
  trainingMoves = integer("training-moves", 24, 1, 100),
  trainingRounds = integer("training-rounds", 1, 0, 5),
  simulationBudget = integer("simulation-budget", 30000, 1000, 1000000),
  tokenBudget = integer("token-budget", 100000, 1000, 10000000);
if (existsSync(".env"))
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
function provider(): Policy {
  if (mode === "simulation") return simulationPolicy();
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error("Set MODEL_API_KEY in .env for model evaluation.");
  return modelPolicy({
    key,
    baseUrl: process.env.MODEL_BASE_URL ?? "https://api.meta.ai/v1",
    model: process.env.MODEL_ID ?? "muse-spark-1.3",
    tokenBudget,
  });
}
const out = arg("out", `data/evaluation-${Date.now()}.json`);
mkdirSync(out.slice(0, out.lastIndexOf("/")) || ".", { recursive: true });
const report = {
  schemaVersion: 1,
  mode,
  engine: ENGINE_VERSION,
  rng: RNG_VERSION,
  config: {
    repetitions,
    seeds,
    cap,
    trainingMoves,
    trainingRounds,
    simulationBudget,
    tokenBudget,
    model: mode === "model" ? (process.env.MODEL_ID ?? "muse-spark-1.3") : null,
  },
  notes: [
    "All results include failures. No positive gain is assumed.",
    "Simulation uses a shared base heuristic; peer evidence can alter candidate parameters. This tests the mechanism, not LLM social learning.",
    "Equal training ceilings; actual consumption is reported. Stopping mid-verification leaves memory unchanged.",
    "Exam model budgets are fresh and equal per arm/repetition.",
    "Seed pairing is by random stream, not identical board states after diverging moves.",
    "Ablations reuse frozen learned workspaces, without retraining.",
    "One repetition is exploratory; multiple games do not constitute independent training repetitions.",
  ],
  runs: [] as unknown[],
};
for (let repetition = 0; repetition < repetitions; repetition++)
  for (const arm of ["solo", "teacher", "classroom"] as Arm[]) {
    let simulationUsed = 0;
    const base = provider();
    const bounded: Policy = {
      ...base,
      decide: async (...params) => {
        if (simulationUsed + 96 > simulationBudget)
          throw new Error("Training simulation ceiling reached.");
        const d = await base.decide(...params);
        simulationUsed += d.simulations;
        return d;
      },
    };
    const state = initialState(mode);
    state.arm = arm;
    state.trainingRound = repetition * 100;
    state.students.forEach((s, i) => {
      s.episodeId = `practice:rep-${repetition}:student-${i}`;
      s.game = createGame(hash(s.episodeId));
    });
    const lab = new Classroom(bounded, state);
    let trainingError: string | undefined;
    console.log(`Training ${arm}, repetition ${repetition + 1} (${mode})`);
    try {
      await lab.practice(trainingMoves);
      for (let round = 0; round < trainingRounds; round++) {
        await lab.review(lab.state.students[round % 3].id);
        await lab.verify();
      }
      // Spend remaining permitted compute on practice. This is a ceiling match, not a promise of equal tokens.
      while (
        simulationUsed + 3 * 96 <= simulationBudget &&
        lab.state.calls < 2000
      ) {
        await lab.practice(1);
      }
    } catch (e) {
      trainingError = e instanceof Error ? e.message : String(e);
    }
    const frozen = structuredClone(
      lab.state.students.map((s) => ({
        id: s.id,
        name: s.name,
        workspace: s.workspace,
      })),
    );
    const examPolicy = provider();
    const rows: ExamRow[] = [];
    for (const seed of EXAM_SEEDS.slice(0, seeds))
      for (const student of frozen)
        rows.push(
          await examEpisode(
            examPolicy,
            student.workspace,
            seed,
            cap,
            student,
            arm,
          ),
        );
    const ablations: {
      condition: string;
      rows: ExamRow[];
      summary: ReturnType<typeof summarize>;
    }[] = [];
    if (arm === "classroom")
      for (const condition of ["no-learned-workspace", "lessons-only"]) {
        const ablationPolicy = provider();
        const ablationRows: ExamRow[] = [];
        for (const seed of EXAM_SEEDS.slice(0, seeds))
          for (const student of frozen) {
            const workspace: Workspace =
              condition === "no-learned-workspace"
                ? emptyWorkspace()
                : { ...student.workspace, skill: { ...DEFAULT_SKILL } };
            ablationRows.push(
              await examEpisode(
                ablationPolicy,
                workspace,
                seed,
                cap,
                student,
                arm,
              ),
            );
          }
        ablations.push({
          condition,
          rows: ablationRows,
          summary: summarize(ablationRows, cap),
        });
      }
    const usage =
      "usage" in base
        ? (base as ReturnType<typeof modelPolicy>).usage()
        : { tokens: lab.state.tokens, calls: lab.state.calls };
    report.runs.push({
      repetition,
      arm,
      training: {
        ...usage,
        simulations: simulationUsed,
        error: trainingError,
        ledger: lab.state.ledger,
        workspaces: frozen,
      },
      rows,
      summary: summarize(rows, cap),
      ablations,
    });
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(
      `${arm}: ${summarize(rows, cap).successes}/${rows.length} reached 2048; report saved to ${out}`,
    );
  }
