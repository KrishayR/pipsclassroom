import { Play, Square, Download } from "lucide-react";
import type { LiveBatch } from "../core/types";

export default function LongLearningPanel({
  batch,
  disabled,
  starting,
  stopping,
  live,
  onStart,
  onStop,
  onExport,
}: {
  batch?: LiveBatch;
  disabled: boolean;
  starting: boolean;
  stopping: boolean;
  live: boolean;
  onStart: () => void;
  onStop: () => void;
  onExport: () => void;
}) {
  const longRun = batch?.deadlineAt ? batch : undefined;
  const running = longRun?.status === "running";
  const isStopping =
    stopping || (running && longRun.stage.startsWith("Stopping"));
  return (
    <section className="panel settings-card wide runtime-test-panel">
      <span className="eyebrow">LONG LEARNING TEST</span>
      <h2>Follow the classroom for up to five hours</h2>
      <p>
        Start a fresh classroom and repeat learning cycles for Ada, Lin and Sam.
        Every cycle completes teaching, peer discussion and verification before
        the next uses its lessons. Independent exams measure progress every two
        cycles.
      </p>
      <dl className="request-stats">
        <div>
          <dt>Time window</dt>
          <dd>Up to 5 hours</dd>
        </div>
        <div>
          <dt>Total spending ceiling</dt>
          <dd>$20 estimated</dd>
        </div>
        <div>
          <dt>Reasoning &amp; planner</dt>
          <dd>Low for all roles · planner on</dd>
        </div>
        <div>
          <dt>Exam schedule</dt>
          <dd>Baseline · every 2 cycles · final</dd>
        </div>
        <div>
          <dt>Each exam</dt>
          <dd>3 students × 2 seeds × 300 moves</dd>
        </div>
      </dl>
      <p className="fine">
        Teaching and verification happen every cycle. Only this long test skips
        alternate exams. It starts with six request slots and may use up to nine
        for verification when measured headroom allows, keeping the existing
        request-rate limit. Compact move-ranking tables retain all values, and
        full evidence stays saved. The last 45 minutes are reserved for a final
        exam; a late cycle or slow requests can still leave a partial
        assessment. Learning cycles stay sequential. New work stops at the time
        or spending limit; active requests may take a little longer to finish.
        Notes, accepted/rejected lessons, conversations and exam moves are
        saved. This is an exploratory longitudinal run; 300-move exams do not
        establish full-game learning gains.
      </p>
      <div className="controls runtime-test-actions">
        {running ? (
          <button
            className="secondary"
            onClick={onStop}
            disabled={isStopping || starting}
            aria-busy={isStopping}
          >
            <Square size={15} />
            {isStopping ? "Stopping…" : "Stop long learning test"}
          </button>
        ) : (
          <button
            className="primary"
            onClick={onStart}
            disabled={disabled}
            aria-busy={starting}
          >
            <Play size={15} />
            {starting ? "Starting…" : "Start 5-hour learning test · $20 max"}
          </button>
        )}
        {longRun && (
          <button className="secondary" onClick={onExport}>
            <Download size={15} />
            Export saved run
          </button>
        )}
      </div>
      {!live && (
        <p className="fine">
          Select Muse / model API in Settings to enable this test.
        </p>
      )}
      {longRun && (
        <div className="runtime-test-status" aria-live="polite">
          <strong>{longRun.stage}</strong>
          <p>
            {longRun.completed} cycles completed · $
            {longRun.spentUsd.toFixed(3)} / ${longRun.budgetUsd.toFixed(2)}{" "}
            estimated
          </p>
          {longRun.longRunOptimizations && (
            <p className="fine">
              Request-slot limit: {longRun.adaptiveRequestLimit ?? 6}. Final
              exam:{" "}
              {longRun.finalExamCompleted ? "completed" : "pending or partial"}.
            </p>
          )}
          <p className="fine">
            Scheduled cutoff: {new Date(longRun.deadlineAt!).toLocaleString()}.
            Keep the computer awake and backend running. Closing or refreshing
            the frontend does not stop the backend run.
          </p>
          <p className="fine">
            Saved under <code>{longRun.directory}</code>. Completed checkpoints
            and partial results remain available for analysis.
          </p>
        </div>
      )}
    </section>
  );
}
