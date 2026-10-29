// Cost pilot (plan p.10): ~30 live moves plus one full teaching cycle, then a projection
// of the full study from measured usage. Makes paid model calls under a hard token cap.
import { mkdirSync, writeFileSync } from "node:fs";
import { Classroom, initialState, ARMS } from "../src/core/classroom";
import {
  loadEnv,
  modelFromEnv,
  modelId,
  protocolFromEnv,
  dollars,
  prices,
} from "../server/config";
loadEnv();
const args = process.argv.slice(2);
const at = (key: string, fallback: number) => {
  const i = args.indexOf(`--${key}`);
  const n = Number(i < 0 ? fallback : args[i + 1]);
  if (!Number.isFinite(n) || n < 0)
    throw new Error(`--${key} must be a number`);
  return n;
};
const steps = at("steps", 10),
  tokenBudget = at("token-budget", 150000);
const policy = modelFromEnv({ tokenBudget });
if (!policy) throw new Error("Set MODEL_API_KEY in .env first.");
const protocol = protocolFromEnv("model");
const lab = new Classroom(policy, initialState("model"), protocol);
lab.state.arm = "classroom";
const usage = () => policy.usage();
const delta = (a: ReturnType<typeof usage>, b: ReturnType<typeof usage>) => ({
  tokens: b.tokens - a.tokens,
  calls: b.calls - a.calls,
  promptTokens: b.promptTokens - a.promptTokens,
  completionTokens: b.completionTokens - a.completionTokens,
  cachedTokens: b.cachedTokens - a.cachedTokens,
  reasoningTokens: b.reasoningTokens - a.reasoningTokens,
});
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
let error: string | undefined;
const u0 = usage();
const t0 = Date.now();
try {
  console.log(`Practice: ${steps} steps × 3 students (${modelId()})`);
  await lab.practice(steps);
} catch (e) {
  error = (e as Error).message;
}
const u1 = usage();
const t1 = Date.now();
if (!error)
  try {
    console.log("Teaching cycle: focus choice, exercise, teacher, peer, plan");
    await lab.review(lab.state.students[0].id);
  } catch (e) {
    error = (e as Error).message;
  }
const u2 = usage();
const traces = lab.state.students.flatMap((s) => s.traces);
const practiceTraces = traces.filter((t) => !t.exercise);
const exerciseTraces = traces.filter((t) => t.exercise);
const perDecision = {
  decisions: traces.length,
  meanTokens: traces.length
    ? traces.reduce((s, t) => s + t.tokens, 0) / traces.length
    : null,
  meanCalls: traces.length
    ? traces.reduce((s, t) => s + t.calls, 0) / traces.length
    : null,
  p50Ms: quantile(
    traces.map((t) => t.durationMs),
    0.5,
  ),
  p95Ms: quantile(
    traces.map((t) => t.durationMs),
    0.95,
  ),
  invalidActions: traces.reduce((s, t) => s + (t.invalid ?? 0), 0),
  usedRunSkill: traces.filter((t) =>
    t.tools.some((x) => x.name === "run_skill"),
  ).length,
};
const review = delta(u1, u2);
const reviewOnly =
  review.tokens - exerciseTraces.reduce((s, t) => s + t.tokens, 0);
// Projection for the plan's study shape, from measured averages (upper bound: exam
// games are assumed to run to the cap, which is likely for a capable player).
const study = {
  arms: ARMS.length,
  repetitions: at("study-repetitions", 1),
  seeds: at("study-seeds", 12),
  cap: at("study-cap", 150),
  trainingMoves: at("study-training-moves", 24),
  trainingRounds: at("study-training-rounds", 3),
  ...protocol.verify,
  exerciseMoves: protocol.exerciseMoves,
};
const d = perDecision.meanTokens ?? 0;
const trainingDecisions =
  3 * study.trainingMoves +
  study.trainingRounds *
    (study.exerciseMoves +
      2 * (study.practice + study.regression) * study.moves);
const trainingTokens =
  trainingDecisions * d + study.trainingRounds * reviewOnly;
const examTokens = 3 * study.seeds * study.cap * d;
// Per repetition: every arm trains and sits the exam; plus untrained baseline and two
// classroom ablations (lessons-only, no-skill-tool).
const total =
  study.repetitions *
  (study.arms * (trainingTokens + examTokens) + 3 * examTokens);
const pilotUsage = delta(u0, u2);
const ratio = pilotUsage.tokens
  ? pilotUsage.completionTokens /
    Math.max(1, pilotUsage.promptTokens + pilotUsage.completionTokens)
  : 0;
const price = prices();
const toDollars = (tokens: number) =>
  price
    ? (tokens * (1 - ratio) * price.input + tokens * ratio * price.output) / 1e6
    : null;
const report = {
  model: modelId(),
  keys: policy.keyStatus(),
  reasoningEffort: process.env.MODEL_REASONING_EFFORT || "low",
  protocol,
  error,
  pilot: {
    usage: pilotUsage,
    dollars: dollars(pilotUsage),
    practice: {
      ...delta(u0, u1),
      moves: practiceTraces.length,
      seconds: (t1 - t0) / 1000,
    },
    teachingCycle: {
      ...review,
      exerciseMoves: exerciseTraces.length,
      reviewTokensExcludingExercise: reviewOnly,
    },
    perDecision,
    messages: lab.state.messages.map((m) => ({
      role: m.role,
      title: m.title,
      text: m.text,
    })),
    candidate: lab.state.candidate,
  },
  projection: {
    study,
    perArm: { trainingDecisions, trainingTokens, examTokens },
    totalTokens: total,
    totalDollars: toDollars(total),
    note: "Estimate from pilot averages. Training is also bounded by --token-budget per arm in npm run evaluate.",
  },
};
mkdirSync("data", { recursive: true });
const out = `data/pilot-${Date.now()}.json`;
writeFileSync(out, JSON.stringify(report, null, 2));
const k = (n: number) => `${(n / 1000).toFixed(1)}k`;
console.log(`
Pilot ${error ? `stopped: ${error}` : "complete"}  (${out})
  Practice moves: ${practiceTraces.length}, exercise moves: ${exerciseTraces.length}
  Tokens used: ${k(pilotUsage.tokens)} (prompt ${k(pilotUsage.promptTokens)}, completion ${k(pilotUsage.completionTokens)}, of which reasoning ${k(pilotUsage.reasoningTokens)})${report.pilot.dollars !== null ? ` ≈ $${report.pilot.dollars.toFixed(2)}` : ""}
  Per decision: ${k(d)} tokens, ${perDecision.meanCalls?.toFixed(2)} calls, p50 ${perDecision.p50Ms?.toFixed(0)} ms, p95 ${perDecision.p95Ms?.toFixed(0)} ms, ${perDecision.invalidActions} invalid actions, run_skill used in ${perDecision.usedRunSkill}/${traces.length}
  Teaching cycle (excluding exercise moves): ${k(reviewOnly)} tokens
Projected study (${study.arms} arms × ${study.repetitions} rep, ${study.seeds} seeds × 3 students, cap ${study.cap}):
  per arm: training ${k(trainingTokens)}, exam ${k(examTokens)}
  total: ${k(total)} tokens${report.projection.totalDollars !== null ? ` ≈ $${report.projection.totalDollars.toFixed(2)}` : " (set MODEL_PRICE_INPUT_PER_M / MODEL_PRICE_OUTPUT_PER_M for dollars)"}`);
for (const k of policy.keyStatus())
  console.log(
    `  ${k.label} (${k.fingerprint}): ${k.retired ?? (prices() ? `$${k.spentUsd.toFixed(2)} estimated` : `${((k.promptTokens + k.completionTokens) / 1000).toFixed(1)}k tokens logged`)}`,
  );
