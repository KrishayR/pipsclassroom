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
        <span className="version">Notebook v{student.workspace.version}</span>
      </div>
      <div className="record-grid">
        <div>
          <span className="eyebrow">WHAT IS REMEMBERED</span>
          <h3>{student.workspace.lessons.length} active lessons</h3>
          {student.workspace.lessons.length ? (
            student.workspace.lessons.map((l) => (
              <article key={l.id}>
                <b>{l.title}</b>
                <p>{l.rule}</p>
                <small>
                  From {l.source} · applies {l.trigger}
                </small>
              </article>
            ))
          ) : (
            <p>
              No verified lesson in this notebook yet. Practice alone does not
              automatically create lasting memory.
            </p>
          )}
        </div>
        <div>
          <span className="eyebrow">WHAT CHANGED</span>
          <h3>Executable strategy</h3>
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
              No parameter change from{" "}
              {student.history.length
                ? "the previous saved strategy"
                : "the starting strategy"}
              . A rejected idea leaves the strategy unchanged.
            </p>
          )}
        </div>
        <div>
          <span className="eyebrow">DID IT GUIDE A MOVE?</span>
          <h3>
            {mode === "model"
              ? `${applied.length} lesson-linked moves`
              : "Strategy-driven simulation"}
          </h3>
          <p>
            {mode === "model"
              ? "Moves where the model cited an active lesson."
              : "Simulation follows the current strategy settings."}
          </p>
          {student.traces.length > 0 && (
            <button
              className="text-button"
              onClick={() => onInspect((latest ?? student.traces.at(-1)!).id)}
            >
              {latest
                ? "Inspect the latest lesson-linked decision"
                : "Inspect a recorded decision"}{" "}
              →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
