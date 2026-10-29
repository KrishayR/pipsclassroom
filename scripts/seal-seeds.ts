// Generates final exam seeds outside source control. Run once, after freezing prompts,
// skills, thresholds and budgets. Publish the printed SHA-256 before running the exam,
// so anyone can check the seeds were fixed in advance.
import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { DEV_SEEDS, parseSealedSeeds } from "../src/core/evaluation";
const args = process.argv.slice(2);
const at = (key: string, fallback: string) => {
  const i = args.indexOf(`--${key}`);
  return i < 0 ? fallback : args[i + 1];
};
const out = at("out", "data/sealed-exam-seeds.json");
const count = Number(at("count", "30"));
if (!Number.isInteger(count) || count < 1 || count > 200)
  throw new Error("--count must be 1..200");
if (existsSync(out) && !args.includes("--force"))
  throw new Error(
    `${out} already exists. Sealed seeds are generated once; pass --force only if no exam has used them.`,
  );
const seeds = new Set<number>();
while (seeds.size < count) {
  const s = randomInt(0, 2 ** 32 - 1);
  if (!DEV_SEEDS.includes(s)) seeds.add(s);
}
const text = JSON.stringify(
  { createdAt: new Date().toISOString(), seeds: [...seeds] },
  null,
  2,
);
parseSealedSeeds(JSON.parse(text));
mkdirSync(out.slice(0, out.lastIndexOf("/")) || ".", { recursive: true });
writeFileSync(out, text);
console.log(
  `Sealed ${count} exam seeds in ${out} (ignored by Git).\nSHA-256: ${createHash("sha256").update(text).digest("hex")}`,
);
