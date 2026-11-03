// Dry-run by default. --live explicitly authorizes paid calls within one shared budget.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { initialState } from "../src/core/classroom";
import { DEV_SEEDS, examEpisode } from "../src/core/evaluation";
import { mapConcurrent } from "../src/core/concurrency";
import { simulationPolicy } from "../src/core/policy";
import type { LabState, ExamRow, RequestDiagnostics } from "../src/core/types";
import { loadEnv, keysFromEnv, prices, modelFromEnv } from "../server/config";
import { budgetedKeyPool } from "../server/keys";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith("--"))
    throw new Error(`--${name} needs a value.`);
  return args[i + 1];
};
const integer = (name: string, fallback: number, max: number) => {
  const n = Number(arg(name, String(fallback)));
  if (!Number.isInteger(n) || n < 1 || n > max)
    throw new Error(`--${name} must be 1..${max}.`);
  return n;
};
const live = args.includes("--live"),
  simulation = args.includes("--simulation");
if (live && simulation) throw new Error("Choose --live or --simulation.");
const cap = integer("moves", 10, 1500),
  seeds = integer("seeds", 3, DEV_SEEDS.length),
  repeats = integer("repeats", 2, 10);
const workers = arg("workers", "3,6").split(",").map(Number);
if (
  !workers.length ||
  workers.some((n) => !Number.isInteger(n) || n < 1 || n > 6)
)
  throw new Error("--workers must be a comma list of 1..6.");
const efforts = arg("efforts", "low,minimal").split(",");
if (!efforts.length || efforts.some((e) => !["low", "minimal"].includes(e)))
  throw new Error("--efforts must use low and/or minimal.");
const budgetUsd = Number(arg("budget", "0.25"));
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 1)
  throw new Error("--budget must be greater than 0 and at most $1.");
const source = arg("source", "");
const saved = source ? JSON.parse(readFileSync(source, "utf8")) : undefined;
const state: LabState = saved?.state ?? saved ?? initialState("model");
const students = args.includes("--all-students")
  ? state.students
  : state.students.slice(0, 1);
if (!students.length) throw new Error("No students in source.");
const tasks = Array.from({ length: repeats }, (_, repetition) =>
  DEV_SEEDS.slice(0, seeds).flatMap((seed) =>
    students.map((student) => ({ repetition, seed, student })),
  ),
).flat();
// Reverse worker order on alternating effort levels to reduce simple order effects.
const cases = efforts.flatMap((effort, i) =>
  (i % 2 ? [...workers].reverse() : workers).map((concurrency) => ({
    effort,
    concurrency,
  })),
);
const plan = {
  mode: live ? "live" : simulation ? "simulation" : "dry-run",
  source: source || "untrained notes",
  cap,
  seeds,
  repeats,
  students: students.map((s) => s.name),
  cases,
  maxDecisions: tasks.length * cap * cases.length,
  budgetUsd,
};
console.log(JSON.stringify(plan, null, 2));
if (!live && !simulation) {
  console.log(
    "No calls made. Add --live to spend within this shared budget, or --simulation for a free workflow check.",
  );
} else {
  loadEnv();
  if (live) {
    let active = false;
    try {
      const r = await fetch("http://127.0.0.1:8787/api/state?mode=model", {
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) {
        const s = await r.json();
        active = s.busy || s.liveBatch?.status === "running";
      }
    } catch {
      /* Backend may be offline; CLI still works. */
    }
    if (active)
      throw new Error(
        "Stop the backend's live session before benchmarking; rate limits and spend are shared.",
      );
  }
  const pool = live ? keysFromEnv() : null,
    rates = live ? prices() : null;
  if (live && (!pool || !rates))
    throw new Error(
      "Live benchmarks need an API key and token prices in .env.",
    );
  const budget = pool && rates ? budgetedKeyPool(pool, rates, budgetUsd) : null;
  const before = pool?.status().reduce((n, k) => n + k.spentUsd, 0) ?? 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.on("SIGINT", stop);
  const report = {
    plan,
    note: "Latency pilot on fixed notes, not evidence of learning. Reasoning effort can change moves and scores. Repeat on fresh seeds before choosing a setting. Request-time sums overlap under concurrency. Simulation timings do not predict Muse latency.",
    startedAt: new Date().toISOString(),
    spentUsd: 0,
    results: [] as {
      effort: string;
      concurrency: number;
      elapsedMs: number;
      rows: ExamRow[];
      diagnostics?: RequestDiagnostics;
      usage?: unknown;
      summary?: {
        meanScore: number;
        invalidMoves: number;
        errors: number;
        medianDecisionMs: number | null;
        p95DecisionMs: number | null;
        completedCallsPerMinute: number;
      };
    }[],
  };
  const out = arg("out", `data/muse-benchmark-${Date.now()}.json`);
  mkdirSync(dirname(out), { recursive: true });
  const save = () => {
    report.spentUsd =
      (pool?.status().reduce((n, k) => n + k.spentUsd, 0) ?? 0) - before;
    writeFileSync(out, JSON.stringify(report, null, 2));
  };
  try {
    save();
    for (const setup of cases) {
      if (stopped) break;
      const policy = live
        ? modelFromEnv({
            keys: budget!,
            reasoningEffort: setup.effort,
            tokenBudget: 15000000,
            beforeRequest: () => {
              if (stopped) throw new Error("Benchmark stopped.");
            },
          })!
        : simulationPolicy();
      const result: (typeof report.results)[number] = {
        ...setup,
        elapsedMs: 0,
        rows: [],
      };
      report.results.push(result);
      const started = performance.now();
      await mapConcurrent(
        tasks,
        setup.concurrency,
        async ({ seed, student, repetition }) => {
          const row = await examEpisode(
            policy,
            structuredClone(student.workspace),
            seed,
            cap,
            student,
            state.arm,
          );
          row.repetition = repetition;
          result.rows.push(row);
          result.rows.sort(
            (a, b) =>
              a.repetition! - b.repetition! ||
              a.seed - b.seed ||
              a.studentId.localeCompare(b.studentId),
          );
          result.elapsedMs = performance.now() - started;
          result.diagnostics = policy.diagnostics?.();
          result.usage =
            "usage" in policy && typeof policy.usage === "function"
              ? policy.usage()
              : undefined;
          if (row.terminal === "error") stopped = true;
          save();
        },
        () => stopped,
      );
      result.elapsedMs = performance.now() - started;
      const latencies = result.rows
        .flatMap((row) => row.latencyMs ?? [])
        .sort((a, b) => a - b);
      result.summary = {
        meanScore: result.rows.length
          ? result.rows.reduce((n, row) => n + row.score, 0) /
            result.rows.length
          : 0,
        invalidMoves: result.rows.reduce((n, row) => n + (row.invalid ?? 0), 0),
        errors: result.rows.filter((row) => row.terminal === "error").length,
        medianDecisionMs: latencies.length
          ? latencies[Math.floor((latencies.length - 1) * 0.5)]
          : null,
        p95DecisionMs: latencies.length
          ? latencies[Math.floor((latencies.length - 1) * 0.95)]
          : null,
        completedCallsPerMinute:
          result.elapsedMs > 0
            ? ((result.diagnostics?.completed ?? 0) * 60000) / result.elapsedMs
            : 0,
      };
      console.log(
        `${setup.effort}, ${setup.concurrency} workers: ${(result.elapsedMs / 1000).toFixed(1)}s, ${result.rows.length}/${tasks.length} games, ${result.rows.filter((r) => r.terminal === "error").length} errors`,
      );
      save();
    }
  } finally {
    process.off("SIGINT", stop);
    save();
    console.log(
      `Saved ${out}; estimated additional spend $${report.spentUsd.toFixed(4)}.`,
    );
  }
}
