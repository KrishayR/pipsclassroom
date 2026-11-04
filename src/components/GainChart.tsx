import { useState } from "react";

// Live exam mean score per condition, bars from zero; the trained condition's paired
// difference from untrained students ([mean, 95% low, high]) is written underneath.
export interface GainRow {
  condition: string;
  mean: number;
  vsUntrained: number[] | null;
}
const W = 720,
  LABEL = 104,
  RIGHT = 70,
  ROW = 52,
  TOP = 8,
  AXIS = 26;
const fmt = (n: number) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString()}`;
// Paired difference as a share of the untrained mean (group mean − difference).
const pct = (d: number, mean: number) => {
  const p = (100 * d) / (mean - d);
  return `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`;
};

export default function GainChart({ rows }: { rows: GainRow[] }) {
  const [focus, setFocus] = useState<number | null>(null);
  const top = Math.max(...rows.map((r) => r.mean));
  const step = [500, 1000, 2000, 2500, 5000].find((v) => top / v <= 6)!;
  const max = Math.ceil(top / step) * step;
  const x = (v: number) => LABEL + (v / max) * (W - LABEL - RIGHT);
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const H = TOP + rows.length * ROW + AXIS;
  const trained = rows.find((r) => r.vsUntrained);
  const shown = focus === null ? null : rows[focus];
  return (
    <figure className="gain-chart">
      <div className="gain-chart-scroll">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Mean live exam score: ${rows
            .map((r) => `${r.condition} ${r.mean.toLocaleString()}`)
            .join(", ")}`}
          onMouseLeave={() => setFocus(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                className={t === 0 ? "zero" : "grid"}
                x1={x(t)}
                x2={x(t)}
                y1={TOP}
                y2={H - AXIS + 4}
              />
              <text className="tick" x={x(t)} y={H - 8} textAnchor="middle">
                {t.toLocaleString()}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const y = TOP + i * ROW + ROW / 2;
            return (
              <g
                key={r.condition}
                className={[
                  "row",
                  r.vsUntrained ? "" : "base",
                  focus === null || focus === i ? "" : "dim",
                ].join(" ")}
                tabIndex={0}
                onMouseEnter={() => setFocus(i)}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus(null)}
              >
                <rect
                  className="hit"
                  x={0}
                  y={y - ROW / 2}
                  width={W}
                  height={ROW}
                />
                <text className="label" x={0} y={y + 4}>
                  {r.condition}
                </text>
                <rect
                  className="bar"
                  x={x(0)}
                  y={y - 11}
                  width={Math.max(2, x(r.mean) - x(0))}
                  height={22}
                  rx={4}
                />
                <text className="value" x={x(r.mean) + 8} y={y + 4}>
                  {r.mean.toLocaleString()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption>
        {shown ? (
          <>
            <b>{shown.condition}</b>: {shown.mean.toLocaleString()} points per
            game on average
          </>
        ) : trained ? (
          <>
            <b>{trained.condition}</b>: {fmt(trained.vsUntrained![0])} points
            per game ({pct(trained.vsUntrained![0], trained.mean)}) over
            untrained students on the same games, 95% range{" "}
            {fmt(trained.vsUntrained![1])} to {fmt(trained.vsUntrained![2])}
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
