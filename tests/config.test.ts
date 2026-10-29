import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "../server/config";

test("environment files load Windows and Unix line endings without replacing existing settings", () => {
  const directory = mkdtempSync(join(tmpdir(), "consequencelab-config-"));
  const path = join(directory, "settings.env");
  const name = "CONSEQUENCELAB_TEST_SETTING";
  const previous = process.env[name];
  try {
    for (const newline of ["\r\n", "\n"]) {
      delete process.env[name];
      writeFileSync(
        path,
        `# Example settings${newline}${name}=\"test-value\"${newline}`,
      );
      loadEnv(path);
      assert.equal(process.env[name], "test-value");
      process.env[name] = "existing-value";
      loadEnv(path);
      assert.equal(process.env[name], "existing-value");
    }
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
    rmSync(path, { force: true });
    rmdirSync(directory);
  }
});
