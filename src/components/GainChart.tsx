import { useState } from "react";

// Live exam score change of each group over untrained students: bar = mean paired
// difference, whisker = 95% interval, dashed line = no change.
export interface GainRow {
  condition: string;
  mean: number;
  vsUntrained: number[] | null;
}
const W = 720,
  LABEL = 104,
  RIGHT = 70,
  ROW = 44,
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
  const data = rows.filter((r) => r.vsUntrained);
  const [focus, setFocus] = useState<number | null>(null);
  const lo = Math.min(0, ...data.map((r) => r.vsUntrained![1]));
  const hi = Math.max(0, ...data.map((r) => r.vsUntrained![2]));
  // About six gridlines whatever the range.
  const step = [250, 500, 1000, 2000, 2500, 5000].find(
    (v) => (hi - lo) / v <= 7,
  )!;
  const min = Math.floor(lo / step) * step,
    max = Math.ceil(hi / step) * step || step;
  const x = (v: number) =>
    LABEL + ((v - min) / (max - min)) * (W - LABEL - RIGHT);
  const ticks = Array.from(
    { length: (max - min) / step + 1 },
    (_, i) => min + i * step,
  );
  const H = TOP + data.length * ROW + AXIS;
  const shown = focus === null ? null : data[focus];
  return (
    <figure className="gain-chart">
      <div className="gain-chart-scroll">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Score gain over untrained notes: ${data
            .map((r) => `${r.condition} ${fmt(r.vsUntrained![0])}`)
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
                {t === 0 ? "0" : fmt(t)}
              </text>
            </g>
          ))}
          {data.map((r, i) => {
            const [d, l, h] = r.vsUntrained!;
            const y = TOP + i * ROW + ROW / 2;
            const x0 = x(Math.min(0, d)),
              x1 = x(Math.max(0, d));
            return (
              <g
                key={r.condition}
                className={focus === null || focus === i ? "row" : "row dim"}
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
                {d !== 0 && (
                  <rect
                    className="bar"
                    x={x0}
                    y={y - 9}
                    width={Math.max(2, x1 - x0)}
                    height={18}
                    rx={4}
                  />
                )}
                {h > l && (
                  <g className="whisker">
                    <line x1={x(l)} x2={x(h)} y1={y} y2={y} />
                    <line x1={x(l)} x2={x(l)} y1={y - 6} y2={y + 6} />
                    <line x1={x(h)} x2={x(h)} y1={y - 6} y2={y + 6} />
                  </g>
                )}
                <text className="value" x={Math.max(x(h), x1) + 8} y={y + 4}>
                  {d === 0 ? "no lesson saved" : fmt(d)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption>
        {shown && shown.vsUntrained![0] === 0 && shown.vsUntrained![2] === 0 ? (
          <>
            <b>{shown.condition}</b>: no lesson was saved, so it played like
            untrained students
          </>
        ) : shown ? (
          <>
            <b>{shown.condition}</b>: {fmt(shown.vsUntrained![0])} points per
            game
            {` (${pct(shown.vsUntrained![0], shown.mean)})`}, 95% range{" "}
            {fmt(shown.vsUntrained![1])} to {fmt(shown.vsUntrained![2])}
          </>
        ) : (
          "Points per game compared with untrained students on the same games. Bars are the average; lines show the 95% range. Hover a group for details."
        )}
      </figcaption>
    </figure>
  );
}
