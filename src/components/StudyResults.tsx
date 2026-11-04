import { useState } from "react";
import { STUDY_RESULTS } from "../studyResults";

// [mean difference, 95% CI low, high]; bold when the interval excludes zero.
const fmt = (n: number) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString()}`;
function Diff({ value }: { value: number[] | null }) {
  if (!value) return <>—</>;
  const [d, lo, hi] = value;
  const clear = lo > 0 || hi < 0;
  const text = `${fmt(d)} [${fmt(lo)}, ${fmt(hi)}]`;
  return clear ? <b>{text}</b> : <>{text}</>;
}

export default function StudyResults() {
  const [id, setId] = useState(STUDY_RESULTS[0].id);
  const s = STUDY_RESULTS.find((x) => x.id === id)!;
  return (
    <section className="panel recordings study-results">
      <h2>Past study results</h2>
      <p>
        Differences are paired by seed, with 95% intervals; bold ones exclude
        zero.
      </p>
      <div className="study-tabs" role="tablist">
        {STUDY_RESULTS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={x.id === id}
            className={x.id === id ? "active" : ""}
            onClick={() => setId(x.id)}
          >
            {x.title}
            <span>{x.date}</span>
          </button>
        ))}
      </div>
      <ul className="study-takeaways">
        {s.takeaways.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <h3>Lessons kept in training</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Kept</th>
              <th>Saved lessons</th>
            </tr>
          </thead>
          <tbody>
            {s.training.map((t) => (
              <tr key={t.group}>
                <td>
                  <b>{t.group}</b>
                </td>
                <td>
                  {t.kept} of {t.tested}
                </td>
                <td>{t.lessons.length ? t.lessons.join(" · ") : "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Live exams</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Condition</th>
              <th>Mean score</th>
              <th>vs untrained</th>
            </tr>
          </thead>
          <tbody>
            {s.live.map((r) => (
              <tr key={r.condition}>
                <td>
                  <b>{r.condition}</b>
                </td>
                <td>{r.mean.toLocaleString()}</td>
                <td>
                  <Diff value={r.vsUntrained} />
                </td>
              </tr>
            ))}
            {s.contrasts.map((c) => (
              <tr key={c.label}>
                <td>
                  <b>{c.label}</b>
                  {c.primary && <span className="table-sub">Primary</span>}
                </td>
                <td />
                <td>
                  <Diff value={c.value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Full-game check (simulation, 120 paired games per group)</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Mean score</th>
              <th>vs untrained notes</th>
            </tr>
          </thead>
          <tbody>
            {s.fullGame.map((r) => (
              <tr key={r.group}>
                <td>
                  <b>{r.group}</b>
                </td>
                <td>{r.mean.toLocaleString()}</td>
                <td>
                  <Diff value={r.vsUntrained} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
