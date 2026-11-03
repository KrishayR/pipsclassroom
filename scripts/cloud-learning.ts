// Dry-run by default. --live makes paid calls with the same five-hour profile as Settings.
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { liveBatchRunner } from "../server/batch";
import { loadEnv, apiKeys, studentHelper, modelId } from "../server/config";
import { classroomSummary } from "../src/archive";
import type { LabState } from "../src/core/types";

const root = "cloud-results";
const budgetUsd = Number(process.env.CLOUD_BUDGET_USD ?? "20");
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 20)
  throw new Error("Choose a budget above $0 and at most $20.");
const limits = {
  budgetUsd,
  examMoves: 300,
  examSeeds: 2,
  maxRuntimeMs: 5 * 60 * 60 * 1000,
  optimize: true,
  finalExamReserveMs: 45 * 60 * 1000,
};
if (!process.argv.includes("--live")) {
  console.log(
    JSON.stringify(
      { live: false, cycles: 100, kind: "classroom", limits },
      null,
      2,
    ),
  );
} else {
  mkdirSync(root, { recursive: true });
  loadEnv();
  const runner = liveBatchRunner(() => {}, { root });
  const stop = () => runner.stop("Stopped by signal; partial results saved");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let previous = "";
  const timer = setInterval(() => {
    const s = runner.status();
    if (!s) return;
    const line = `${s.stage} | ${s.completed} cycles | $${s.spentUsd.toFixed(3)} / $${s.budgetUsd} | ${runner.diagnostics()?.retrying ?? 0} requests waiting to retry`;
    if (line !== previous) console.log(line);
    previous = line;
  }, 15000);
  let failure: string | undefined;
  try {
    if (!apiKeys().length)
      throw new Error(
        "Add the MODEL_API_KEY repository secret before running this workflow.",
      );
    if (!studentHelper())
      throw new Error("The cloud learning test requires the planner enabled.");
    writeFileSync(
      `${root}/run-config.json`,
      JSON.stringify(
        {
          commit: process.env.GITHUB_SHA ?? null,
          workflowRun: process.env.GITHUB_RUN_ID ?? null,
          model: modelId(),
          planner: true,
          reasoning: "low",
          limits,
        },
        null,
        2,
      ),
    );
    await runner.start(100, "classroom", false, limits);
    if (runner.status()?.status === "error") process.exitCode = 1;
  } catch (error) {
    failure = error instanceof Error ? error.message : "Cloud test failed.";
    console.error(failure);
    process.exitCode = 1;
  } finally {
    clearInterval(timer);
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    const s = runner.status();
    const summary = [
      "# Five-hour cloud learning test",
      "",
      `Status: ${s?.status ?? "not started"}`,
      `Stage: ${failure ?? s?.stage ?? "No checkpoint"}`,
      `Completed learning cycles: ${s?.completed ?? 0}`,
      `Estimated Muse spend: $${(s?.spentUsd ?? 0).toFixed(3)} / $${budgetUsd}`,
      `Final independent exam completed: ${s?.finalExamCompleted === true ? "yes" : "no"}`,
      "",
      "JSON checkpoints contain recorded moves, verification, lessons and retained conversations.",
      "Partial runs are not evidence of learning. Scores are exploratory; model weights stay fixed.",
      "",
    ].join("\n");
    writeFileSync(`${root}/SUMMARY.md`, summary);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    const final = s && `${s.directory}/final.json`;
    if (final && existsSync(final)) {
      const snapshot = JSON.parse(readFileSync(final, "utf8")) as {
        state: LabState;
      };
      writeFileSync(
        `${root}/CLASSROOM-REPORT.md`,
        classroomSummary(snapshot.state),
      );
    }
    console.log(summary);
  }
}
