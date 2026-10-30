import test from "node:test";
import assert from "node:assert/strict";
import { studentHelper } from "../server/config";

test("both helper settings disable rankings consistently and neither can override the other off", () => {
  const keys = ["MODEL_STUDENT_HELPER", "MODEL_USE_PLANNER"] as const;
  const previous = keys.map((k) => process.env[k]);
  try {
    for (const [helper, planner, enabled] of [
      [undefined, undefined, true],
      ["off", undefined, false],
      [undefined, "false", false],
      ["on", "false", false],
      ["off", "true", false],
      ["on", "true", true],
    ] as const) {
      for (const [i, value] of [helper, planner].entries())
        if (value === undefined) delete process.env[keys[i]];
        else process.env[keys[i]] = value;
      assert.equal(studentHelper(), enabled);
    }
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});
