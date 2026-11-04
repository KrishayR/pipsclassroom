import type { Mode, Student } from "../core/types";
import { DEFAULT_SKILL } from "../core/skills";

export default function LearningRecord({
  student,
  mode,
  onInspect,
}: {
  student: Student;
  mode: Mode;
  onInspect: (id: string) => void;
}) {
  const previous = student.history.at(-1)?.skill ?? DEFAULT_SKILL;
  const fields = [
    ["depth", "Look-ahead depth"],
    ["spaceWeight", "Value of open space"],
    ["structureWeight", "Value of tile structure"],
    ["mergeWeight", "Value of merging"],
    ["riskWeight", "Penalty for getting stuck"],
  ] as const;
  const changes = fields.filter(
    ([key]) => previous[key] !== student.workspace.skill[key],
  );
  const applied = student.traces.filter((t) => t.lessonId);
  const latest = applied.at(-1);
  return (
    <section className="panel learning-record">
      <div className="panel-title">
        <h2>{student.name}’s learning record</h2>
        <span className="version">
          Notebook version {student.workspace.version}
        </span>
      </div>
      <div className="record-grid">
        <div>
          <span className="eyebrow">WHAT IS REMEMBERED</span>
          <h3>{student.workspace.lessons.length} saved lessons</h3>
          {student.workspace.lessons.length ? (
            student.workspace.lessons.map((l) => (
              <article key={l.id}>
                <b>{l.title}</b>
                <p>{l.rule}</p>
                <small>
                  From {l.source} · used {l.trigger}
                </small>
              </article>
            ))
          ) : (
            <p>
              No lessons yet. A lesson is only saved after it passes a test;
              practice alone doesn’t add one.
            </p>
          )}
        </div>
        <div>
          <span className="eyebrow">WHAT CHANGED</span>
          <h3>How it plays</h3>
          {changes.length ? (
            <dl>
              {changes.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {previous[key]} → <b>{student.workspace.skill[key]}</b>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>
              No change from{" "}
              {student.history.length
                ? "the last saved strategy"
                : "the starting strategy"}
              . A rejected idea changes nothing.
            </p>
          )}
        </div>
        <div>
          <span className="eyebrow">DID IT GUIDE A MOVE?</span>
          <h3>
            {mode === "model"
              ? `${applied.length} moves used a lesson`
              : "Practice mode"}
          </h3>
          <p>
            {mode === "model"
              ? "Moves where the student said a saved lesson guided it."
              : "The built-in player follows the current strategy."}
          </p>
          {student.traces.length > 0 && (
            <button
              className="text-button"
              onClick={() => onInspect((latest ?? student.traces.at(-1)!).id)}
            >
              {latest
                ? "See the latest move that used a lesson"
                : "See a recorded move"}{" "}
              →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
