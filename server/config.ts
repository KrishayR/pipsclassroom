import { existsSync, readFileSync } from "node:fs";
import { modelPolicy } from "./model";
import { rateLimiter } from "./ratelimit";
import { keyPool, tokenCost, type Prices, type TokenUsage } from "./keys";
import type { ClassroomOptions } from "../src/core/classroom";
import type { Mode } from "../src/core/types";
import { requestLimiter } from "../src/core/concurrency";
// Student stages dispatch three workers; verification may dispatch six.
const requestGate = requestLimiter(6);
export function loadEnv(path = ".env") {
  if (existsSync(path))
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && !process.env[match[1]])
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
}
const num = (key: string, fallback: number) => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a number.`);
  return n;
};
// MODEL_STUDENT_HELPER=off: students get no move ranking and decide from the board,
// per-move facts and lessons alone. Every arm of a study must use the same setting.
export const studentHelper = () =>
  process.env.MODEL_STUDENT_HELPER !== "off" &&
  process.env.MODEL_USE_PLANNER !== "false";
export const modelId = () => process.env.MODEL_ID || "muse-spark-1.3";
// MODEL_API_KEY and/or MODEL_API_KEYS (comma-separated), used in that order.
export const apiKeys = () => [
  ...new Set(
    [
      process.env.MODEL_API_KEY ?? "",
      ...(process.env.MODEL_API_KEYS ?? "").split(","),
    ]
      .map((k) => k.trim())
      .filter(Boolean),
  ),
];
let warned = false;
export function keysFromEnv() {
  const keys = apiKeys();
  if (!keys.length) return null;
  if (keys.length > 1 && !prices() && !warned) {
    warned = true;
    console.warn(
      "Several API keys but no MODEL_PRICE_INPUT_PER_M / MODEL_PRICE_OUTPUT_PER_M: keys switch only when the provider reports them out of credit.",
    );
  }
  return keyPool({
    keys,
    // Below the $150 credit by default: the local spend is an estimate.
    limitUsd: num("MODEL_KEY_LIMIT_USD", 145),
    prices: prices(),
    ledgerPath: process.env.MODEL_KEY_LEDGER || "data/key-spend.json",
  });
}
// One limiter per process: Meta's rate limits are per team, shared by all keys.
let limiter: (() => Promise<void>) | undefined;
export function modelFromEnv(
  overrides: Partial<Parameters<typeof modelPolicy>[0]> = {},
) {
  const keys = keysFromEnv();
  if (!keys) return null;
  return modelPolicy({
    keys,
    baseUrl: process.env.MODEL_BASE_URL || "https://api.meta.ai/v1",
    model: modelId(),
    tokenBudget: num("MODEL_TOKEN_BUDGET", 100000),
    maxCompletionTokens: num("MODEL_MAX_COMPLETION_TOKENS", 4000),
    reasoningEffort: process.env.MODEL_REASONING_EFFORT || "low",
    limiter: (limiter ??= rateLimiter(num("MODEL_RPM", 120))),
    allowSkill: studentHelper(),
    requestGate,
    ...overrides,
  });
}
// Simulation keeps the v0.1 gate (6 + 3 snapshots × 8 moves). Model mode defaults to a
// smaller gate because every rollout move is a paid decision; see PROTOCOL.md.
export function protocolFromEnv(mode: Mode): Required<ClassroomOptions> {
  return mode === "simulation"
    ? {
        verify: { practice: 6, regression: 3, moves: 8 },
        exerciseMoves: 4,
        concurrency: 1,
        verificationConcurrency: 1,
        reviseRejected: false,
        evidenceBasedTeaching: false,
      }
    : {
        verify: {
          practice: num("VERIFY_PRACTICE", 6),
          regression: num("VERIFY_REGRESSION", 2),
          moves: num("VERIFY_MOVES", 4),
        },
        exerciseMoves: num("EXERCISE_MOVES", 4),
        concurrency: 3,
        verificationConcurrency: 6,
        reviseRejected: true,
        evidenceBasedTeaching: true,
      };
}
// USD per million tokens; unset means costs are reported in tokens only.
export function prices(): Prices | null {
  const input = num("MODEL_PRICE_INPUT_PER_M", NaN),
    output = num("MODEL_PRICE_OUTPUT_PER_M", NaN),
    cachedInput = num("MODEL_PRICE_CACHED_INPUT_PER_M", NaN);
  return Number.isFinite(input) && Number.isFinite(output)
    ? {
        input,
        output,
        ...(Number.isFinite(cachedInput) ? { cachedInput } : {}),
      }
    : null;
}
export function dollars(usage: TokenUsage) {
  const p = prices();
  return p ? tokenCost(usage, p) : null;
}
