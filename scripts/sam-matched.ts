import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  modelFromEnv,
  keysFromEnv,
  prices,
  loadEnv,
  studentHelper,
  modelId,
} from "../server/config";
import { budgetedKeyPool } from "../server/keys";
import { DEV_SEEDS } from "../src/core/evaluation";
import type { Workspace, Decision } from "../src/core/types";
import {
  samJobs,
  runSamMatched,
  samSummary,
  type SamResult,
  type SamJob,
} from "./lib/sam-matched";

const frozen = JSON.parse(
  readFileSync(
    new URL("../tests/fixtures/sam-cloud-41683004809.json", import.meta.url),
    "utf8",
  ),
) as {
  sourceRun: string;
  seeds: number[];
  workspace: Workspace;
};
if (
  frozen.seeds.length !== 4 ||
  new Set(frozen.seeds).size !== 4 ||
  frozen.seeds.some((s) => DEV_SEEDS.includes(s))
)
  throw new Error("Expected four fresh unique seeds.");
const budget = Number(process.env.SAM_BUDGET_USD ?? "5");
if (!Number.isFinite(budget) || budget <= 0 || budget > 5)
  throw new Error("Sam test budget must be above $0 and at most $5.");
const jobs = samJobs(frozen.seeds);
const plan = {
  sourceRun: frozen.sourceRun,
  notebookHash: createHash("sha256")
    .update(JSON.stringify(frozen.workspace))
    .digest("hex"),
  seeds: frozen.seeds,
  repeats: 3,
  cap: 300,
  games: jobs.length,
  concurrency: 6,
  budgetUsd: budget,
  reasoning: "low",
  planner: true,
  teaching: false,
  maxHours: 4,
};
if (!process.argv.includes("--live"))
  console.log(JSON.stringify({ live: false, ...plan }, null, 2));
else {
  loadEnv();
  const root = "sam-results";
  mkdirSync(root, { recursive: true });
  const started = Date.now(),
    deadline = started + 4 * 60 * 60 * 1000;
  const results: SamResult[] = [];
  const decisions = new Map<string, Decision[]>();
  const key = (job: SamJob) => `${job.condition}-${job.seed}-${job.repeat}`;
  let stopped = false,
    failure: string | undefined;
  const stop = () => {
    stopped = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const pool = keysFromEnv(),
    rates = prices();
  const initialSpend = pool?.status().reduce((n, k) => n + k.spentUsd, 0) ?? 0;
  const spent = () =>
    (pool?.status().reduce((n, k) => n + k.spentUsd, 0) ?? initialSpend) -
    initialSpend;
  let policy: ReturnType<typeof modelFromEnv> = null;
  try {
    if (!pool || !rates)
      throw new Error("MODEL_API_KEY and token prices are required.");
    if (!studentHelper())
      throw new Error("The matched comparison requires the planner enabled.");
    writeFileSync(
      `${root}/frozen-notebook.json`,
      JSON.stringify(frozen, null, 2),
    );
    writeFileSync(
      `${root}/plan.json`,
      JSON.stringify(
        {
          ...plan,
          model: modelId(),
          codeCommit: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          workflowRun: process.env.GITHUB_RUN_ID ?? null,
          jobs,
        },
        null,
        2,
      ),
    );
    policy = modelFromEnv({
      keys: budgetedKeyPool(pool, rates, budget),
      tokenBudget: 75000000,
      allowSkill: true,
      compactContext: true,
      reasoningEffort: "low",
      studentReasoningEffort: "low",
      beforeRequest: () => {
        if (stopped || Date.now() >= deadline)
          throw new Error("Sam test stopped or reached its four-hour limit.");
      },
    });
    if (!policy) throw new Error("No Muse policy available.");
    await runSamMatched(policy, frozen.workspace, jobs, 300, {
      stopped: () => stopped,
      decision(job, decision, move) {
        const id = key(job),
          traces = decisions.get(id) ?? [];
        traces.push(decision);
        decisions.set(id, traces);
        if (move % 50 === 0)
          writeFileSync(`${root}/${id}-decisions.json`, JSON.stringify(traces));
        if (move % 25 === 0)
          console.log(
            `${id}: ${move}/300 moves | ${results.length}/24 games saved | $${spent().toFixed(3)} / $${budget}`,
          );
      },
      saved(result) {
        const id = key(result);
        writeFileSync(
          `${root}/${id}-decisions.json`,
          JSON.stringify(decisions.get(id) ?? []),
        );
        writeFileSync(`${root}/${id}.json`, JSON.stringify(result));
        decisions.delete(id);
        results.push(result);
        console.log(
          `Saved ${id}: ${result.row.score} points, ${result.row.moves} moves, ${result.row.terminal}`,
        );
      },
    });
  } catch (error) {
    failure = error instanceof Error ? error.message : "Matched test failed";
    console.error(failure);
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    const summary = samSummary(results);
    const status = failure
      ? "error"
      : results.length === jobs.length
        ? "complete"
        : "stopped";
    writeFileSync(
      `${root}/results.json`,
      JSON.stringify(
        {
          ...plan,
          status,
          failure,
          spentUsd: spent(),
          elapsedMinutes: (Date.now() - started) / 60000,
          diagnostics: policy?.diagnostics?.(),
          summary,
          results,
        },
        null,
        2,
      ),
    );
    const markdown = [
      `# Sam: frozen notebook versus empty notebook`,
      "",
      `Status: ${status}`,
      `Saved games: ${results.length}/${jobs.length}; complete matched pairs: ${summary.pairs}/12`,
      `Estimated Muse spend: $${spent().toFixed(3)} / $${budget}`,
      `Trained mean: ${summary.trainedMean ?? "unavailable"}; empty mean: ${summary.emptyMean ?? "unavailable"}`,
      `Paired score change (trained minus empty): ${summary.meanDelta ?? "unavailable"}`,
      failure ? `Error: ${failure}` : "",
      "",
      summary.note,
      "",
      "Only complete pairs contribute to the averages. Inspect missing/error games before interpreting partial results.",
      "",
    ].join("\n");
    writeFileSync(`${root}/SUMMARY.md`, markdown);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    console.log(markdown);
  }
}
