import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
// Several API keys used in order. Each key's estimated spend is kept in a ledger so a
// key is skipped before a request could take it past its limit; a provider billing or
// authentication error also retires a key. Keys are identified by fingerprint only.
export interface Prices {
  input: number;
  output: number;
  // Rate for prompt tokens served from cache; defaults to the input rate.
  cachedInput?: number;
}
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  // The cached part of promptTokens.
  cachedTokens?: number;
}
export const tokenCost = (u: TokenUsage, p: Prices | null) => {
  if (!p) return 0;
  const cached = Math.min(u.cachedTokens ?? 0, u.promptTokens);
  return (
    ((u.promptTokens - cached) * p.input +
      cached * (p.cachedInput ?? p.input) +
      u.completionTokens * p.output) /
    1e6
  );
};
interface Entry {
  spentUsd: number;
  promptTokens: number;
  completionTokens: number;
  retired?: string;
  updatedAt: string;
}
type Ledger = Record<string, Entry>;
export interface KeyPool {
  pick(worstCase: { promptTokens: number; completionTokens: number }): {
    key: string;
    label: string;
  };
  record(label: string, usage: TokenUsage): void;
  retire(label: string, reason: string): void;
  status(): {
    label: string;
    fingerprint: string;
    spentUsd: number;
    promptTokens: number;
    completionTokens: number;
    retired?: string;
  }[];
}
export const fingerprint = (key: string) =>
  createHash("sha256").update(key).digest("hex").slice(0, 12);
export function keyPool(options: {
  keys: string[];
  limitUsd: number;
  // USD per million tokens. Without prices only provider errors trigger a switch.
  prices: Prices | null;
  // Omit for an in-memory ledger (tests).
  ledgerPath?: string;
}): KeyPool {
  const keys = [...new Set(options.keys.filter(Boolean))].map((key, i) => ({
    key,
    label: `key ${i + 1}`,
    fp: fingerprint(key),
  }));
  if (!keys.length) throw new Error("No API keys configured.");
  let memory: Ledger = {};
  // Read on every use so the server and CLI runs share one ledger.
  const load = (): Ledger => {
    if (!options.ledgerPath) return memory;
    try {
      return existsSync(options.ledgerPath)
        ? JSON.parse(readFileSync(options.ledgerPath, "utf8"))
        : {};
    } catch {
      throw new Error(
        `Key spend ledger ${options.ledgerPath} is unreadable; fix or remove it before spending more.`,
      );
    }
  };
  const save = (ledger: Ledger) => {
    if (!options.ledgerPath) {
      memory = ledger;
      return;
    }
    mkdirSync(dirname(options.ledgerPath), { recursive: true });
    const tmp = `${options.ledgerPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(ledger, null, 2));
    renameSync(tmp, options.ledgerPath);
  };
  const entry = (ledger: Ledger, fp: string): Entry =>
    (ledger[fp] ??= {
      spentUsd: 0,
      promptTokens: 0,
      completionTokens: 0,
      updatedAt: new Date().toISOString(),
    });
  const cost = (u: TokenUsage) => tokenCost(u, options.prices);
  const find = (label: string) => {
    const k = keys.find((k) => k.label === label);
    if (!k) throw new Error(`Unknown key ${label}.`);
    return k;
  };
  return {
    pick(worstCase) {
      const ledger = load();
      const worst = cost(worstCase);
      for (const k of keys) {
        const e = ledger[k.fp];
        if (e?.retired) continue;
        if ((e?.spentUsd ?? 0) + worst > options.limitUsd) continue;
        return { key: k.key, label: k.label };
      }
      const why = keys
        .map((k) => {
          const e = ledger[k.fp];
          return `${k.label}: ${e?.retired ?? `$${(e?.spentUsd ?? 0).toFixed(2)} of $${options.limitUsd}`}`;
        })
        .join("; ");
      throw new Error(
        `All ${keys.length} API keys are used up or rejected (${why}). No request was sent.`,
      );
    },
    record(label, usage) {
      const ledger = load();
      const e = entry(ledger, find(label).fp);
      e.promptTokens += usage.promptTokens;
      e.completionTokens += usage.completionTokens;
      e.spentUsd += cost(usage);
      e.updatedAt = new Date().toISOString();
      save(ledger);
    },
    retire(label, reason) {
      const ledger = load();
      const e = entry(ledger, find(label).fp);
      e.retired = reason;
      e.updatedAt = new Date().toISOString();
      save(ledger);
    },
    status() {
      const ledger = load();
      return keys.map((k) => ({
        label: k.label,
        fingerprint: k.fp,
        spentUsd: ledger[k.fp]?.spentUsd ?? 0,
        promptTokens: ledger[k.fp]?.promptTokens ?? 0,
        completionTokens: ledger[k.fp]?.completionTokens ?? 0,
        retired: ledger[k.fp]?.retired,
      }));
    },
  };
}
// Errors that mean "this key cannot be used", as opposed to transient rate limits.
export function keyProblem(status: number, body: string): string | null {
  const code = (() => {
    try {
      const e = JSON.parse(body).error;
      return `${e?.code ?? ""} ${e?.type ?? ""} ${e?.message ?? ""}`;
    } catch {
      return body.slice(0, 200);
    }
  })();
  if (status === 402) return `out of credit (HTTP 402 ${code.trim()})`.trim();
  if (
    /insufficient[_ ]quota|credit|billing|balance|payment|spend(ing)?[_ ]limit/i.test(
      code,
    )
  )
    return `out of credit (HTTP ${status}: ${code.trim()})`;
  if (status === 401) return `rejected (HTTP 401: ${code.trim()})`;
  return null;
}
