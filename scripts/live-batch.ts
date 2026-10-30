// Runs the budgeted live batch (baseline, then cycles of focused practice → review →
// verification → exam) from the command line, without the server or browser. It uses
// the same runner, protocol and $1 batch cap as the Classroom button. Makes paid calls.
// Do not run alongside the server's batch: both spend from the same key ledger.
import { liveBatchRunner } from "../server/batch";
import { loadEnv, studentHelper } from "../server/config";
loadEnv();
const args = process.argv.slice(2);
const at = (key: string, fallback: string) => {
  const i = args.indexOf(`--${key}`);
  return i < 0 ? fallback : args[i + 1];
};
const cycles = Number(at("cycles", "3"));
const root = at("root", "data");
const runner = liveBatchRunner(() => {}, { root });
process.on("SIGINT", () => {
  console.log("\nStopping after the current action…");
  runner.stop();
});
let last = "";
const timer = setInterval(() => {
  const s = runner.status();
  const line = `${s?.stage} · $${s?.spentUsd.toFixed(3)} of $${s?.budgetUsd}`;
  if (line !== last) console.log(line);
  last = line;
}, 5000);
console.log(
  `Live batch: ${cycles} cycles, helper ${studentHelper() ? "on" : "off"}, results under ${root}/`,
);
try {
  await runner.start(cycles);
} finally {
  clearInterval(timer);
}
const s = runner.status()!;
console.log(`\n${s.status}: ${s.stage} · spent $${s.spentUsd.toFixed(3)}`);
console.log(`Results: ${s.directory}/final.json`);
