import test from "node:test";
import assert from "node:assert/strict";
import { classroomSummary, zipArchive } from "../src/archive";
import { initialState } from "../src/core/classroom";
import { checkpointFiles } from "../server/archive";

test("ZIP stores readable files with correct CRC, sizes and central directory offsets", async () => {
  const blob = zipArchive([
    { name: "SUMMARY.md", content: "hello" },
    { name: "raw.json", content: '{"message":"你好"}' },
  ]);
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(blob.type, "application/zip");
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert.equal(bytes.readUInt32LE(14), 0x3610a686);
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt16LE(end + 10), 2);
  let central = bytes.readUInt32LE(end + 16);
  for (const [name, content] of [
    ["SUMMARY.md", "hello"],
    ["raw.json", '{"message":"你好"}'],
  ]) {
    assert.equal(bytes.readUInt32LE(central), 0x02014b50);
    const local = bytes.readUInt32LE(central + 42);
    const nameLength = bytes.readUInt16LE(local + 26);
    const size = bytes.readUInt32LE(local + 18);
    assert.equal(
      bytes.subarray(local + 30, local + 30 + nameLength).toString(),
      name,
    );
    assert.equal(
      bytes
        .subarray(local + 30 + nameLength, local + 30 + nameLength + size)
        .toString(),
      content,
    );
    central += 46 + bytes.readUInt16LE(central + 28);
  }
  assert.equal(central, end);
});

test("summary distinguishes retained conversations, focused practice and incomplete exams", () => {
  const state = initialState();
  state.messages.push({
    id: "m",
    role: "teacher",
    title: "Review",
    text: "Keep space open.",
    time: "now",
  });
  state.exams.push({
    id: "e",
    mode: state.mode,
    arm: state.arm,
    cap: 10,
    seeds: [],
    frozen: {},
    rows: [],
    startedAt: "now",
  });
  const summary = classroomSummary(state);
  assert.match(summary, /Focused practice moves/);
  assert.match(summary, /incomplete/);
  assert.match(summary, /Keep space open/);
  assert.match(summary, /latest 100/);
});

test("checkpoint exports reject paths outside the live-run data directory", async () => {
  assert.deepEqual(await checkpointFiles(), []);
  await assert.rejects(
    checkpointFiles("../live-batch-123"),
    /Invalid checkpoint directory/,
  );
});
