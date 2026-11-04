import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteFileSync } from "../server/persistence";

test("atomic saves recover from transient Windows locks without losing the old file", (t) => {
  const root = fs.mkdtempSync(join(tmpdir(), "cl-persistence-"));
  const path = join(root, "status.json");
  fs.writeFileSync(path, "old");
  const rename = fs.renameSync;
  let calls = 0;
  t.mock.method(Atomics, "wait", () => "timed-out");
  t.mock.method(fs, "renameSync", (from: string, to: string) => {
    assert.equal(fs.readFileSync(path, "utf8"), "old");
    if (++calls < 3)
      throw Object.assign(new Error("locked"), { code: "EPERM" });
    rename(from, to);
  });
  atomicWriteFileSync(path, "new");
  assert.equal(calls, 3);
  assert.equal(fs.readFileSync(path, "utf8"), "new");
});

test("persistent locks stop saving after bounded retries and preserve both versions", (t) => {
  const root = fs.mkdtempSync(join(tmpdir(), "cl-persistence-"));
  const path = join(root, "status.json");
  fs.writeFileSync(path, "old");
  const failure = Object.assign(new Error("locked"), { code: "EPERM" });
  const rename = t.mock.method(fs, "renameSync", () => {
    throw failure;
  });
  t.mock.method(Atomics, "wait", () => "timed-out");
  assert.throws(() => atomicWriteFileSync(path, "new"), failure);
  assert.equal(rename.mock.callCount(), 6);
  assert.equal(fs.readFileSync(path, "utf8"), "old");
  const temporary = fs.readdirSync(root).find((name) => name.endsWith(".tmp"))!;
  assert.equal(fs.readFileSync(join(root, temporary), "utf8"), "new");
});

test("unrelated save failures are reported without retries", (t) => {
  const root = fs.mkdtempSync(join(tmpdir(), "cl-persistence-"));
  const failure = Object.assign(new Error("no space"), { code: "ENOSPC" });
  const rename = t.mock.method(fs, "renameSync", () => {
    throw failure;
  });
  assert.throws(
    () => atomicWriteFileSync(join(root, "status.json"), "new"),
    failure,
  );
  assert.equal(rename.mock.callCount(), 1);
});
