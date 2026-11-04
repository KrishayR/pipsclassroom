import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  copyFileSync,
} from "node:fs";
import { Classroom } from "../src/core/classroom";
import {
  batchFromEnv,
  modelFromEnv,
  keysFromEnv,
  prices,
  protocolFromEnv,
} from "./config";
import { budgetedKeyPool } from "./keys";
import { atomicWriteFileSync } from "./persistence";
import type { LiveBatch, Policy, LabState } from "../src/core/types";
import type { ClassroomOptions } from "../src/core/classroom";

// Runs entirely in Node after the browser request returns. No assistant needed.
export function liveBatchRunner(
  changed: () => void,
  options: {
    root?: string;
    createPolicy?: () => Policy;
    createPool?: typeof keysFromEnv;
    getPrices?: typeof prices;
    protocol?: ClassroomOptions;
  } = {},
) {
  let status: LiveBatch | undefined;
  let lab: Classroom | undefined;
  let stopping = false;
  const root = options.root ?? "data";
  const latest = `${root}/live-batch-latest.json`;
  type Snapshot = ReturnType<Classroom["export"]>;
  const savedStages = (batch: LiveBatch) => {
    const names = ["baseline"];
    for (let i = 1; i <= batch.total; i++)
      names.push(
        `cycle-${i}-practice`,
        ...(batch.kind === "classroom"
          ? [`cycle-${i}-teaching`]
          : [`cycle-${i}-review`, `cycle-${i}-verification`]),
        `cycle-${i}-exam`,
        `cycle-${i}`,
      );
    const saved = new Map<string, Snapshot>();
    for (const name of names) {
      const path = `${batch.directory}/${name}.json`;
      if (!existsSync(path)) break;
      try {
        const snapshot: Snapshot = JSON.parse(readFileSync(path, "utf8"));
        if (snapshot.state.error) break;
        if (
          (name === "baseline" || name.endsWith("-exam")) &&
          (!snapshot.state.exams.at(-1)?.completedAt ||
            snapshot.state.exams
              .at(-1)
              ?.rows.some((r) => r.terminal === "error"))
        )
          break;
        saved.set(name, snapshot);
      } catch {
        break;
      }
    }
    return saved;
  };
  if (existsSync(latest)) {
    status = JSON.parse(readFileSync(latest, "utf8"));
    if (status?.status === "running") {
      status.status = "interrupted";
      status.stage = "Server restarted; partial results are preserved.";
    }
    if (status && ["error", "interrupted"].includes(status.status))
      status.canResume =
        status.spentUsd < status.budgetUsd && savedStages(status).size > 0;
  }
  const save = () => {
    mkdirSync(root, { recursive: true });
    for (const path of [latest, `${status!.directory}/status.json`]) {
      atomicWriteFileSync(path, JSON.stringify(status, null, 2));
    }
    changed();
  };
  const runner = {
    status: () => (status?.progressCleared ? undefined : status),
    archiveStatus: () => status,
    diagnostics: () => lab?.policy.diagnostics?.(),
    clearProgress() {
      if (status?.status === "running")
        throw new Error("Stop the session before resetting progress.");
      if (status) {
        status.progressCleared = true;
        save();
      }
    },
    // The live classroom can be displayed without replacing the manual session.
    state: () => (status?.status === "running" ? lab?.state : undefined),
    stop() {
      lab?.stop();
      if (status?.status === "running") {
        stopping = true;
        status.stage = "Stopping after the current action";
        save();
      }
    },
    async resume() {
      if (
        !status ||
        status.progressCleared ||
        !["error", "interrupted"].includes(status.status) ||
        !status.canResume
      )
        throw new Error(
          "This session has no resumable checkpoint or budget remaining.",
        );
      return runner
        .start(status.total, status.kind ?? "individual", true)
        .catch((error) => {
          status!.status = "error";
          status!.stage =
            error instanceof Error
              ? error.message
              : "Could not resume session.";
          save();
          throw error;
        });
    },
    async start(
      count = 5,
      kind: "individual" | "classroom" = "individual",
      resume = false,
    ) {
      if (kind !== "individual" && kind !== "classroom")
        throw new Error("Choose Individual Cycles or Classroom Session.");
      if (!Number.isInteger(count) || count < 1 || count > 100)
        throw new Error("Choose a whole number of cycles from 1 to 100.");
      if (status?.status === "running")
        throw new Error("A live batch is already running.");
      stopping = false;
      const saved =
        resume && status ? savedStages(status) : new Map<string, Snapshot>();
      const snapshot = [...saved.values()].at(-1);
      let checkpointAvailable = saved.size > 0;
      if (resume && !snapshot)
        throw new Error("No usable checkpoint was found.");
      let previousSpend = resume ? status!.spentUsd : 0;
      const sizes = resume
        ? {
            budgetUsd: status!.budgetUsd,
            examMoves: saved.get("baseline")!.state.exams[0].cap,
            examSeeds: saved.get("baseline")!.state.exams[0].seeds.length,
          }
        : batchFromEnv();
      const pool = (options.createPool ?? keysFromEnv)();
      const rates = (options.getPrices ?? prices)();
      if (!pool || !rates)
        throw new Error(
          `A model key and token prices are required for the $${sizes.budgetUsd} batch budget.`,
        );
      const initialSpend = pool.status().reduce((n, k) => n + k.spentUsd, 0);
      if (resume && status!.spendStartUsd !== undefined)
        previousSpend = Math.max(
          previousSpend,
          initialSpend - status!.spendStartUsd!,
        );
      const remainingBudget = sizes.budgetUsd - previousSpend;
      if (remainingBudget <= 0) {
        status!.canResume = false;
        status!.spentUsd = previousSpend;
        save();
        throw new Error("The original session budget is exhausted.");
      }
      const spent = () =>
        Math.max(
          previousSpend,
          previousSpend +
            pool.status().reduce((n, k) => n + k.spentUsd, 0) -
            initialSpend,
        );
      const policy =
        options.createPolicy?.() ??
        modelFromEnv({
          // A backstop only: about 10M tokens cost $1 at Contributor prices, so the
          // dollar cap binds first.
          tokenBudget: 15000000 * Math.max(1, sizes.budgetUsd),
          keys: budgetedKeyPool(pool, rates, remainingBudget),
          beforeRequest: () => {
            if (stopping)
              throw new Error("Batch stopped before the next request.");
          },
        })!;
      if (
        resume &&
        ((snapshot!.state.plannerEnabled !== undefined &&
          snapshot!.state.plannerEnabled !== (policy.usesHelper !== false)) ||
          (snapshot!.state.modelId &&
            snapshot!.state.modelId !== policy.modelId))
      )
        throw new Error(
          "Restore the original model and planner setting before resuming.",
        );
      const directory = resume
        ? status!.directory
        : `${root}/live-batch-${Date.now()}`;
      const protocol = snapshot?.protocol ?? {
        ...protocolFromEnv("model"),
        ...options.protocol,
      };
      mkdirSync(directory, { recursive: true });
      if (resume && existsSync(`${directory}/final.json`))
        copyFileSync(
          `${directory}/final.json`,
          `${directory}/attempt-${Date.now()}.json`,
        );
      status = resume
        ? {
            ...status!,
            status: "running",
            stage: "Resuming saved session",
            canResume: false,
            completedAt: undefined,
            spentUsd: previousSpend,
            spendStartUsd: initialSpend - previousSpend,
            cycles: status!.cycles.filter((c) => saved.has(`cycle-${c.cycle}`)),
            completed: status!.cycles.filter((c) =>
              saved.has(`cycle-${c.cycle}`),
            ).length,
          }
        : {
            plannerEnabled: policy.usesHelper !== false,
            kind,
            status: "running",
            stage: "Starting the first exam",
            completed: 0,
            total: count,
            budgetUsd: sizes.budgetUsd,
            spentUsd: 0,
            spendStartUsd: initialSpend,
            directory,
            startedAt: new Date().toISOString(),
            cycles: [],
            concurrency: protocol.concurrency,
            examConcurrency: protocol.examConcurrency,
            verificationConcurrency: protocol.verificationConcurrency,
            timings: [],
          };
      const restored: LabState | undefined = snapshot
        ? structuredClone(snapshot.state)
        : undefined;
      if (restored) {
        restored.busy = false;
        restored.error = null;
      }
      lab = new Classroom(policy, restored, protocol);
      const active = lab;
      const checkpoint = (name: string) => {
        writeFileSync(
          `${directory}/${name}.json`,
          JSON.stringify(active.export()),
        );
        status!.spentUsd = spent();
        save();
      };
      active.subscribe(() => {
        status!.spentUsd = spent();
        changed();
      });
      const stage = async (
        label: string,
        name: string,
        run: () => Promise<void>,
      ) => {
        if (stopping) return false;
        if (saved.has(name)) return true;
        status!.stage = label;
        save();
        const started = Date.now();
        await run();
        if (active.state.error) throw new Error(active.state.error);
        const exam = active.state.exams.at(-1);
        if (
          active.state.phase === "exam" &&
          exam?.rows.some((r) => r.terminal === "error")
        )
          throw new Error("An exam move failed. Results so far are saved.");
        if (stopping) return false;
        status!.timings ??= [];
        status!.timings.push({ stage: label, elapsedMs: Date.now() - started });
        checkpoint(name);
        checkpointAvailable = true;
        return !stopping;
      };
      save();
      try {
        if (
          !(await stage(
            `First exam: 3 students, ${sizes.examMoves} moves each`,
            "baseline",
            () => active.exam(sizes.examSeeds, sizes.examMoves),
          ))
        )
          return;
        status.baseline ??= structuredClone(active.state.exams[0].rows);
        save();
        for (let i = 0; i < count; i++) {
          if (status.cycles.some((c) => c.cycle === i + 1)) continue;
          const beforeCycle =
            saved.get(i === 0 ? "baseline" : `cycle-${i}`)?.state ??
            active.state;
          const previousLessons = new Set(beforeCycle.ledger.map((l) => l.id));
          const student =
            active.state.students[i % active.state.students.length];
          const prefix = `cycle-${i + 1}`;
          if (
            !(await stage(
              `Session ${i + 1}/${count}: practice`,
              `${prefix}-practice`,
              () => active.diagnose(),
            ))
          )
            break;
          if (kind === "classroom") {
            if (
              !(await stage(
                `Session ${i + 1}/${count}: teaching and testing lessons`,
                `${prefix}-teaching`,
                () => active.teachClassroom(),
              ))
            )
              break;
          } else {
            if (
              !(await stage(
                `Cycle ${i + 1}/${count}: review ${student.name}`,
                `${prefix}-review`,
                () => active.review(student.id),
              ))
            )
              break;
            if (
              !(await stage(
                `Cycle ${i + 1}/${count}: verification`,
                `${prefix}-verification`,
                () => active.verify(),
              ))
            )
              break;
          }
          if (
            !(await stage(
              `Session ${i + 1}/${count}: final exam`,
              `${prefix}-exam`,
              () => active.exam(sizes.examSeeds, sizes.examMoves),
            ))
          )
            break;
          status.cycles.push({
            cycle: i + 1,
            student: kind === "classroom" ? "Ada, Lin, Sam" : student.name,
            lesson: structuredClone(active.state.ledger.at(-1)!),
            attempts: structuredClone(
              active.state.ledger.filter((l) => !previousLessons.has(l.id)),
            ),
            rows: structuredClone(active.state.exams.at(-1)!.rows),
          });
          status.completed = i + 1;
          checkpoint(prefix);
        }
        if (!stopping) {
          status.status = "complete";
          status.stage = `${count} ${kind === "classroom" ? "Classroom Sessions" : "Individual Cycles"} finished — results ready`;
        }
      } catch (e) {
        status.status = "error";
        status.stage = e instanceof Error ? e.message : "Batch failed";
      } finally {
        if (stopping) {
          status.status = "stopped";
          status.stage = "Stopped; partial results saved";
        }
        status.completedAt = new Date().toISOString();
        status.spentUsd = spent();
        status.canResume =
          ["error", "interrupted"].includes(status.status) &&
          checkpointAvailable &&
          status.spentUsd < status.budgetUsd;
        checkpoint("final");
        lab = undefined;
      }
    },
  };
  return runner;
}
