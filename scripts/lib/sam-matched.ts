import { mapConcurrent } from "../../src/core/concurrency";
import { examEpisode } from "../../src/core/evaluation";
import { emptyWorkspace } from "../../src/core/skills";
import type {
  Policy,
  Workspace,
  ExamRow,
  Decision,
} from "../../src/core/types";

export function samJobs(seeds: number[], repeats = 3) {
  return Array.from({ length: repeats }, (_, repeat) =>
    seeds.flatMap((seed, i) =>
      ((repeat + i) % 2 ? ["trained", "empty"] : ["empty", "trained"]).map(
        (condition) => ({
          seed,
          repeat,
          condition: condition as "trained" | "empty",
        }),
      ),
    ),
  ).flat();
}
export type SamJob = ReturnType<typeof samJobs>[number];
export type SamResult = SamJob & { row: ExamRow };

export async function runSamMatched(
  policy: Policy,
  workspace: Workspace,
  jobs: SamJob[],
  cap: number,
  callbacks: {
    decision?: (job: SamJob, decision: Decision, move: number) => void;
    saved?: (result: SamResult) => void;
    stopped?: () => boolean;
  } = {},
) {
  return mapConcurrent(
    jobs,
    6,
    async (job) => {
      // Every game receives its own frozen copy; there is no teaching or memory update.
      const notebook = structuredClone(
        job.condition === "trained" ? workspace : emptyWorkspace(),
      );
      const before = JSON.stringify(notebook);
      let moves = 0;
      const wrapped: Policy = {
        ...policy,
        decide: async (...args) => {
          const decision = await policy.decide(...args);
          callbacks.decision?.(job, decision, ++moves);
          return decision;
        },
      };
      const row = await examEpisode(
        wrapped,
        notebook,
        job.seed,
        cap,
        { id: "student-3", name: "Sam" },
        "classroom",
      );
      const result = { ...job, row };
      callbacks.saved?.(result);
      if (JSON.stringify(notebook) !== before)
        throw new Error("Frozen notebook changed during evaluation.");
      if (row.terminal === "error") throw new Error(row.error ?? "Exam failed");
      return result;
    },
    callbacks.stopped,
  );
}

export function samSummary(results: SamResult[]) {
  const pairs = results
    .filter((r) => r.condition === "trained" && r.row.terminal !== "error")
    .flatMap((t) => {
      const b = results.find(
        (b) =>
          b.condition === "empty" &&
          b.seed === t.seed &&
          b.repeat === t.repeat &&
          b.row.terminal !== "error",
      );
      return b
        ? [
            {
              seed: t.seed,
              repeat: t.repeat,
              trained: t.row.score,
              empty: b.row.score,
              delta: t.row.score - b.row.score,
            },
          ]
        : [];
    });
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return {
    pairs: pairs.length,
    trainedMean: mean(pairs.map((p) => p.trained)),
    emptyMean: mean(pairs.map((p) => p.empty)),
    meanDelta: mean(pairs.map((p) => p.delta)),
    perSeed: [...new Set(pairs.map((p) => p.seed))].map((seed) => ({
      seed,
      meanDelta: mean(pairs.filter((p) => p.seed === seed).map((p) => p.delta)),
    })),
    pairedRows: pairs,
    exploratory: true,
    note: "One frozen trained notebook, four seeds, repeated live decisions. Descriptive comparison of the learned notebook and planner parameters together; not independent training repetitions or proof of weight training.",
  };
}
