import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { ARMS, Classroom, initialState } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import {
  keysFromEnv,
  studentHelper,
  loadEnv,
  modelFromEnv,
  modelId,
  protocolFromEnv,
  dollars,
  prices,
} from "../server/config";
import {
  createGame,
  hash,
  ENGINE_VERSION,
  RNG_VERSION,
} from "../src/core/engine";
import {
  DEV_SEEDS,
  examEpisode,
  pairedContrast,
  parseSealedSeeds,
  planningTarget,
  summarize,
} from "../src/core/evaluation";
import { DEFAULT_SKILL, emptyWorkspace } from "../src/core/skills";
import type { Arm, Mode, Policy, Workspace, ExamRow } from "../src/core/types";
loadEnv();
const args = process.argv.slice(2);
const arg = (key: string, fallback: string) => {
  const index = args.indexOf(`--${key}`);
  return index < 0 ? fallback : args[index + 1];
};
const flag = (key: string) => args.includes(`--${key}`);
const integer = (key: string, fallback: number, min: number, max: number) => {
  const n = Number(arg(key, String(fallback)));
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`--${key} must be ${min}..${max}`);
  return n;
};
const mode = arg("mode", "simulation") as Mode;
if (!["simulation", "model"].includes(mode))
  throw new Error("Mode must be simulation or model.");
const split = arg("split", "dev");
if (!["dev", "exam"].includes(split))
  throw new Error("--split must be dev or exam.");
// Final exams read seeds generated outside source control (npm run seal-seeds).
const sealedPath = arg("exam-seeds", "data/sealed-exam-seeds.json");
const sealedText = split === "exam" ? readFileSync(sealedPath, "utf8") : null;
const seedPool = sealedText
  ? parseSealedSeeds(JSON.parse(sealedText))
  : DEV_SEEDS;
const arms = arg("arms", ARMS.join(",")).split(",") as Arm[];
if (!arms.length || arms.some((a) => !ARMS.includes(a)))
  throw new Error(`--arms must be a comma list of ${ARMS.join(", ")}`);
const protocol = protocolFromEnv(mode);
const repetitions = integer("repetitions", 1, 1, 10),
  seeds = integer("seeds", 3, 1, seedPool.length),
  // The plan's model cap is 150 valid moves; simulation keeps full-length games.
  cap = integer("cap", mode === "model" ? 150 : 1500, 1, 5000),
  trainingMoves = integer("training-moves", 24, 1, 100),
  trainingRounds = integer("training-rounds", 1, 0, 9),
  simulationBudget = integer("simulation-budget", 30000, 1000, 1000000),
  tokenBudget = integer("token-budget", 100000, 1000, 10000000),
  examTokenBudget = integer("exam-token-budget", 30000000, 1000, 100000000),
  concurrency = integer("concurrency", mode === "model" ? 16 : 1, 1, 64),
  ablationReps = integer("ablation-reps", 1, 0, 10),
  verify = {
    practice: integer("verify-practice", protocol.verify.practice, 1, 12),
    regression: integer("verify-regression", protocol.verify.regression, 0, 6),
    moves: integer("verify-moves", protocol.verify.moves, 1, 16),
  },
  exerciseMoves = integer("exercise-moves", protocol.exerciseMoves, 0, 12);
const examSeeds = seedPool.slice(0, seeds);
type Usage = {
  tokens: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
};
type Provider = Policy & { usage?: () => Usage };
const zero = (): Usage => ({
  tokens: 0,
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  cachedTokens: 0,
});
function provider(budget: number, allowSkill = studentHelper()): Provider {
  if (mode === "simulation") return simulationPolicy();
  const p = modelFromEnv({ tokenBudget: budget, allowSkill });
  if (!p) throw new Error("Set MODEL_API_KEY in .env for model evaluation.");
  return p;
}
const usageOf = (p: Provider) => p.usage?.() ?? zero();
// Freeze record: a hash of the code that defines agents, gates and scoring.
const sourceFiles = ["src/core", "server", "scripts"]
  .flatMap((dir) => readdirSync(dir).map((f) => `${dir}/${f}`))
  .filter((f) => f.endsWith(".ts"))
  .sort();
const codeSha256 = createHash("sha256")
  .update(sourceFiles.map((f) => `${f}\n${readFileSync(f, "utf8")}`).join("\n"))
  .digest("hex");
const git = (() => {
  try {
    return {
      commit: execSync("git rev-parse HEAD").toString().trim(),
      dirty: execSync("git status --porcelain").toString().trim().length > 0,
    };
  } catch {
    return null;
  }
})();
const out = arg("out", `data/evaluation-${Date.now()}.json`);
mkdirSync(out.slice(0, out.lastIndexOf("/")) || ".", { recursive: true });
const config = {
  arms,
  repetitions,
  split,
  seeds,
  sealedSeedSha256: sealedText
    ? createHash("sha256").update(sealedText).digest("hex")
    : null,
  cap,
  trainingMoves,
  trainingRounds,
  simulationBudget,
  tokenBudget,
  examTokenBudget,
  ablationReps,
  verify,
  exerciseMoves,
  model: mode === "model" ? modelId() : null,
  reasoningEffort:
    mode === "model" ? process.env.MODEL_REASONING_EFFORT || "low" : null,
  prices: prices(),
  codeSha256,
};
interface TrainingRecord {
  repetition: number;
  arm: Arm;
  tokens: number;
  calls: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  dollars: number | null;
  simulations: number;
  error?: string;
  focusChoices: string[];
  ledger: unknown[];
  workspaces: { id: string; name: string; workspace: Workspace }[];
}
interface ExamRecord {
  repetition: number;
  // An arm, "baseline", or "classroom:<ablation>".
  condition: string;
  rows: ExamRow[];
  usage: Usage & { dollars: number | null };
}
const fresh = {
  schemaVersion: 3,
  mode,
  engine: ENGINE_VERSION,
  rng: RNG_VERSION,
  config,
  git,
  notes: [
    "All results include failures. No positive gain is assumed.",
    "Primary outcome: mean exam score under the fixed move cap (PROTOCOL.md).",
    "Simulation uses a shared base heuristic; peer evidence can alter candidate parameters. This tests the mechanism, not LLM social learning.",
    "Equal training ceilings; actual consumption is reported. Leftover allowance is spent on extra practice.",
    "Each exam condition has a fresh provider with an equal budget.",
    "Seed pairing is by random stream, not identical board states after diverging moves.",
    "The untrained baseline does not depend on training, so it runs once and is paired with every repetition.",
    "Ablations reuse frozen classroom workspaces, without retraining, in the first --ablation-reps repetitions.",
    "Fewer than two repetitions is exploratory; games from one memory version are not independent training repetitions.",
  ],
  startedAt: new Date().toISOString(),
  completedAt: null as string | null,
  training: [] as TrainingRecord[],
  exams: [] as ExamRecord[],
  keys: [] as unknown[],
  summaries: {} as Record<string, unknown>,
  contrasts: {} as Record<string, unknown>,
  efficiency: {} as Record<string, unknown>,
};
// --resume continues an interrupted run with the same frozen code and configuration.
const report: typeof fresh =
  flag("resume") && existsSync(out)
    ? JSON.parse(readFileSync(out, "utf8"))
    : fresh;
if (report !== fresh) {
  if (JSON.stringify(report.config) !== JSON.stringify(config))
    throw new Error(
      "--resume needs the same code, seeds and configuration as the original run.",
    );
  report.completedAt = null;
  console.log(`Resuming ${out}`);
}
const save = () => {
  writeFileSync(`${out}.tmp`, JSON.stringify(report, null, 2));
  renameSync(`${out}.tmp`, out);
};
process.on("SIGINT", () => {
  save();
  console.log(`\nStopped; progress saved. Continue with --resume.`);
  process.exit(130);
});
const names = [
  { id: "student-1", name: "Ada" },
  { id: "student-2", name: "Lin" },
  { id: "student-3", name: "Sam" },
];
async function train(arm: Arm, repetition: number): Promise<TrainingRecord> {
  let simulationUsed = 0;
  const base = provider(tokenBudget);
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
  const lab = new Classroom(bounded, state, { verify, exerciseMoves });
  let error: string | undefined;
  console.log(`Training ${arm}, repetition ${repetition + 1} (${mode})`);
  try {
    await lab.practice(trainingMoves);
    for (let round = 0; round < trainingRounds; round++) {
      await lab.review(lab.state.students[round % 3].id);
      await lab.verify();
    }
    // Spend remaining permitted compute on practice: a ceiling match, not equal tokens.
    let lastRound = 0;
    while (
      simulationUsed + 3 * 96 <= simulationBudget &&
      lab.state.calls < 2000 &&
      usageOf(base).tokens + 1.5 * lastRound <= tokenBudget
    ) {
      const before = usageOf(base).tokens;
      await lab.practice(1);
      lastRound = usageOf(base).tokens - before;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const usage =
    mode === "model"
      ? usageOf(base)
      : { tokens: lab.state.tokens, calls: lab.state.calls };
  console.log(
    `Trained ${arm}, repetition ${repetition + 1}: ${lab.state.ledger.filter((l) => l.status === "verified").length} lessons kept, ${lab.state.ledger.filter((l) => l.status === "rejected").length} rejected${error ? `; stopped: ${error}` : ""}`,
  );
  return {
    repetition,
    arm,
    ...usage,
    dollars: "promptTokens" in usage ? dollars(usage) : null,
    simulations: simulationUsed,
    error,
    focusChoices: lab.state.messages
      .filter((m) => m.title.startsWith("Practice focus"))
      .map((m) => `${m.title} — ${m.text}`),
    ledger: lab.state.ledger,
    workspaces: structuredClone(
      lab.state.students.map((s) => ({
        id: s.id,
        name: s.name,
        workspace: s.workspace,
      })),
    ),
  };
}
// Phase 1: training for every arm and repetition in parallel; the rate limiter paces calls.
await Promise.all(
  Array.from({ length: repetitions }, (_, rep) => rep).flatMap((rep) =>
    arms
      .filter(
        (arm) =>
          !report.training.some((t) => t.repetition === rep && t.arm === arm),
      )
      .map(async (arm) => {
        report.training.push(await train(arm, rep));
        save();
      }),
  ),
);
// Phase 2: exam games, run concurrently. Each condition gets one fresh provider.
type Student = { id: string; name: string; workspace: Workspace };
const conditions: {
  repetition: number;
  condition: string;
  arm: Arm;
  allowSkill: boolean;
  workspaces: () => Student[];
}[] = [];
if (!flag("no-baseline"))
  conditions.push({
    repetition: 0,
    condition: "baseline",
    arm: "solo",
    allowSkill: studentHelper(),
    workspaces: () => names.map((s) => ({ ...s, workspace: emptyWorkspace() })),
  });
for (let rep = 0; rep < repetitions; rep++)
  for (const arm of arms) {
    const trained = () =>
      report.training.find((t) => t.repetition === rep && t.arm === arm)!
        .workspaces;
    conditions.push({
      repetition: rep,
      condition: arm,
      arm,
      allowSkill: studentHelper(),
      workspaces: trained,
    });
    if (arm === "classroom" && rep < ablationReps && !flag("no-ablations")) {
      conditions.push({
        repetition: rep,
        condition: "classroom:lessons-only",
        arm,
        allowSkill: studentHelper(),
        workspaces: () =>
          trained().map((s) => ({
            ...s,
            workspace: { ...s.workspace, skill: { ...DEFAULT_SKILL } },
          })),
      });
      // Does Muse itself use the lessons, or does the skill ranking do the work?
      if (mode === "model" && studentHelper())
        conditions.push({
          repetition: rep,
          condition: "classroom:no-skill-tool",
          arm,
          allowSkill: false,
          workspaces: trained,
        });
    }
  }
type Job = {
  record: ExamRecord;
  provider: Provider;
  student: Student;
  seed: number;
  arm: Arm;
};
const jobs: Job[] = [];
for (const c of conditions) {
  let record = report.exams.find(
    (e) => e.repetition === c.repetition && e.condition === c.condition,
  );
  if (!record) {
    record = {
      repetition: c.repetition,
      condition: c.condition,
      rows: [],
      usage: { ...zero(), dollars: null },
    };
    report.exams.push(record);
  }
  // Games that errored are run again on resume; their old rows are dropped.
  record.rows = record.rows.filter((r) => r.terminal !== "error");
  const p = provider(examTokenBudget, c.allowSkill);
  for (const seed of examSeeds)
    for (const student of c.workspaces())
      if (
        !record.rows.some((r) => r.seed === seed && r.studentId === student.id)
      )
        jobs.push({ record, provider: p, student, seed, arm: c.arm });
}
const started = Date.now();
let done = 0;
const accounted = new Map<Provider, Usage>();
const recordUsage = (j: Job) => {
  const now = usageOf(j.provider);
  const prev = accounted.get(j.provider) ?? zero();
  for (const k of Object.keys(now) as (keyof Usage)[])
    j.record.usage[k] += now[k] - prev[k];
  j.record.usage.dollars = dollars(j.record.usage);
  accounted.set(j.provider, now);
};
console.log(
  `Exams: ${jobs.length} games across ${conditions.length} conditions, ${concurrency} at a time`,
);
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const row = await examEpisode(
        j.provider,
        j.student.workspace,
        j.seed,
        cap,
        j.student,
        j.arm,
      );
      j.record.rows.push({ ...row, repetition: j.record.repetition });
      recordUsage(j);
      done++;
      save();
      if (done % 10 === 0 || done === jobs.length) {
        const elapsed = (Date.now() - started) / 60000;
        const spent = report.exams.reduce(
          (s, e) => s + (e.usage.dollars ?? 0),
          0,
        );
        console.log(
          `${done}/${jobs.length} games · ${elapsed.toFixed(0)} min · ETA ${((elapsed / done) * (jobs.length - done)).toFixed(0)} min · exam spend $${spent.toFixed(2)}`,
        );
      }
    }
  }),
);
// Analysis. The untrained baseline is paired with every repetition.
const rowsFor = (condition: string) =>
  condition === "baseline"
    ? Array.from({ length: repetitions }, (_, r) =>
        (report.exams.find((e) => e.condition === "baseline")?.rows ?? []).map(
          (row) => ({ ...row, repetition: r }),
        ),
      ).flat()
    : report.exams
        .filter((e) => e.condition === condition)
        .flatMap((e) => e.rows);
const contrast = (a: string, b: string) => {
  const treatment = rowsFor(a),
    baseline = rowsFor(b);
  if (!treatment.length || !baseline.length) return null;
  const c = pairedContrast(treatment, baseline);
  return {
    treatment: a,
    baseline: b,
    ...c,
    target: planningTarget(treatment, baseline, c),
  };
};
const allConditions = [...new Set(report.exams.map((e) => e.condition))];
report.summaries = Object.fromEntries(
  allConditions.map((c) => [
    c,
    {
      overall: summarize(
        report.exams.filter((e) => e.condition === c).flatMap((e) => e.rows),
        cap,
      ),
      byRepetition: report.exams
        .filter((e) => e.condition === c)
        .map((e) => ({ repetition: e.repetition, ...summarize(e.rows, cap) })),
    },
  ]),
);
report.contrasts = {
  // Primary MVP comparison (plan): full classroom vs teacher with adaptive practice.
  primary: contrast("classroom", "adaptive"),
  adaptation: contrast("adaptive", "teacher"),
  teacher: contrast("teacher", "solo"),
  classroomVsSolo: contrast("classroom", "solo"),
  ...Object.fromEntries(
    arms.map((a) => [`${a}VsUntrained`, contrast(a, "baseline")]),
  ),
};
// Ablations are paired with the classroom repetitions where they ran.
for (const ab of ["lessons-only", "no-skill-tool"]) {
  const ablated = rowsFor(`classroom:${ab}`);
  if (!ablated.length) continue;
  const reps = new Set(ablated.map((r) => r.repetition ?? 0));
  report.contrasts[`classroomVs:${ab}`] = {
    treatment: "classroom",
    baseline: `classroom:${ab}`,
    ...pairedContrast(
      rowsFor("classroom").filter((r) => reps.has(r.repetition ?? 0)),
      ablated,
    ),
  };
}
const baselineRows =
  report.exams.find((e) => e.condition === "baseline")?.rows ?? [];
const baselineMean = baselineRows.length
  ? summarize(baselineRows, cap).meanScore
  : null;
report.efficiency = Object.fromEntries(
  arms.map((arm) => {
    const runs = report.training.filter((r) => r.arm === arm);
    const tokens = runs.reduce((s, r) => s + r.tokens, 0);
    const sims = runs.reduce((s, r) => s + r.simulations, 0);
    const cost = runs.reduce((s, r) => s + (r.dollars ?? 0), 0);
    const gain =
      baselineMean === null
        ? null
        : summarize(rowsFor(arm), cap).meanScore - baselineMean;
    return [
      arm,
      {
        gainOverUntrained: gain,
        trainingTokens: tokens,
        trainingSimulations: sims,
        trainingDollars: prices() ? cost : null,
        gainPer1kTokens:
          gain !== null && tokens ? (gain * 1000) / tokens : null,
        gainPerDollar: gain !== null && prices() && cost ? gain / cost : null,
        gainPer1kSimulations:
          gain !== null && sims ? (gain * 1000) / sims : null,
      },
    ];
  }),
);
report.keys = mode === "model" ? (keysFromEnv()?.status() ?? []) : [];
report.completedAt = new Date().toISOString();
save();
for (const [c, s] of Object.entries(report.summaries)) {
  const o = (s as { overall: ReturnType<typeof summarize> }).overall;
  console.log(
    `${c}: mean ${o.meanScore.toFixed(0)}, median ${o.medianScore?.toFixed(0)}, n=${o.n}, cap hits ${o.truncated}, errors ${o.errors}`,
  );
}
const primary = report.contrasts.primary as ReturnType<typeof contrast>;
if (primary)
  console.log(
    `Primary (classroom − adaptive): ${primary.meanDiff.toFixed(1)} points, 95% CI [${primary.ci95.map((v) => v?.toFixed(1)).join(", ")}], ${primary.pairs} pairs, ${primary.clusters} repetitions; planning target ${primary.target.met ? "met" : "not met"}. ${primary.target.note}`,
  );
console.log(`Report: ${out}`);
