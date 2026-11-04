import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { ARMS, Classroom } from "../src/core/classroom";
import { simulationPolicy } from "../src/core/policy";
import {
  loadEnv,
  modelFromEnv,
  protocolFromEnv,
  studentHelper,
} from "./config";
import type { Arm, LabState } from "../src/core/types";
import { liveBatchRunner } from "./batch";
import { checkpointFiles } from "./archive";
import { listRecordings, loadRecording } from "./recordings";
loadEnv();
mkdirSync("data", { recursive: true });
const db = new DatabaseSync(resolve("data/classroom.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sessions (mode TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, mode TEXT NOT NULL, phase TEXT NOT NULL, time TEXT NOT NULL, detail TEXT NOT NULL)",
);
const real = modelFromEnv();
const usageOffsets = new Map<string, { tokens: number; calls: number }>();
const classes = new Map<string, Classroom>();
const clients = new Map<string, Set<import("node:http").ServerResponse>>();
const batch = liveBatchRunner(() => classes.get("model")?.emit());
for (const policy of [simulationPolicy(), ...(real ? [real] : [])]) {
  const stored = db
    .prepare("SELECT state FROM sessions WHERE mode=?")
    .get(policy.mode) as { state: string } | undefined;
  const lab = new Classroom(
    policy,
    stored ? (JSON.parse(stored.state) as LabState) : undefined,
    protocolFromEnv(policy.mode),
  );
  usageOffsets.set(policy.mode, {
    tokens: lab.state.tokens,
    calls: lab.state.calls,
  });
  classes.set(policy.mode, lab);
  clients.set(policy.mode, new Set());
  lab.subscribe((state) => {
    const safe = publicState(state);
    db.prepare("INSERT OR REPLACE INTO sessions VALUES (?,?,?)").run(
      policy.mode,
      JSON.stringify({
        ...state,
        tokens:
          state.mode === "model" && real
            ? (usageOffsets.get("model")?.tokens ?? 0) + real.usage().tokens
            : state.tokens,
        calls:
          state.mode === "model" && real
            ? (usageOffsets.get("model")?.calls ?? 0) + real.usage().calls
            : state.calls,
      }),
      new Date().toISOString(),
    );
    for (const res of clients.get(policy.mode)!)
      res.write(`data: ${JSON.stringify(safe)}\n\n`);
  });
}
function publicState(state: LabState) {
  const batchState = state.mode === "model" ? batch.state() : undefined;
  const safe = structuredClone(batchState ?? state);
  if (state.mode === "model") safe.liveBatch = batch.status();
  safe.students.forEach((s) => {
    s.game.rng = 0;
    s.game.seed = 0;
  });
  if (state.mode === "model" && real && !batchState) {
    const usage = real.usage();
    safe.tokens = (usageOffsets.get("model")?.tokens ?? 0) + usage.tokens;
    safe.calls = (usageOffsets.get("model")?.calls ?? 0) + usage.calls;
  }
  return safe;
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const send = (status: number, data: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  };
  if (!url.pathname.startsWith("/api/"))
    return send(404, { error: "Use the Vite frontend on port 5173." });
  if (
    req.headers.origin &&
    !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(req.headers.origin)
  )
    return send(403, { error: "Cross-origin access denied." });
  if (url.pathname === "/api/health")
    return send(200, {
      ok: true,
      modelAvailable: !!real,
      modelId: real?.modelId ?? null,
      plannerEnabled: real?.usesHelper !== false,
      storage: "SQLite",
      tokenBudget: Number(process.env.MODEL_TOKEN_BUDGET || 100000),
      // Fingerprints and estimated spend only; keys never leave the server.
      keys: real?.keyStatus() ?? [],
      protocol: {
        simulation: protocolFromEnv("simulation"),
        model: protocolFromEnv("model"),
        studentHelper: studentHelper(),
      },
    });
  // Saved live runs, shown read-only. No model calls are made.
  if (req.method === "GET" && url.pathname === "/api/recordings")
    return send(200, listRecordings());
  if (req.method === "GET" && url.pathname === "/api/recording") {
    try {
      return send(
        200,
        loadRecording(
          url.searchParams.get("id") ?? "",
          url.searchParams.get("stage") ?? "",
        ),
      );
    } catch (e) {
      return send(404, { error: e instanceof Error ? e.message : "Not found" });
    }
  }
  const mode = url.searchParams.get("mode") ?? "simulation";
  const lab = classes.get(mode);
  if (!lab)
    return send(409, {
      error: "Model mode needs MODEL_API_KEY in the server .env file.",
    });
  if (req.method === "GET" && url.pathname === "/api/state")
    return send(200, publicState(lab.state));
  if (req.method === "GET" && url.pathname === "/api/export-checkpoints") {
    try {
      return send(
        200,
        await checkpointFiles(
          mode === "model" ? batch.archiveStatus()?.directory : undefined,
        ),
      );
    } catch {
      return send(500, {
        error:
          "Could not read the live-run checkpoints. Please retry the export.",
      });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/export") {
    const exported = lab.export();
    const activeBatch = mode === "model" ? batch.state() : undefined;
    if (activeBatch) exported.state = structuredClone(activeBatch);
    return send(200, {
      ...exported,
      state: {
        ...exported.state,
        ...(mode === "model" ? { liveBatch: batch.status() } : {}),
        tokens: publicState(lab.state).tokens,
        calls: publicState(lab.state).calls,
      },
    });
  }
  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify(publicState(lab.state))}\n\n`);
    clients.get(mode)!.add(res);
    const timer = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    req.on("close", () => {
      clearInterval(timer);
      clients.get(mode)!.delete(res);
    });
    return;
  }
  if (req.method !== "POST" || url.pathname !== "/api/action")
    return send(404, { error: "Not found" });
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) throw new Error("Request too large.");
    }
    const input = JSON.parse(body || "{}");
    const { action } = input;
    if (action === "clear-progress") {
      if (mode !== "model")
        throw new Error("Select live model mode to clear session progress.");
      batch.clearProgress();
      lab.emit();
      return send(200, { ok: true });
    }
    if (action === "stop") {
      if (mode === "model" && batch.status()?.status === "running")
        batch.stop();
      lab.stop();
      return send(200, { ok: true });
    }
    if (lab.state.busy)
      return send(409, { error: "An operation is already running." });
    if (mode === "model" && batch.status()?.status === "running")
      return send(409, {
        error:
          "The live batch is running. Stop it before starting other live actions.",
      });
    let operation: Promise<void> | undefined;
    if (action === "live-batch") {
      if (mode !== "model")
        throw new Error("Select live model mode for the Muse batch.");
      if (
        !Number.isInteger(input.cycles ?? 5) ||
        (input.cycles ?? 5) < 1 ||
        (input.cycles ?? 5) > 100
      )
        throw new Error("Choose a whole number of cycles from 1 to 100.");
      operation = batch.start(input.cycles ?? 5, input.kind ?? "individual");
    } else if (action === "resume-batch") {
      if (mode !== "model")
        throw new Error("Select live model mode to resume.");
      operation = batch.resume();
    } else if (action === "practice")
      operation = lab.practice(input.steps ?? 12);
    else if (action === "diagnose") operation = lab.diagnose();
    else if (action === "review") operation = lab.review(input.studentId);
    else if (action === "verify") operation = lab.verify();
    else if (action === "exam")
      operation = lab.exam(input.seedCount ?? 3, input.cap ?? 1500);
    else if (action === "compare") operation = lab.compare(input.cap ?? 1500);
    else if (action === "reset") {
      if (mode === "model") batch.clearProgress();
      lab.reset();
    } else if (action === "rollback") lab.rollback(input.studentId);
    else if (action === "arm") {
      if (!ARMS.includes(input.arm)) throw new Error("Unknown condition.");
      lab.setArm(input.arm as Arm);
    } else throw new Error("Unknown action.");
    db.prepare(
      "INSERT INTO events (mode,phase,time,detail) VALUES (?,?,?,?)",
    ).run(mode, action, new Date().toISOString(), JSON.stringify(input));
    operation?.catch((error) =>
      console.error("Classroom operation:", error.message),
    );
    send(202, { ok: true });
  } catch (e) {
    send(400, { error: e instanceof Error ? e.message : "Invalid request" });
  }
});
const port = Number(process.env.PORT ?? 8787);
server.listen(port, "127.0.0.1", () =>
  console.log(
    `ConsequenceLab API: http://127.0.0.1:${port} · model ${real ? "configured" : "not configured"} · SQLite ready`,
  ),
);
process.on("SIGINT", () => {
  batch.stop();
  for (const lab of classes.values()) lab.stop();
  server.close();
  db.close();
  process.exit(0);
});
