// Ordered results; errors stop queued work and drain in-flight work before return.
export async function mapConcurrent<T, R>(
  values: readonly T[],
  limit: number,
  work: (value: T, index: number) => Promise<R>,
  stopped: () => boolean = () => false,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 64)
    throw new Error("Concurrency must be an integer from 1 to 64.");
  const results = new Array<R>(values.length);
  let next = 0;
  let failed = false;
  let error: unknown;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (!failed && !stopped()) {
        const i = next++;
        if (i >= values.length) return;
        try {
          results[i] = await work(values[i], i);
        } catch (e) {
          failed = true;
          error ??= e;
        }
      }
    }),
  );
  if (failed) throw error;
  return results;
}

export function requestLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((r) => waiting.push(r));
    else active++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
