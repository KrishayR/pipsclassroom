// Read-only access to saved live batch runs (data/**/live-batch-*/), so a real recorded
// run can be shown again in the app without new model calls. Only files found by the
// listing can be read; request parameters never form a path.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { LabState, LiveBatch } from "../src/core/types";

export interface Recording {
  id: string;
  directory: string;
  kind: string;
  status: string;
  startedAt: string;
  // Not recorded by batches before October 31.
  plannerEnabled: boolean | null;
  completed: number;
  total: number;
  spentUsd: number;
  // Lessons saved by the end of the last recorded stage.
  lessonsKept: number;
  lessonsTested: number;
  stages: { id: string; label: string }[];
}

const RUN = /^live-batch-\d+$/;
// Checkpoint names written by server/batch.ts, in run order. "cycle-N.json" repeats the
// exam checkpoint and is skipped.
const STAGE =
  /^(baseline|final|cycle-(\d+)-(practice|review|verification|teaching|exam))\.json$/;
const STEP = ["practice", "review", "teaching", "verification", "exam"];
const label = (name: string) => {
  const m = STAGE.exec(`${name}.json`)!;
  if (m[1] === "baseline") return "Baseline exam";
  if (m[1] === "final") return "End of run";
  const step = {
    practice: "focused practice",
    review: "teacher review",
    teaching: "teaching",
    verification: "lesson test",
    exam: "exam",
  }[m[3]];
  return `Cycle ${m[2]}: ${step}`;
};
const order = (name: string) => {
  const m = STAGE.exec(`${name}.json`)!;
  if (m[1] === "baseline") return -1;
  if (m[1] === "final") return 1e9;
  return Number(m[2]) * 10 + STEP.indexOf(m[3]);
};

function runDirectories(root: string) {
  const found: string[] = [];
  const visit = (dir: string, depth: number) => {
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}`;
      if (!statSync(path).isDirectory()) continue;
      if (RUN.test(name)) {
        if (existsSync(`${path}/status.json`)) found.push(path);
      } else if (depth < 2) visit(path, depth + 1);
    }
  };
  if (existsSync(root)) visit(root, 0);
  return found;
}

export function listRecordings(root = "data"): Recording[] {
  return runDirectories(root)
    .flatMap((directory) => {
      try {
        const status = JSON.parse(
          readFileSync(`${directory}/status.json`, "utf8"),
        ) as LiveBatch;
        const stages = readdirSync(directory)
          .filter((f) => STAGE.test(f))
          .map((f) => f.slice(0, -5))
          .sort((a, b) => order(a) - order(b))
          .map((id) => ({ id, label: label(id) }));
        if (!stages.length) return [];
        const last = JSON.parse(
          readFileSync(`${directory}/${stages.at(-1)!.id}.json`, "utf8"),
        );
        const ledger = ((last.state ?? last) as LabState).ledger;
        return [
          {
            id: directory.split("/").at(-1)!,
            directory,
            kind: status.kind ?? "individual",
            status: status.status,
            startedAt: status.startedAt,
            plannerEnabled: status.plannerEnabled ?? null,
            completed: status.completed,
            total: status.total,
            spentUsd: status.spentUsd,
            lessonsKept: ledger.filter((l) => l.status === "verified").length,
            lessonsTested: ledger.length,
            stages,
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function loadRecording(id: string, stage: string, root = "data") {
  const recording = listRecordings(root).find((r) => r.id === id);
  if (!recording) throw new Error("Unknown recorded run.");
  if (!recording.stages.some((s) => s.id === stage))
    throw new Error("Unknown stage of this run.");
  const data = JSON.parse(
    readFileSync(`${recording.directory}/${stage}.json`, "utf8"),
  );
  const state = structuredClone(data.state ?? data) as LabState;
  // Same redaction as live state: future spawns are never shown.
  state.students.forEach((s) => {
    s.game.rng = 0;
    s.game.seed = 0;
  });
  state.busy = false;
  delete state.liveBatch;
  return state;
}
