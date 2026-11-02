import test from "node:test";
import assert from "node:assert/strict";
import { DEV_SEEDS } from "../src/core/evaluation";
import { DEFAULT_SKILL, emptyWorkspace } from "../src/core/skills";
import {
  FULL_GAME_SEEDS,
  fullGameRows,
  fullGameSummary,
} from "../scripts/lib/full-game-check";

test("the full-game check uses fresh seeds, plays to the end and pairs against untrained notes", async () => {
  assert.ok(FULL_GAME_SEEDS.every((s) => !DEV_SEEDS.includes(s)));
  const student = { id: "student-1", name: "Ada", workspace: emptyWorkspace() };
  const untrained = await fullGameRows([student], "solo", 1);
  assert.equal(untrained.length, 1);
  assert.equal(untrained[0].terminal, "loss");
  assert.equal(untrained[0].trajectory, undefined);
  assert.equal(fullGameSummary(untrained, untrained).vsUntrained.meanDiff, 0);
  const changed = await fullGameRows(
    [
      {
        ...student,
        workspace: {
          ...emptyWorkspace(),
          skill: { ...DEFAULT_SKILL, version: 2, mergeWeight: 8 },
        },
      },
    ],
    "solo",
    1,
    1,
  );
  const s = fullGameSummary(changed, untrained);
  assert.equal(s.vsUntrained.pairs, 1);
  assert.equal(s.vsUntrained.meanDiff, changed[0].score - untrained[0].score);
});
