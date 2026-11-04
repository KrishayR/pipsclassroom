import type { Exam, Student } from "../core/types";

const score = (rows: Exam["rows"]) =>
  rows.reduce((n, r) => n + r.score, 0) / rows.length;
const number = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function ExamProgress({
  exams,
  exam,
  students,
}: {
  exams: Exam[];
  exam: Exam;
  students: Student[];
}) {
  const baseline = exams.find(
    (e) =>
      e.completedAt &&
      e.rows.length &&
      !e.rows.some((r) => r.terminal === "error"),
  );
  return (
    <section className="panel exam-progress">
      <h2>Progress since the first exam</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>First exam</th>
              <th>Selected exam</th>
              <th>Score change</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const before =
                baseline?.rows.filter((r) => r.studentId === s.id) ?? [];
              const after = exam.rows.filter((r) => r.studentId === s.id);
              const comparable =
                baseline &&
                baseline !== exam &&
                exam.completedAt &&
                baseline.mode === exam.mode &&
                baseline.arm === exam.arm &&
                baseline.cap === exam.cap &&
                before.length > 0 &&
                before.length === after.length &&
                !after.some((r) => r.terminal === "error") &&
                before
                  .map((r) => r.seed)
                  .sort()
                  .join(",") ===
                  after
                    .map((r) => r.seed)
                    .sort()
                    .join(",");
              const delta = comparable ? score(after) - score(before) : null;
              return (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b>
                  </td>
                  <td>{before.length ? number(score(before)) : "—"}</td>
                  <td>{after.length ? number(score(after)) : "—"}</td>
                  <td>
                    {delta !== null ? (
                      <span
                        className={`exam-change ${delta > 0 ? "higher" : delta < 0 ? "lower" : "same"}`}
                      >
                        {delta > 0 ? "+" : ""}
                        {number(delta)} ·{" "}
                        {delta > 0
                          ? "Higher"
                          : delta < 0
                            ? "Lower"
                            : "Unchanged"}
                      </span>
                    ) : (
                      <span className="fine">
                        {baseline === exam
                          ? "First exam"
                          : "Different exam settings"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
