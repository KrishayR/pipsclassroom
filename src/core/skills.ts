import { analyze, fromBoard, legalMoves, move, draw, hash } from "./engine";
import { focusApplies } from "./curriculum";
import type { Board, Direction, Lesson, Skill, Workspace } from "./types";
export const DEFAULT_SKILL: Skill = {
  id: "compare_escape_moves",
  name: "Compare possible moves",
  version: 1,
  depth: 2,
  spaceWeight: 12,
  structureWeight: 1,
  mergeWeight: 1,
  riskWeight: 100,
};
export const SIMULATION_CAP = 96;
export function validateSkill(value: unknown): Skill {
  if (!value || typeof value !== "object") throw new Error("Missing skill.");
  const s = value as Skill;
  if (
    s.id !== "compare_escape_moves" ||
    typeof s.name !== "string" ||
    s.name.length > 100
  )
    throw new Error("Unknown skill procedure.");
  for (const [key, min, max] of [
    ["depth", 1, 4],
    ["spaceWeight", 0, 40],
    ["structureWeight", 0, 8],
    ["mergeWeight", 0, 8],
    ["riskWeight", 20, 300],
    ["version", 1, 10000],
  ] as const)
    if (!Number.isFinite(s[key]) || s[key] < min || s[key] > max)
      throw new Error(`Invalid skill parameter: ${key}`);
  if (!Number.isInteger(s.depth) || !Number.isInteger(s.version))
    throw new Error("Depth and version must be integers.");
  return { ...s };
}
export const LESSON_TRIGGERS = [
  "always",
  "crowded boards",
  // Uses the same definition as the curriculum's skill checks for the lesson's focus.
  "when the skill applies",
] as const;
export function lessonApplies(lesson: Lesson, board: Board) {
  if (lesson.trigger === "always") return true;
  if (lesson.trigger === "when the skill applies")
    return !!lesson.focus && focusApplies(lesson.focus, board);
  return analyze(board).empty <= 6;
}
export function activeLessons(workspace: Workspace, board: Board) {
  return workspace.lessons
    .filter((l) => l.status === "verified" && lessonApplies(l, board))
    .slice(-3);
}
function utility(board: Board, gain: number, s: Skill) {
  const f = analyze(board);
  return (
    f.empty * s.spaceWeight -
    f.roughness * s.structureWeight +
    (f.corner ? 8 : 0) * s.structureWeight +
    Math.log2(1 + gain) * s.mergeWeight -
    (f.legal === 0 ? s.riskWeight : 0)
  );
}
export interface Ranking {
  action: Direction;
  value: number;
  lossRate: number;
  meanEmpty: number;
  samples: number;
}
// Cache only deterministic planning, never model replies. Logical transitions
// still count toward the same planning budget when the answer is reused.
const planningCache = new Map<
  string,
  { ranking: Ranking[]; transitions: number }
>();
const PLANNING_CACHE_LIMIT = 512;
let cacheHits = 0,
  cacheMisses = 0;
export function clearPlanningCache() {
  planningCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}
export const planningCacheStats = () => ({
  hits: cacheHits,
  misses: cacheMisses,
  size: planningCache.size,
  limit: PLANNING_CACHE_LIMIT,
});
export function simulate(
  board: Board,
  skill: Skill,
  seed: number,
  budget = SIMULATION_CAP,
  actions = legalMoves(board),
  useCache = true,
): { ranking: Ranking[]; transitions: number } {
  validateSkill(skill);
  const legal = legalMoves(board);
  if (actions.some((a) => !legal.includes(a)))
    throw new Error("Simulation requires legal actions.");
  const cap = Math.min(SIMULATION_CAP, Math.max(0, Math.floor(budget)));
  // Include the full skill and action order; seed and cap strings distinguish
  // non-finite values instead of JSON's null coercion. Validation runs on hits too.
  const cacheKey = JSON.stringify([
    board,
    [
      skill.id,
      skill.name,
      skill.version,
      skill.depth,
      skill.spaceWeight,
      skill.structureWeight,
      skill.mergeWeight,
      skill.riskWeight,
    ],
    String(seed),
    String(cap),
    actions,
  ]);
  const cached = useCache ? planningCache.get(cacheKey) : undefined;
  if (cached) {
    cacheHits++;
    planningCache.delete(cacheKey);
    planningCache.set(cacheKey, cached);
    return structuredClone(cached);
  }
  if (useCache) cacheMisses++;
  let used = 0;
  const rows = new Map<
    Direction,
    { total: number; loss: number; space: number; n: number }
  >();
  actions.forEach((a) => rows.set(a, { total: 0, loss: 0, space: 0, n: 0 }));
  // Round-robin allocation gives each candidate equal search opportunity. Independent RNG never sees game.rng.
  while (used + actions.length * skill.depth <= cap && actions.length) {
    for (const action of actions) {
      const row = rows.get(action)!;
      let g = fromBoard(board, hash(`${seed}:${action}:${row.n}`));
      let r = hash(`branch:${seed}:${row.n}`);
      g = move(g, action).game;
      used++;
      for (let depth = 1; depth < skill.depth; depth++) {
        const options = legalMoves(g.board);
        if (!options.length) {
          used++;
          continue;
        }
        const [u, n] = draw(r);
        r = n;
        g = move(g, options[Math.floor(u * options.length)]).game;
        used++;
      }
      row.total += utility(g.board, g.score, skill);
      row.loss += g.over ? 1 : 0;
      row.space += analyze(g.board).empty;
      row.n++;
    }
  }
  const result = {
    ranking: Array.from(rows, ([action, v]) => ({
      action,
      value: v.n ? v.total / v.n : -Infinity,
      lossRate: v.n ? v.loss / v.n : 0,
      meanEmpty: v.n ? v.space / v.n : 0,
      samples: v.n,
    })).sort((a, b) => b.value - a.value),
    transitions: used,
  };
  if (useCache) {
    if (planningCache.size >= PLANNING_CACHE_LIMIT)
      planningCache.delete(planningCache.keys().next().value!);
    planningCache.set(cacheKey, structuredClone(result));
  }
  return result;
}
export function emptyWorkspace(): Workspace {
  return { version: 1, lessons: [], skill: { ...DEFAULT_SKILL } };
}
export const MEMORY_LESSONS = 3;
// One active lesson per focus: a newer verified lesson supersedes a duplicate or
// contradictory one. When full, the least-supported lesson (lowest practice gain) leaves.
export function mergeLessons(
  lessons: import("./types").Lesson[],
  lesson: import("./types").Lesson,
) {
  const kept = lessons.filter(
    (l) => l.id !== lesson.id && !(lesson.focus && l.focus === lesson.focus),
  );
  while (kept.length >= MEMORY_LESSONS) {
    const weakest = kept.reduce((a, b) =>
      (b.verification?.meanDelta ?? 0) < (a.verification?.meanDelta ?? 0)
        ? b
        : a,
    );
    kept.splice(kept.indexOf(weakest), 1);
  }
  return [...kept, lesson];
}
export function installLesson(
  workspace: Workspace,
  lesson: import("./types").Lesson,
): Workspace {
  if (lesson.status !== "verified" || !lesson.verification?.accepted)
    throw new Error("Only independently verified lessons may be installed.");
  const lessons = mergeLessons(workspace.lessons, lesson);
  if (
    lessons.reduce(
      (n, l) => n + l.rule.length + l.trigger.length + l.exception.length,
      0,
    ) > 1600
  )
    throw new Error("Active memory exceeds 1,600 character cap.");
  return {
    version: workspace.version + 1,
    lessons,
    skill: validateSkill(lesson.skill),
  };
}
