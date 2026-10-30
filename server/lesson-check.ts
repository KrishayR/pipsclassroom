import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { modelFromEnv, keysFromEnv, prices } from "./config";
import { budgetedKeyPool } from "./keys";
import { mapConcurrent } from "../src/core/concurrency";
import { examEpisode, DEV_SEEDS } from "../src/core/evaluation";
import { hash } from "../src/core/engine";
import { validateSkill, validateLimits } from "../src/core/skills";
import type { LessonCheck, Policy, Workspace } from "../src/core/types";

export function lessonCheckRunner(
  changed: () => void,
  options: {
    root?: string;
    createPolicy?: () => Policy;
    createPool?: typeof keysFromEnv;
    getPrices?: typeof prices;
  } = {},
) {
  const root = options.root ?? "data",
    latest = `${root}/lesson-check-latest.json`;
  let status: LessonCheck | undefined = existsSync(latest)
    ? JSON.parse(readFileSync(latest, "utf8"))
    : undefined;
  if (status?.status === "running") {
    status.status = "interrupted";
    status.stage = "Server restarted; partial results preserved.";
  }
  let stopped = false;
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
    stop() {
      if (status?.status === "running") {
        stopped = true;
        status.stage = "Stopping; draining current calls";
        save();
      }
    },
    async start() {
      if (status?.status === "running")
        throw new Error("Lesson test already running.");
      const batch = JSON.parse(
        readFileSync(`${root}/live-batch-latest.json`, "utf8"),
      );
      if (batch.status !== "complete" || batch.plannerEnabled !== false)
        throw new Error(
          "A completed planner-free classroom batch is required.",
        );
      const source = `${batch.directory}/final.json`,
        sourceText = readFileSync(source, "utf8"),
        state = JSON.parse(sourceText).state;
      const student = state.students.find(
        (s: { name: string }) => s.name === "Lin",
      );
      const baseline: Workspace = state.exams[0]?.frozen[student?.id];
      const candidate: Workspace = student?.workspace;
      if (
        !baseline ||
        !candidate?.lessons.length ||
        baseline.lessons.length ||
        candidate.lessons.some((l) => l.status !== "verified")
      )
        throw new Error(
          "Lin needs an empty baseline and a retained lesson in the saved batch.",
        );
      validateSkill(baseline.skill);
      validateSkill(candidate.skill);
      candidate.lessons.forEach((l) => validateLimits(l.limits));
      const forbidden = new Set<number>([
        ...DEV_SEEDS,
        ...state.exams.flatMap((e: { seeds: number[] }) => e.seeds),
        ...state.ledger.flatMap(
          (l: { verification?: { rows: { seed: number }[] } }) =>
            l.verification?.rows.map((r) => r.seed) ?? [],
        ),
      ]);
      const seeds: number[] = [];
      for (let i = 0; seeds.length < 3; i++) {
        const seed = hash(`lesson-chance-check-v1:${i}`);
        if (!forbidden.has(seed) && !seeds.includes(seed)) seeds.push(seed);
      }
      const pool = (options.createPool ?? keysFromEnv)(),
        rates = (options.getPrices ?? prices)();
      if (!pool || !rates)
        throw new Error("A model key and token prices are required.");
      const initial = pool.status().reduce((n, k) => n + k.spentUsd, 0);
      const spent = () =>
        Math.max(
          0,
          pool.status().reduce((n, k) => n + k.spentUsd, 0) - initial,
        );
      stopped = false;
      const policy =
        options.createPolicy?.() ??
        modelFromEnv({
          allowSkill: false,
          tokenBudget: 4000000,
          keys: budgetedKeyPool(pool, rates, 1),
          beforeRequest: () => {
            if (stopped)
              throw new Error("Lesson test stopped before next request.");
          },
        })!;
      if (policy.usesHelper !== false)
        throw new Error("Lesson comparison requires a planner-free policy.");
      const directory = `${root}/lesson-check-${Date.now()}`;
      mkdirSync(directory, { recursive: true });
      status = {
        status: "running",
        stage: "Testing Lin’s lesson against two unchanged controls",
        directory,
        completed: 0,
        total: 18,
        budgetUsd: 1,
        spentUsd: 0,
        startedAt: new Date().toISOString(),
        protocol: {
          plannerEnabled: false,
          seeds,
          repeats: 2,
          cap: 50,
          source,
          student: student.name,
          baseline: structuredClone(baseline),
          candidate: structuredClone(candidate),
          primary:
            "Exploratory mean 50-move score: lesson minus average of controls A/B, paired by seed and repetition. Also report control B minus A and its mean absolute difference. Three unique seeds, repeated twice; no acceptance threshold or claim of proven learning.",
        },
        trials: [],
      };
      // Freeze the source and protocol before any paid calls; never tune during the test.
      writeFileSync(`${directory}/source.json`, sourceText);
      writeFileSync(
        `${directory}/manifest.json`,
        JSON.stringify(
          {
            protocol: status.protocol,
            sourceSha256: createHash("sha256").update(sourceText).digest("hex"),
          },
          null,
          2,
        ),
      );
      save();
      const jobs = seeds.flatMap((seed) =>
        [0, 1].flatMap((repetition) => {
          const conditions = ["control-a", "control-b", "lesson"] as const;
          // Rotate launch order so the lesson is not always dispatched last.
          const offset = (seeds.indexOf(seed) + repetition) % 3;
          return Array.from({ length: 3 }, (_, i) => ({
            seed,
            repetition,
            condition: conditions[(i + offset) % 3],
          }));
        }),
      );
      let failed = false;
      const guarded: Policy = {
        ...policy,
        async decide(...args) {
          if (stopped || failed)
            throw new Error("Lesson test stopped before next move.");
          return policy.decide(...args);
        },
      };
      try {
        await mapConcurrent(
          jobs,
          6,
          async (job) => {
            const row = await examEpisode(
              guarded,
              structuredClone(
                job.condition === "lesson" ? candidate : baseline,
              ),
              job.seed,
              50,
              { id: student.id, name: student.name },
              "classroom",
            );
            status!.trials.push({
              condition: job.condition,
              repetition: job.repetition,
              row,
            });
            status!.trials.sort(
              (a, b) =>
                seeds.indexOf(a.row.seed) - seeds.indexOf(b.row.seed) ||
                a.repetition - b.repetition ||
                a.condition.localeCompare(b.condition),
            );
            status!.completed = status!.trials.length;
            status!.spentUsd = spent();
            status!.stage = `Lesson vs chance: ${status!.completed}/18 games saved`;
            save();
            if (row.terminal === "error") {
              failed = true;
              throw new Error(row.error ?? "Exam failed");
            }
          },
          () => stopped || failed,
        );
        if (!stopped) {
          const pairs = seeds.flatMap((seed) =>
            [0, 1].map((rep) => {
              const score = (condition: string) =>
                status!.trials.find(
                  (t) =>
                    t.row.seed === seed &&
                    t.repetition === rep &&
                    t.condition === condition,
                )!.row.score;
              return {
                lesson:
                  score("lesson") -
                  (score("control-a") + score("control-b")) / 2,
                control: score("control-b") - score("control-a"),
              };
            }),
          );
          status.summary = {
            lessonMeanDelta:
              pairs.reduce((n, p) => n + p.lesson, 0) / pairs.length,
            controlMeanDelta:
              pairs.reduce((n, p) => n + p.control, 0) / pairs.length,
            controlMeanAbsoluteDelta:
              pairs.reduce((n, p) => n + Math.abs(p.control), 0) / pairs.length,
          };
          status.status = "complete";
          status.stage =
            "Lesson vs chance complete — exploratory results ready";
        }
      } catch (error) {
        status.status = "error";
        status.stage =
          error instanceof Error ? error.message : "Lesson test failed";
      } finally {
        if (stopped) {
          status.status = "stopped";
          status.stage = "Stopped; partial results saved";
        }
        status.spentUsd = spent();
        status.completedAt = new Date().toISOString();
        save();
      }
    },
  };
}
