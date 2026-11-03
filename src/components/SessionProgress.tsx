import type { LiveBatch, RequestDiagnostics } from "../core/types";
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
  diagnostics,
}: {
  batch: LiveBatch;
  onResume?: () => void;
  resumeDisabled?: boolean;
  resuming?: boolean;
  diagnostics?: RequestDiagnostics;
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
          {diagnostics && (
            <>
              <p>
                Request timings · reasoning {diagnostics.reasoningEffort} ·{" "}
                {diagnostics.active} active · {diagnostics.queued} queued
              </p>
              <dl className="request-stats">
                <div>
                  <dt>Completed / failed</dt>
                  <dd>
                    {diagnostics.completed} / {diagnostics.failed}
                  </dd>
                </div>
                <div>
                  <dt>Queue wait</dt>
                  <dd>{(diagnostics.queueMs / 1000).toFixed(1)} s</dd>
                </div>
                <div>
                  <dt>Rate-limit wait</dt>
                  <dd>{(diagnostics.rateWaitMs / 1000).toFixed(1)} s</dd>
                </div>
                <div>
                  <dt>Response headers</dt>
                  <dd>{(diagnostics.providerHeadersMs / 1000).toFixed(1)} s</dd>
                </div>
                <div>
                  <dt>Response body</dt>
                  <dd>{(diagnostics.bodyMs / 1000).toFixed(1)} s</dd>
                </div>
                <div>
                  <dt>Retry wait</dt>
                  <dd>
                    {(diagnostics.retryWaitMs / 1000).toFixed(1)} s ·{" "}
                    {diagnostics.retries} retries
                  </dd>
                </div>
                <div>
                  <dt>Rate-limit responses</dt>
                  <dd>{diagnostics.rateLimited}</dd>
                </div>
              </dl>
              <p>
                Totals across concurrent requests, not wall-clock duration.
                Response timings include network and provider work.
              </p>
            </>
          )}
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
