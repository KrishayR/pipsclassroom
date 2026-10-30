import {
  mkdirSync,
  writeFileSync,
  renameSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { Classroom } from "../src/core/classroom";
import { modelFromEnv, keysFromEnv, prices, protocolFromEnv } from "./config";
import { budgetedKeyPool } from "./keys";
import type { LiveBatch, Policy } from "../src/core/types";
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
  if (existsSync(latest)) {
    status = JSON.parse(readFileSync(latest, "utf8"));
    if (status?.status === "running") {
      status.status = "interrupted";
      status.stage = "Server restarted; partial results are preserved.";
    }
  }
  const save = () => {
    mkdirSync(root, { recursive: true });
    for (const path of [latest, `${status!.directory}/status.json`]) {
      writeFileSync(`${path}.tmp`, JSON.stringify(status, null, 2));
      renameSync(`${path}.tmp`, path);
    }
    changed();
  };
  return {
    status: () => status,
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
    async start(count = 5) {
      if (!Number.isInteger(count) || count < 1 || count > 100)
        throw new Error("Choose a whole number of cycles from 1 to 100.");
      if (status?.status === "running")
        throw new Error("A live batch is already running.");
      stopping = false;
      const pool = (options.createPool ?? keysFromEnv)();
      const rates = (options.getPrices ?? prices)();
      if (!pool || !rates)
        throw new Error(
          "A model key and token prices are required for the $1 batch budget.",
        );
      const initialSpend = pool.status().reduce((n, k) => n + k.spentUsd, 0);
      const spent = () =>
        Math.max(
          0,
          pool.status().reduce((n, k) => n + k.spentUsd, 0) - initialSpend,
        );
      const policy =
        options.createPolicy?.() ??
        modelFromEnv({
          tokenBudget: 4000000,
          keys: budgetedKeyPool(pool, rates, 1),
          beforeRequest: () => {
            if (stopping)
              throw new Error("Batch stopped before the next request.");
          },
        })!;
      const directory = `${root}/live-batch-${Date.now()}`;
      const protocol = { ...protocolFromEnv("model"), ...options.protocol };
      mkdirSync(directory, { recursive: true });
      status = {
        status: "running",
        stage: "Starting baseline",
        completed: 0,
        total: count,
        budgetUsd: 1,
        spentUsd: 0,
        directory,
        startedAt: new Date().toISOString(),
        cycles: [],
        concurrency: protocol.concurrency,
        timings: [],
      };
      lab = new Classroom(policy, undefined, protocol);
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
        status!.stage = label;
        save();
        const started = Date.now();
        await run();
        status!.timings!.push({
          stage: label,
          elapsedMs: Date.now() - started,
        });
        checkpoint(name);
        if (stopping) return false;
        if (active.state.error) throw new Error(active.state.error);
        const exam = active.state.exams.at(-1);
        if (
          active.state.phase === "exam" &&
          exam?.rows.some((r) => r.terminal === "error")
        )
          throw new Error(
            "An exam decision failed; inspect saved partial results.",
          );
        return !stopping;
      };
      save();
      try {
        if (
          !(await stage("Baseline: 3 students, 25 moves each", "baseline", () =>
            active.exam(1, 25),
          ))
        )
          return;
        status.baseline = structuredClone(active.state.exams.at(-1)!.rows);
        save();
        for (let i = 0; i < count; i++) {
          const student =
            active.state.students[i % active.state.students.length];
          const prefix = `cycle-${i + 1}`;
          if (
            !(await stage(
              `Cycle ${i + 1}/${count}: focused practice`,
              `${prefix}-practice`,
              () => active.diagnose(),
            ))
          )
            break;
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
          if (
            !(await stage(
              `Cycle ${i + 1}/${count}: independent exam`,
              `${prefix}-exam`,
              () => active.exam(1, 25),
            ))
          )
            break;
          status.cycles.push({
            cycle: i + 1,
            student: student.name,
            lesson: structuredClone(active.state.ledger.at(-1)!),
            rows: structuredClone(active.state.exams.at(-1)!.rows),
          });
          status.completed = i + 1;
          checkpoint(prefix);
        }
        if (!stopping) {
          status.status = "complete";
          status.stage = `${count} cycles finished — results ready`;
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
        checkpoint("final");
        lab = undefined;
      }
    },
  };
}
