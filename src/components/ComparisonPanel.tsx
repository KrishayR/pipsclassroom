import {
  ArrowRight,
  FlaskConical,
  GraduationCap,
  Play,
  Square,
  Users,
  UserRound,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { summarize } from "../core/evaluation";
import { ARMS } from "../core/classroom";
import type { Arm, Comparison } from "../core/types";
import Pip from "./Pip";
export const armNames: Record<Arm, string> = {
  solo: "On their own",
  teacher: "Teacher · random practice",
  adaptive: "Teacher · targeted practice",
  classroom: "Teacher + classmates",
};
const descriptions: Record<Arm, string> = {
  solo: "Students try random exercises, review their own mistakes, and test their ideas.",
  teacher:
    "A teacher reviews each student, but exercises are picked at random.",
  adaptive:
    "The same teacher, with exercises aimed at each student’s weakest measured skill (80% targeted, 20% exploration).",
  classroom:
    "Targeted exercises and a teacher, plus a classmate who shares a recorded example. Each student tests the advice alone.",
};
export default function ComparisonPanel({
  comparison,
  busy,
  onRun,
  onStop,
}: {
  comparison?: Comparison;
  busy: boolean;
  onRun: () => void;
  onStop: () => void;
}) {
  const solo = comparison?.runs.find((r) => r.arm === "solo");
  const group = comparison?.runs.find((r) => r.arm === "classroom");
  const complete = solo?.status === "complete" && group?.status === "complete"
    && solo.rows.length > 0 && group.rows.length > 0;
  const soloScore = complete ? summarize(solo.rows, comparison!.cap).meanScore : 0;
  const groupScore = complete ? summarize(group.rows, comparison!.cap).meanScore : 0;
  const delta = groupScore - soloScore;
  return (
    <>
      <div className="comparison-intro">
        <Pip mood={busy ? "thinking" : "happy"} size={104} />
        <div>
          <span className="eyebrow">THE QUESTION WE’RE HERE TO ANSWER</span>
          <h2>Does learning together actually help?</h2>
          <p>
            Give four fresh groups the same game, tools, and starting skills.
            Change who they can learn from. Then let everyone take the same test
            alone.
          </p>
        </div>
        {busy ? (
          <button className="secondary" onClick={onStop}>
            <Square size={15} />
            Stop the run
          </button>
        ) : (
          <button className="primary" onClick={onRun}>
            <Play size={15} />
            Try the comparison
          </button>
        )}
      </div>
      <section className="panel" aria-live="polite">
        <span className="eyebrow">LEARNING TOGETHER VS LEARNING ALONE</span>
        <h2>{complete
          ? delta > 0 ? `Group-trained agents scored ${Math.round(delta).toLocaleString()} points higher`
            : delta < 0 ? `Solo agents scored ${Math.round(-delta).toLocaleString()} points higher`
            : "Both approaches earned the same average score"
          : "Watch shared experiments become tested lessons"}</h2>
        <p>{complete
          ? `Group average: ${Math.round(groupScore).toLocaleString()} · Solo average: ${Math.round(soloScore).toLocaleString()}. Saved lessons: ${group!.accepted} in the group, ${solo!.accepted} solo. These are this run’s results; more runs are needed to establish a reliable advantage.`
          : "Agents practice, share recorded examples, test advice, and keep lessons that pass. The final comparison shows how they perform independently on the same exam seeds."}</p>
      </section>
      <div className="comparison-groups">
        {ARMS.map((arm, i) => {
          const run = comparison?.runs.find((r) => r.arm === arm);
          const result = run?.rows.length
            ? summarize(run.rows, comparison!.cap)
            : null;
          return (
            <section
              className={`panel comparison-group ${comparison?.activeArm === arm ? "working" : ""}`}
              key={arm}
            >
              <span className="eyebrow">GROUP 0{i + 1}</span>
              <div className="group-icons">
                <UserRound />
                {arm !== "solo" && (
                  <>
                    <ArrowRight size={16} />
                    <GraduationCap />
                  </>
                )}
                {arm === "classroom" && (
                  <>
                    <ArrowRight size={16} />
                    <Users />
                  </>
                )}
              </div>
              <h3>{armNames[arm]}</h3>
              <p>{descriptions[arm]}</p>
              <div className="group-status">
                {run ? (
                  <>
                    <span
                      className={`dot ${run.status === "training" || run.status === "exam" ? "pulse" : ""}`}
                    />
                    {run.status === "training"
                      ? "Practicing and testing ideas…"
                      : run.status === "exam"
                        ? "Taking the test alone…"
                        : run.status === "error"
                          ? "This run needs attention"
                          : "Test finished"}
                  </>
                ) : (
                  <>
                    <span className="dot" />
                    Ready for a fresh start
                  </>
                )}
              </div>
              {result ? (
                <div className="group-results">
                  <strong>
                    {Math.round(result.meanScore).toLocaleString()}
                    <small> mean score</small>
                  </strong>
                  <span>
                    Reached 2048{" "}
                    <b>
                      {result.successes} / {result.n}
                    </b>
                  </span>
                  <span>
                    Hit the move limit <b>{result.truncated}</b>
                  </span>
                  <span>
                    Accepted lessons <b>{run!.accepted}</b>
                  </span>
                  <span>
                    Ideas that didn’t pass <b>{run!.rejected}</b>
                  </span>
                  <span>
                    Training model calls <b>{run!.trainingCalls}</b>
                  </span>
                  <span>
                    Training tokens{" "}
                    <b>{run!.trainingTokens.toLocaleString()}</b>
                  </span>
                  <span>
                    Simulated transitions{" "}
                    <b>{run!.trainingSimulations.toLocaleString()}</b>
                  </span>
                </div>
              ) : (
                run && (
                  <div className="group-training">
                    <BookOpen size={15} />
                    {run.accepted} lessons saved · {run.rejected} ideas set
                    aside
                  </div>
                )
              )}
              {run?.rows.length ? (
                <details className="group-games">
                  <summary>See every test game</summary>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Score</th>
                          <th>Top tile</th>
                          <th>Moves</th>
                        </tr>
                      </thead>
                      <tbody>
                        {run.rows.map((r, i) => (
                          <tr key={i}>
                            <td>
                              {r.name}
                              <span className="table-sub">
                                {r.terminal === "target"
                                  ? "Reached 2048"
                                  : r.terminal === "loss"
                                    ? "No moves left"
                                    : r.terminal === "cap"
                                      ? "Move limit"
                                      : (r.error ?? "Stopped")}
                              </span>
                            </td>
                            <td>{r.score}</td>
                            <td>{r.highest}</td>
                            <td>{r.moves}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
              {run?.error && <p className="group-error">{run.error}</p>}
            </section>
          );
        })}
      </div>
      <div className="comparison-note">
        <FlaskConical size={18} />
        <p>
          <b>A small pilot, not the final verdict.</b> Each group starts with 12
          practice moves per student, then works on one chosen skill per student
          and tests one idea on fresh boards. They share a 50,000-transition
          training ceiling and take one new exam game each, up to 1,500 moves.
          Teaching costs are shown, not hidden. A larger, cost-matched model
          study is needed to establish a classroom advantage.
        </p>
      </div>
      {comparison && (
        <>
          <div className="section-bar">
            <div>
              <h2>What they said to each other</h2>
              <p>
                These are the actual exchanges from this comparison. Open a
                group to follow along.
              </p>
            </div>
          </div>
          <div className="comparison-exchanges">
            {comparison.runs.map((run) => (
              <details
                className="panel"
                key={run.arm}
                open={comparison.activeArm === run.arm}
              >
                <summary>
                  <span>{armNames[run.arm]}</span>
                  <span>{run.messages.length} updates</span>
                </summary>
                <div className="feed">
                  {run.messages
                    .filter(
                      (m) =>
                        m.role !== "system" ||
                        /accepted|rejected/i.test(m.title),
                    )
                    .map((m) => (
                      <article key={m.id}>
                        <span className={`feed-avatar ${m.role}`}>
                          {m.role === "peer" ? (
                            <Users size={16} />
                          ) : m.role === "teacher" ? (
                            <GraduationCap size={16} />
                          ) : (
                            <UserRound size={16} />
                          )}
                        </span>
                        <div>
                          <b>{m.title}</b>
                          <p>{m.text}</p>
                        </div>
                      </article>
                    ))}
                </div>
              </details>
            ))}
          </div>
          {comparison.status === "complete" && (
            <div className="comparison-finished">
              <CheckCircle2 size={18} />
              <p>
                The comparison is saved. Export the run to keep every result,
                including failed games and rejected advice.
                {comparison.mode === "simulation"
                  ? " This used local simulation; it doesn’t show that an LLM learned."
                  : ""}
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
