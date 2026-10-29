import { analyze, hash } from "./engine";
import { activeLessons, simulate } from "./skills";
import { focusName, focusOutcome } from "./curriculum";
import type { Policy, ToolEvent } from "./types";
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
      const lessons = tool(
        "retrieve_lessons",
        { context: observation.empty <= 6 ? "crowded" : "open" },
        () =>
          activeLessons(workspace, observation.board).map((l) => ({
            id: l.id,
            rule: l.rule,
          })),
      );
      tool("analyze_board", {}, () => analyze(observation.board));
      const result = tool(
        "run_skill",
        {
          skill_id: workspace.skill.id,
          version: workspace.skill.version,
          depth: workspace.skill.depth,
        },
        () => simulate(observation.board, workspace.skill, seed),
      );
      const best = result.ranking[0];
      if (!best) throw new Error("No legal moves.");
      return {
        action: best.action,
        summary: `I tried ${result.ranking.length} possible directions. ${best.action[0].toUpperCase() + best.action.slice(1)} looked most promising${lessons.length ? " with my saved lessons in mind" : ""}. You can open the tool results to see what I checked.`,
        tools,
        tokens: 0,
        calls: 0,
        simulations: result.transitions,
      };
    },
    async propose(student, arm, peer, choice) {
      const traces = student.traces.slice(-100);
      if (!traces.length)
        throw new Error("Practice first so there is evidence to review.");
      const focus = choice?.focus ?? "space";
      // Prefer the move that failed the focus check and lost the most room.
      const failed = traces.filter(
        (t) => focusOutcome(focus, t.before, t.after) === false,
      );
      const critical = [...(failed.length ? failed : traces)].sort(
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
      nudge(1);
      // Peers contribute only a recorded move that passed the same focus check.
      const peerTrace = peer?.traces
        .filter((t) => focusOutcome(focus, t.before, t.after) === true)
        .at(-1);
      const peerLesson = peer?.workspace.lessons
        .filter((l) => l.status === "verified" && l.focus === focus)
        .at(-1);
      if (arm === "classroom" && peerTrace) {
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
          trigger: focus === "space" ? "crowded boards" : "always",
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
