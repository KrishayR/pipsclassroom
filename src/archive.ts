import type { LabState } from "./core/types";

export interface ArchiveFile {
  name: string;
  content: string;
}

export function classroomSummary(state: LabState): string {
  const lines = [
    "# Classroom report",
    "",
    `Mode: ${state.mode} | Phase: ${state.phase} | Classroom: ${state.id}`,
    `Model: ${state.modelId ?? "local simulation"} | Planner: ${state.plannerEnabled === false ? "off" : "on"}`,
    `Recorded tokens: ${state.tokens} | Calls: ${state.calls}`,
    "",
    "## Students",
    "",
    "Student | Practice moves | Focused practice moves | Current lessons | Workspace version",
    "--- | ---: | ---: | ---: | ---:",
  ];
  for (const s of state.students)
    lines.push(
      `${s.name} | ${s.traces.filter((t) => !t.exercise).length} | ${s.traces.filter((t) => t.exercise).length} | ${s.workspace.lessons.length} | ${s.workspace.version}`,
    );
  lines.push(
    "",
    "## Exams (chronological)",
    "",
    "The first recorded exam is the baseline in a standard learning session. Incomplete exams are marked. Scores from one session do not establish improvement beyond chance.",
  );
  for (const [i, exam] of state.exams.entries()) {
    lines.push(
      "",
      `### Exam ${i + 1}: ${exam.startedAt} (${exam.completedAt ? "complete" : "incomplete"})`,
      "",
      "Student | Seed | Score | Highest tile | Moves | Outcome",
      "--- | ---: | ---: | ---: | ---: | ---",
    );
    for (const r of exam.rows)
      lines.push(
        `${r.name} | ${r.seed} | ${r.score} | ${r.highest} | ${r.moves} | ${r.terminal}`,
      );
  }
  lines.push("", "## Lesson decisions", "");
  for (const l of state.ledger)
    lines.push(
      `- ${l.title}: ${l.status}${l.verification ? `; targeted delta ${l.verification.meanDelta}, general delta ${l.verification.regressionDelta}` : ""}. ${l.rule}`,
    );
  if (!state.ledger.length) lines.push("No lesson decisions recorded.");
  lines.push(
    "",
    "## Recorded classroom conversation",
    "",
    "Only retained messages are available (currently capped at the latest 100 per snapshot). These are recorded classroom messages, not private model reasoning.",
  );
  for (const m of state.messages)
    lines.push("", `### ${m.time} — ${m.role}: ${m.title}`, "", m.text);
  return lines.join("\n") + "\n";
}

// Store ZIP entries without compression: export never adds work to the server's simulation loop.
export function zipArchive(files: ArchiveFile[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const directory: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name),
      data = encoder.encode(file.content);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + name.length),
      lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x800, true);
    lv.setUint16(12, 33, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length),
      cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    parts.push(local, data);
    directory.push(central);
    offset += local.length + data.length;
  }
  const directorySize = directory.reduce((n, p) => n + p.length, 0);
  if (files.length >= 65535 || offset + directorySize > 0xffffffff)
    throw new Error("Archive exceeds standard ZIP size limits.");
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: "application/zip" });
}
