import { analyze, hash } from "./engine";
import { activeLessons, simulate } from "./skills";
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
    async propose(student, arm, peer) {
      const traces = student.traces.slice(-100);
      if (!traces.length)
        throw new Error("Practice first so there is evidence to review.");
      const critical = [...traces].sort(
        (a, b) =>
          a.after.empty - a.before.empty - (b.after.empty - b.before.empty),
      )[0];
      const crowded = critical.after.empty <= 6;
      const old = student.workspace.skill;
      const skill = {
        ...old,
        version: old.version + 1,
        depth: Math.min(4, old.depth + 1),
        spaceWeight: Math.min(40, old.spaceWeight + (crowded ? 6 : 2)),
        structureWeight: Math.min(8, old.structureWeight + 0.5),
      };
      const peerTrace = peer?.traces
        .filter((t) => t.after.empty > t.before.empty)
        .at(-1);
      if (arm === "classroom" && peerTrace) {
        const peerLesson = peer?.workspace.lessons
          .filter((l) => l.status === "verified")
          .at(-1);
        if (peerLesson) {
          skill.spaceWeight = Math.min(
            40,
            (skill.spaceWeight + peerLesson.skill.spaceWeight) / 2,
          );
          skill.structureWeight = Math.min(
            8,
            (skill.structureWeight + peerLesson.skill.structureWeight) / 2,
          );
        } else {
          skill.spaceWeight = Math.min(
            40,
            skill.spaceWeight +
              (peerTrace.after.empty - peerTrace.before.empty) * 2,
          );
        }
      }
      const source =
        arm === "solo"
          ? "Self-review"
          : arm === "teacher"
            ? "Teacher"
            : peerTrace
              ? `Teacher + ${peer!.name}`
              : "Teacher (no relevant peer evidence)";
      const evidence = [
        critical.id,
        ...(arm === "classroom" && peerTrace ? [peerTrace.id] : []),
      ];
      return {
        lesson: {
          title: crowded
            ? "Preserve room before chasing merges"
            : "Compare the next few moves",
          rule: "When space is limited, compare candidate moves using sampled continuations. Prefer room and future legal options over immediate score when the evidence supports it.",
          trigger: "crowded boards",
          exception:
            "A large merge may still be best when it opens space. Simulation is a noisy estimate.",
          source,
          evidence,
          skill,
        },
        messages: [
          {
            role: arm === "solo" ? "student" : "teacher",
            title:
              arm === "solo"
                ? `${student.name} reviews their attempt`
                : `Teacher → ${student.name}`,
            text: `That ${critical.action} move took you from ${critical.before.empty} open spaces to ${critical.after.empty}. Let’s try looking a little further ahead and checking how much room each move leaves. It’s an idea to test, not a sure fix.`,
            evidence: [critical.id],
          },
          ...(arm === "classroom" && peerTrace
            ? [
                {
                  role: "peer" as const,
                  title: `${peer!.name} → ${student.name}`,
                  text: `My ${peerTrace.action} move opened up ${peerTrace.after.empty - peerTrace.before.empty} more ${peerTrace.after.empty - peerTrace.before.empty === 1 ? "space" : "spaces"}. Maybe checking for room before a big merge would help you too. I’ve shared that move so you can check it yourself.`,
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
