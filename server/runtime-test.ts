import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import type { LabState, RuntimeTestStatus } from "../src/core/types";
import {
  runBenchmark,
  type BenchmarkReport,
} from "../scripts/lib/muse-benchmark";
import { keysFromEnv, prices } from "./config";

export function runtimeTestRunner(
  changed: () => void,
  options: { root?: string; simulation?: boolean } = {},
) {
  const root = options.root ?? "data";
  const latest = `${root}/runtime-test-latest.json`;
  let state: RuntimeTestStatus | undefined = existsSync(latest)
    ? JSON.parse(readFileSync(latest, "utf8"))
    : undefined;
  if (state?.status === "running") {
    state.status = "interrupted";
    state.stage = "Server restarted; partial runtime test saved.";
  }
  let controller: AbortController | undefined;
  const save = () => {
    mkdirSync(root, { recursive: true });
    writeFileSync(latest, JSON.stringify(state, null, 2));
    changed();
  };
  const reportPath = () => {
    if (
      !state ||
      !/^muse-benchmark-\d+\.json$/.test(basename(state.reportPath)) ||
      dirname(resolve(state.reportPath)) !== resolve(root)
    )
      throw new Error("Runtime report is unavailable.");
    return state.reportPath;
  };
  return {
    status: () => state,
    async report() {
      return JSON.parse(
        await readFile(reportPath(), "utf8"),
      ) as BenchmarkReport;
    },
    stop() {
      if (state?.status === "running" && !controller?.signal.aborted) {
        controller?.abort();
        state.stage = "Stopping runtime test after active requests finish…";
        save();
      }
    },
    start(source: LabState): Promise<void> {
      if (state?.status === "running")
        throw new Error("The runtime test is already running.");
      if (!options.simulation && (!keysFromEnv() || !prices()))
        throw new Error(
          "Configure Muse and token prices before running the runtime test.",
        );
      const frozen = structuredClone(source);
      if (!frozen.students.length)
        throw new Error("No students available to benchmark.");
      const path = `${root}/muse-benchmark-${Date.now()}.json`;
      controller = new AbortController();
      const signal = controller.signal;
      state = {
        status: "running",
        stage: "Starting runtime comparison…",
        completedGames: 0,
        totalGames: 24,
        budgetUsd: 2,
        spentUsd: 0,
        reportPath: path,
        reportAvailable: false,
        startedAt: new Date().toISOString(),
        results: [],
      };
      save();
      return runBenchmark(
        [
          options.simulation ? "--simulation" : "--live",
          "--moves",
          "10",
          "--seeds",
          "3",
          "--repeats",
          "2",
          "--workers",
          "3,6",
          "--efforts",
          "low,minimal",
          "--budget",
          "2",
          "--out",
          path,
        ],
        {
          sourceState: frozen,
          signal,
          skipBackendCheck: true,
          onUpdate: (report) => {
            state!.completedGames = report.results.reduce(
              (n, r) => n + r.rows.length,
              0,
            );
            state!.spentUsd = report.spentUsd;
            state!.reportAvailable = true;
            const current = report.results.at(-1);
            if (!signal.aborted && current)
              state!.stage = `${current.effort} reasoning · ${current.concurrency} workers · ${current.rows.length}/6 games`;
            state!.results = report.results.map((r) => ({
              effort: r.effort,
              concurrency: r.concurrency,
              games: r.rows.length,
              elapsedMs: r.elapsedMs,
              errors: r.rows.filter((row) => row.terminal === "error").length,
              meanScore: r.summary?.meanScore,
              medianDecisionMs: r.summary?.medianDecisionMs,
            }));
            save();
          },
        },
      )
        .then((report) => {
          const error = report?.results
            .flatMap((r) => r.rows)
            .find((r) => r.terminal === "error")?.error;
          state!.status = signal.aborted
            ? "stopped"
            : error || state!.completedGames !== state!.totalGames
              ? "error"
              : "complete";
          state!.stage = signal.aborted
            ? "Runtime test stopped; partial results saved."
            : error
              ? `Runtime test ended: ${error}`
              : state!.status === "complete"
                ? "Runtime comparison complete; results saved."
                : "Runtime test incomplete; inspect the saved report.";
        })
        .catch((error) => {
          state!.status = "error";
          state!.stage =
            error instanceof Error ? error.message : "Runtime test failed.";
        })
        .finally(() => {
          state!.completedAt = new Date().toISOString();
          controller = undefined;
          save();
        });
    },
  };
}
