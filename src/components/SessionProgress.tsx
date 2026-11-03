import type { LiveBatch } from "../core/types";

export function sessionProgress(batch: LiveBatch) {
  const stages = batch.kind === "individual" ? 4 : 3;
  const total = 1 + batch.total * stages;
  // Only finished stage checkpoints count; move counts and wall time are not estimates.
  const completed =
    batch.status === "complete"
      ? total
      : Math.min(total - 1, batch.timings?.length ?? 0);
  return { completed, total };
}

export default function SessionProgress({ batch }: { batch: LiveBatch }) {
  const { completed, total } = sessionProgress(batch);
  const label =
    batch.status === "complete"
      ? "Learning session complete"
      : batch.status === "running"
        ? batch.stage
        : `Session ${batch.status} · partial results kept`;
  return (
    <section
      className="session-progress panel"
      aria-label="Learning session progress"
    >
      <div role="status">
        <strong>{label}</strong>
        <span>
          {completed}/{total} stage checkpoints
        </span>
      </div>
      <progress
        aria-label="Completed learning stages"
        max={total}
        value={completed}
      />
      <p className="fine">
        Stage progress, not a time estimate. Discuss and Verify can overlap
        across students. Estimated spend: ${batch.spentUsd.toFixed(3)} / $
        {batch.budgetUsd.toFixed(2)} budget.
      </p>
      {batch.status !== "running" && batch.status !== "complete" && (
        <p className="fine">{batch.stage}</p>
      )}
      <details>
        <summary>Saved run details</summary>
        <p className="fine">
          {batch.directory}/status.json · {batch.completed}/{batch.total} cycles
          finished. Stopped runs stay saved for diagnosis and export.
        </p>
      </details>
    </section>
  );
}
