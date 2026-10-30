// Intentionally imports no server configuration, keys, or live model adapter.
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { calibrateGate, DEFAULT_CALIBRATION } from "./lib/gate-calibration";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "Local simulation only. npm run calibrate-gate -- [--lengths 4,8,12,24] [--rounds 4] [--practice 6] [--regression 2] [--reference-boards 3] [--reference-moves 150] [--out data/gate-calibration.json]",
  );
  process.exit(0);
}
const allowed = new Set([
  "--lengths",
  "--rounds",
  "--practice",
  "--regression",
  "--reference-boards",
  "--reference-moves",
  "--out",
]);
const input = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (
    !allowed.has(args[i]) ||
    args[i + 1] === undefined ||
    args[i + 1].startsWith("--")
  )
    throw new Error(`Unknown option or missing value: ${args[i]}`);
  input.set(args[i], args[i + 1]);
}
const option = (key: string, fallback: number) =>
  Number(input.get(`--${key}`) ?? fallback);
const options = {
  ...DEFAULT_CALIBRATION,
  lengths: input.has("--lengths")
    ? input.get("--lengths")!.split(",").map(Number)
    : DEFAULT_CALIBRATION.lengths,
  rounds: option("rounds", DEFAULT_CALIBRATION.rounds),
  practice: option("practice", DEFAULT_CALIBRATION.practice),
  regression: option("regression", DEFAULT_CALIBRATION.regression),
  referenceBoards: option(
    "reference-boards",
    DEFAULT_CALIBRATION.referenceBoards,
  ),
  referenceMoves: option("reference-moves", DEFAULT_CALIBRATION.referenceMoves),
};
const out = resolve(
  input.get("--out") ?? `data/gate-calibration-${Date.now()}.json`,
);
if (!out.endsWith(".json")) throw new Error("Output must end in .json.");
const sources = [
  "scripts/calibrate-gate.ts",
  "scripts/lib/gate-calibration.ts",
  "src/core/evaluation.ts",
  "src/core/engine.ts",
  "src/core/skills.ts",
  "src/core/policy.ts",
  "src/core/curriculum.ts",
  "src/core/classroom.ts",
];
const sourceHash = createHash("sha256");
for (const path of sources) sourceHash.update(path).update(readFileSync(path));
let revision = "unknown";
try {
  revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {
  /* Standalone source is usable. */
}
console.log(
  "Simulation-only calibration. No API calls; existing live gate stays unchanged.",
);
const report = {
  ...(await calibrateGate(options, console.log)),
  codeHash: sourceHash.digest("hex"),
  revision,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(`${out}.tmp`, JSON.stringify(report, null, 2));
renameSync(`${out}.tmp`, out);
const percent = (n: number | null) =>
  n === null ? "n/a" : `${(n * 100).toFixed(1)}%`;
const markdown = [
  "# Gate calibration — local simulation",
  "",
  `Source hash: ${report.codeHash}`,
  "",
  `Lengths: ${options.lengths.join(", ")} moves. Reference: ${options.referenceMoves} moves on disjoint development boards.`,
  `Gate: ${report.rule}`,
  "",
  report.referenceDefinition,
  "",
  "| Moves | Selection agreement | Holdout agreement | Holdout false accepts | Holdout false rejects | Holdout beneficial / total | Mean decision count |",
  "|---:|---:|---:|---:|---:|---:|---:|",
  ...report.table.map(
    (t) =>
      `| ${t.length} | ${percent(t.selection.agreement)} | ${percent(t.holdout.agreement)} | ${t.holdout.falseAccepts} | ${t.holdout.falseRejects} | ${t.holdout.positives}/${t.holdout.n} | ${t.holdout.meanShortDecisions.toFixed(0)} |`,
  ),
  "",
  `Selection choice: ${report.selectionChoice ?? "none"}. Validated recommendation: ${report.recommendation ?? "none"}.`,
  report.note,
  "",
  `Runtime: ${(report.elapsedMs / 1000).toFixed(1)}s; ${report.totalDecisions} local decisions; 0 API calls; $0 Muse spend.`,
  "",
  "## Limits",
  "",
  ...report.limitations.map((l) => `- ${l}`),
  "",
  "Full per-board evidence, fixed probes, timings, and seed records are in the accompanying JSON.",
  "",
].join("\n");
const summary = out.replace(/\.json$/, ".md");
writeFileSync(summary, markdown);
console.log(markdown);
console.log(`Saved ${out}\nSaved ${summary}`);
