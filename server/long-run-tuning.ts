import { requestLimiter } from "../src/core/concurrency";
import type { RequestDiagnostics } from "../src/core/types";

// Switch gates only between fully drained stages; leave the RPM limiter unchanged.
export function longRunTuning(rpm: number) {
  let limit = 6;
  let gate = requestLimiter(limit);
  return {
    run: <T>(work: () => Promise<T>) => gate(work),
    limit: () => limit,
    adapt(stats?: RequestDiagnostics) {
      const meanMs = stats?.attempts
        ? stats.providerHeadersMs / stats.attempts
        : 0;
      const next =
        stats &&
        stats.attempts >= 30 &&
        !stats.rateLimited &&
        !stats.serverErrors &&
        !stats.transportErrors &&
        stats.rateWaitMs < stats.providerHeadersMs * 0.2 &&
        Number.isFinite(rpm) &&
        rpm > 0
          ? Math.max(6, Math.min(9, Math.floor((rpm * 0.85 * meanMs) / 60000)))
          : 6;
      if (next !== limit) {
        limit = next;
        gate = requestLimiter(limit);
      }
      return limit;
    },
  };
}
export const rankingColumns = [
  "action",
  "value",
  "lossRate",
  "meanEmpty",
  "samples",
] as const;
export const compactRanking = (rows: Record<string, unknown>[]) =>
  rows.map((row) => rankingColumns.map((column) => row[column]));
