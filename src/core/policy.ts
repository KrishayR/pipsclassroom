import {
  analyze,
  fromBoard,
  hash,
  move,
  observe,
  snapshotPool,
} from "./engine";
import { activeLessons, lessonMoves, lessonObjects, simulate } from "./skills";
import { focusApplies, focusName, focusOutcome } from "./curriculum";
import type {
  Board,
  Focus,
  LessonLimits,
  Policy,
  Skill,
  StrategyExperiment,
  ToolEvent,
  Workspace,
} from "./types";
// The move a student plans without a model. Lessons step in only when the top-ranked
// move breaks their skill; then the best-ranked move that every objecting lesson
// recommends (within its limits) is taken, unless its sampled loss rate is more than
// 0.25 above the top move's. Otherwise the top-ranked move stands.
export function plannedMove(board: Board, workspace: Workspace, seed: number) {
  const result = simulate(board, workspace.skill, seed);
  const lessons = activeLessons(workspace, board).filter((l) => l.focus);
  const top = result.ranking[0];
  const objecting = top
    ? lessons.filter((l) => lessonObjects(l, board, top.action))
    : [];
  const allowed = objecting.map((l) => lessonMoves(l, board));
  const pick = objecting.length
    ? result.ranking.find(
        (r) =>
          allowed.every((moves) => moves.includes(r.action)) &&
          r.lossRate <= top.lossRate + 0.25,
      )
    : undefined;
  return {
    action: (pick ?? top)?.action,
    lessonId: pick ? objecting[0].id : undefined,
    result,
    lessons,
  };
}
// How many sample boards a candidate workspace plans a different move on. Used before
// verification to catch candidates that cannot change behaviour.
export function lessonSensitivity(
  current: Workspace,
  candidate: Workspace,
  boards: { board: Board; seed: number }[],
) {
  return {
    boards: boards.length,
    changed: boards.filter(
      (b) =>
        plannedMove(b.board, current, b.seed).action !==
        plannedMove(b.board, candidate, b.seed).action,
    ).length,
  };
}
// Fixed strategy changes screened over full development games, where each scored
// higher than the default strategy (docs/LESSON_ACCEPTANCE.md). Values are absolute.
export const STRATEGY_PROBES: { change: string; skill: Partial<Skill> }[] = [
  {
    change: "depth 3, spaceWeight 6, mergeWeight 8",
    skill: { depth: 3, spaceWeight: 6, mergeWeight: 8 },
  },
  {
    change: "depth 3, spaceWeight 4, mergeWeight 8",
    skill: { depth: 3, spaceWeight: 4, mergeWeight: 8 },
  },
  {
    change: "depth 3, spaceWeight 4, mergeWeight 8, structureWeight 2",
    skill: { depth: 3, spaceWeight: 4, mergeWeight: 8, structureWeight: 2 },
  },
  {
    change: "depth 4, spaceWeight 4, mergeWeight 8",
    skill: { depth: 4, spaceWeight: 4, mergeWeight: 8 },
  },
  {
    change: "spaceWeight 6, mergeWeight 8",
    skill: { spaceWeight: 6, mergeWeight: 8 },
  },
];
// Free offline trials the teacher can cite: each probe's strategy plays against the
// current one with the same paired short rollouts and utility as verification, on
// separate experiment boards that verification never uses. Noisy estimates only.
export function strategyExperiments(
  current: Workspace,
  focus: Focus,
  key: string,
  round: number,
  boards = { practice: 12, regression: 4, moves: 4 },
): StrategyExperiment[] {
  const play = (workspace: Workspace, s: { board: Board; seed: number }) => {
    let game = fromBoard(s.board, s.seed);
    for (let i = 0; i < boards.moves && !game.over; i++)
      game = move(
        game,
        plannedMove(game.board, workspace, hash(`verify-plan:${s.seed}:${i}`))
          .action!,
      ).game;
    return game.score / 8 + game.moves + observe(game).empty * 2;
  };
  const pools = {
    targeted: snapshotPool(
      "experiment-practice",
      round,
      { key: `${focus}:${key}`, applies: (b) => focusApplies(focus, b) },
      boards.practice,
    ),
    general: snapshotPool(
      "experiment-regression",
      round,
      // No focus filter: the key only keeps each student's boards separate.
      { key, applies: () => false },
      boards.regression,
    ),
  };
  const baseline = {
    targeted: pools.targeted.map((s) => play(current, s)),
    general: pools.general.map((s) => play(current, s)),
  };
  const gain = (split: "targeted" | "general", workspace: Workspace) =>
    pools[split].reduce(
      (n, s, i) => n + play(workspace, s) - baseline[split][i],
      0,
    ) / pools[split].length;
  return STRATEGY_PROBES.filter((p) =>
    Object.entries(p.skill).some(
      ([k, v]) => current.skill[k as keyof Skill] !== v,
    ),
  )
    .map((p) => {
      const skill = {
        ...current.skill,
        ...p.skill,
        version: current.skill.version + 1,
      };
      const workspace = { ...current, skill };
      return {
        change: p.change,
        skill,
        targeted: gain("targeted", workspace),
        general: gain("general", workspace),
        boards,
      };
    })
    .sort((a, b) => b.targeted + b.general - (a.targeted + a.general));
}
export function simulationPolicy(): Policy {
  return {
    mode: "simulation",
    async decide(observation, workspace, seed) {
      const tools: ToolEvent[] = [];
      const tool = <T>(name: string, args: unknown, fn: () => T): T => {
        const t = performance.now();
        const result = fn();
        tools.push({ name, args, result, durationMs: performance.now() - t });
        return result;
      };
      tool("observe_board", {}, () => observation);
      tool("analyze_board", {}, () => analyze(observation.board));
      const plan = tool(
        "run_skill",
        {
          skill_id: workspace.skill.id,
          version: workspace.skill.version,
          depth: workspace.skill.depth,
        },
        () => plannedMove(observation.board, workspace, seed),
      );
      tool(
        "retrieve_lessons",
        { context: observation.empty <= 6 ? "crowded" : "open" },
        () => plan.lessons.map((l) => ({ id: l.id, rule: l.rule })),
      );
      if (!plan.action) throw new Error("No legal moves.");
      const top = plan.result.ranking[0].action;
      const name = (d: string) => d[0].toUpperCase() + d.slice(1);
      return {
        action: plan.action,
        lessonId: plan.lessonId,
        summary:
          plan.action !== top
            ? `${name(top)} ranked highest, but my saved lesson points to ${plan.action}, so I followed the lesson.`
            : `I tried ${plan.result.ranking.length} possible directions. ${name(plan.action)} looked most promising${plan.lessons.length ? " and fits my saved lessons" : ""}. You can open the tool results to see what I checked.`,
        tools,
        tokens: 0,
        calls: 0,
        simulations: plan.result.transitions,
      };
    },
    async propose(student, arm, peer, choice, options) {
      const traces = student.traces.slice(-100);
      if (!traces.length)
        throw new Error("Practice first so there is evidence to review.");
      const focus = choice?.focus ?? "space";
      // Prefer the move that failed the focus check and lost the most room.
      const failed = traces.filter(
        (t) => focusOutcome(focus, t.before, t.after) === false,
      );
      const applicable = traces.filter(
        (t) => focusOutcome(focus, t.before, t.after) !== null,
      );
      const critical = [
        ...(failed.length ? failed : applicable.length ? applicable : traces),
      ].sort(
        (a, b) =>
          a.after.empty - a.before.empty - (b.after.empty - b.before.empty),
      )[0];
      const old = student.workspace.skill;
      const skill = { ...old, version: old.version + 1 };
      const nudge = (scale: number) => {
        if (focus === "space")
          skill.spaceWeight = Math.min(40, skill.spaceWeight + 3 * scale);
        else if (focus === "structure")
          skill.structureWeight = Math.min(
            8,
            skill.structureWeight + 0.5 * scale,
          );
        else {
          skill.depth = Math.min(4, skill.depth + 1);
          skill.riskWeight = Math.min(300, skill.riskWeight + 20 * scale);
        }
      };
      // The best free experiment with a net gain is adopted as the strategy change (a
      // revision tries a different one than the rejected lesson); otherwise the focus
      // parameter is nudged. Verification still decides.
      const rejected = options?.rejection?.skill;
      const tried = options?.experiments?.find(
        (e) =>
          e.targeted + e.general > 0 &&
          !(
            rejected &&
            (
              [
                "depth",
                "spaceWeight",
                "structureWeight",
                "mergeWeight",
              ] as const
            ).every((k) => e.skill[k] === rejected[k])
          ),
      );
      if (tried) Object.assign(skill, tried.skill);
      else nudge(1);
      // Peers contribute only a recorded move that passed the same focus check.
      const peerTrace = peer?.traces
        .filter((t) => focusOutcome(focus, t.before, t.after) === true)
        .at(-1);
      const peerLesson = peer?.workspace.lessons
        .filter((l) => l.status === "verified" && l.focus === focus)
        .at(-1);
      // An adopted experiment is kept as tested; peers still supply evidence.
      if (arm === "classroom" && peerTrace && !tried) {
        if (peerLesson)
          for (const key of [
            "spaceWeight",
            "structureWeight",
            "depth",
          ] as const)
            skill[key] =
              key === "depth"
                ? Math.max(skill.depth, peerLesson.skill.depth)
                : (skill[key] + peerLesson.skill[key]) / 2;
        else nudge(Math.max(1, peerTrace.after.empty - peerTrace.before.empty));
      }
      // Conditional by default: step in only where the move breaks the skill, keep at
      // least three options and give up at most a small merge. After a rejection, the
      // revision narrows the limits further. With an adopted experiment the strategy
      // carries the change, so the rule only steps in when nothing is given up.
      const prior = options?.rejection?.limits;
      const limits: LessonLimits = tried
        ? { minOptions: 4, maxGainLoss: 0 }
        : prior
          ? {
              minOptions: Math.min(4, prior.minOptions + 1),
              maxGainLoss: Math.max(0, (prior.maxGainLoss ?? 16) / 2),
            }
          : { minOptions: 3, maxGainLoss: 8 };
      // If the change would not alter any planned move on the sample boards, strengthen
      // it (within bounds) up to three times; verification still decides.
      for (
        let n = 0;
        n < 3 &&
        !tried &&
        options?.check?.({
          skill,
          trigger: "when the skill applies",
          focus,
          limits,
        });
        n++
      ) {
        nudge(2 ** (n + 1));
        limits.maxGainLoss = (limits.maxGainLoss ?? 8) * 2;
      }
      const name = focusName(focus);
      const source =
        arm === "solo"
          ? "Self-review"
          : arm === "classroom"
            ? peerTrace
              ? `Teacher + ${peer!.name}`
              : "Teacher (no relevant peer evidence)"
            : "Teacher";
      const evidence = [
        critical.id,
        ...(arm === "classroom" && peerTrace ? [peerTrace.id] : []),
      ];
      const lesson = {
        space: {
          title: "Preserve room before chasing merges",
          rule: "When space is limited, compare candidate moves using sampled continuations. Prefer room and future legal options over immediate score when the evidence supports it.",
        },
        structure: {
          title: "Keep the largest tile anchored",
          rule: "When a large tile sits in a corner, prefer moves that keep it there and keep neighbouring tiles ordered, unless every such move loses room.",
        },
        planning: {
          title: "Look past the first merge",
          rule: "Before taking a merge, check how many legal moves remain afterwards. Prefer merges that keep at least three options open.",
        },
      }[focus];
      return {
        lesson: {
          ...lesson,
          trigger: "when the skill applies",
          limits,
          exception:
            "A large merge may still be best when it opens space. Simulation is a noisy estimate.",
          source,
          evidence,
          focus,
          skill,
        },
        messages: [
          {
            role: arm === "solo" ? "student" : "teacher",
            title:
              arm === "solo"
                ? `${student.name} reviews their attempt`
                : `Teacher → ${student.name}`,
            text: `Let’s work on “${name}”. That ${critical.action} move took you from ${critical.before.empty} open spaces to ${critical.after.empty}. It’s an idea to test, not a sure fix.`,
            evidence: [critical.id],
          },
          ...(arm === "classroom" && peerTrace
            ? [
                {
                  role: "peer" as const,
                  title: `${peer!.name} → ${student.name}`,
                  text: `On a similar board my ${peerTrace.action} move passed the “${name}” check (${peerTrace.before.empty} → ${peerTrace.after.empty} open spaces). Maybe that helps you too. I’ve shared that move so you can check it yourself.`,
                  evidence: [peerTrace.id],
                },
              ]
            : []),
          {
            role: "student" as const,
            title: `${student.name} makes a plan`,
            text:
              arm === "classroom" && peerTrace
                ? `I’ll try ${peer!.name}’s idea on different boards. If it helps without hurting my other attempts, I’ll keep it in my notes.`
                : "I’ll try this on different boards before I keep it. A good explanation still needs a fair test.",
            evidence,
          },
        ],
        tokens: 0,
        calls: 0,
      };
    },
  };
}
export function decisionSeed(episodeId: string, move: number): number {
  return hash(`planner:${episodeId}:${move}`);
}
