import type { LiveBatch } from "../core/types";
import { Play } from "lucide-react";

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

export default function SessionProgress({
  batch,
  onResume,
  resumeDisabled = false,
  resuming = false,
}: {
  batch: LiveBatch;
  onResume?: () => void;
  resumeDisabled?: boolean;
  resuming?: boolean;
}) {
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
      <div className="session-progress-heading" role="status">
        <strong>{label}</strong>
        <span className="session-checkpoints">
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
        across students.
      </p>
      <div className="session-spend">
        <span>Estimated spend</span>
        <strong>
          ${batch.spentUsd.toFixed(3)}{" "}
          <small>/ ${batch.budgetUsd.toFixed(2)} budget</small>
        </strong>
      </div>
      {batch.status !== "running" && batch.status !== "complete" && (
        <p className="fine">{batch.stage}</p>
      )}
      {onResume &&
        batch.canResume &&
        (batch.status === "error" || batch.status === "interrupted") && (
          <div className="session-resume">
            <button
              className="primary"
              onClick={onResume}
              disabled={resumeDisabled}
            >
              <Play size={15} /> {resuming ? "Starting…" : "Resume session"}
            </button>
            <p className="fine">
              Continue from the last completed stage. Unfinished work may
              repeat; previous spend counts toward the original $
              {batch.budgetUsd.toFixed(2)} budget.
            </p>
          </div>
        )}
      <details className="saved-run-details">
        <summary>Saved run details</summary>
        <div className="saved-run-body">
          <code>{batch.directory}/status.json</code>
          <p>
            {batch.completed}/{batch.total} cycles finished. Stopped runs stay
            saved for diagnosis and export.
          </p>
        </div>
      </details>
    </section>
  );
}
