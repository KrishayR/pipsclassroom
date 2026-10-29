import { Classroom } from "./core/classroom";
import { simulationPolicy } from "./core/policy";
import type { LabState, Mode, Arm } from "./core/types";
export interface Connection {
  kind: "server" | "browser";
  modelAvailable: boolean;
  modelId: string | null;
  tokenBudget?: number;
  keys?: { label: string; spentUsd: number; retired?: string }[];
  protocol?: Partial<
    Record<
      Mode,
      { verify: { practice: number; regression: number; moves: number } }
    >
  >;
}
let local: Classroom | null = null;
function browserLab() {
  if (!local) {
    let stored: LabState | undefined;
    try {
      const raw = localStorage.getItem("consequencelab-v1");
      if (raw) {
        const value = JSON.parse(raw);
        if (value.schemaVersion === 1 && value.mode === "simulation")
          stored = value;
      }
    } catch {
      /* Recover from corrupt browser storage. */
    }
    local = new Classroom(simulationPolicy(), stored);
    local.subscribe((s) => {
      try {
        localStorage.setItem("consequencelab-v1", JSON.stringify(s));
      } catch {
        /* Export remains available if browser storage is full. */
      }
    });
  }
  return local;
}
export async function connect(): Promise<Connection> {
  try {
    const r = await fetch("/api/health", { signal: AbortSignal.timeout(1500) });
    if (!r.ok) throw new Error();
    const h = await r.json();
    if (!h.ok) throw new Error();
    return {
      kind: "server",
      modelAvailable: h.modelAvailable,
      modelId: h.modelId,
      tokenBudget: h.tokenBudget,
      protocol: h.protocol,
      keys: h.keys,
    };
  } catch {
    return { kind: "browser", modelAvailable: false, modelId: null };
  }
}
export async function watch(
  connection: Connection,
  mode: Mode,
  listener: (s: LabState) => void,
): Promise<() => void> {
  if (connection.kind === "browser") {
    const lab = browserLab();
    listener(structuredClone(lab.state));
    return lab.subscribe(listener);
  }
  const response = await fetch(`/api/state?mode=${mode}`);
  if (!response.ok) throw new Error("Could not load classroom.");
  listener(await response.json());
  const events = new EventSource(`/api/events?mode=${mode}`);
  events.onmessage = (e) => listener(JSON.parse(e.data));
  return () => events.close();
}
export async function action(
  connection: Connection,
  mode: Mode,
  name: string,
  params: Record<string, unknown> = {},
) {
  if (connection.kind === "server") {
    const response = await fetch(`/api/action?mode=${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: name, ...params }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    return;
  }
  const lab = browserLab();
  switch (name) {
    case "diagnose":
      return lab.diagnose();
    case "practice":
      return lab.practice((params.steps as number) ?? 12);
    case "review":
      return lab.review(params.studentId as string);
    case "verify":
      return lab.verify();
    case "exam":
      return lab.exam(
        (params.seedCount as number) ?? 3,
        (params.cap as number) ?? 1500,
      );
    case "compare":
      return lab.compare((params.cap as number) ?? 1500);
    case "rollback":
      return lab.rollback(params.studentId as string);
    case "arm":
      return lab.setArm(params.arm as Arm);
    case "stop":
      return lab.stop();
    case "reset":
      return lab.reset();
    default:
      throw new Error("Unknown action");
  }
}
export async function exportRun(connection: Connection, mode: Mode) {
  return connection.kind === "browser"
    ? browserLab().export()
    : fetch(`/api/export?mode=${mode}`).then((r) => r.json());
}
