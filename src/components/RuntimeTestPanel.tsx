import { useState } from "react";
import { Download, FlaskConical, Play, Square } from "lucide-react";
import type { RuntimeTestStatus } from "../core/types";

export default function RuntimeTestPanel({
  test,
  disabled,
  starting,
  stopping,
  live,
  onStart,
  onStop,
}: {
  test?: RuntimeTestStatus;
  disabled: boolean;
  starting: boolean;
  stopping: boolean;
  live: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const [downloading, setDownloading] = useState(false),
    [error, setError] = useState("");
  const running = test?.status === "running";
  const isStopping = stopping || (running && test.stage.startsWith("Stopping"));
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setError("");
    try {
      const response = await fetch("/api/runtime-test/report?mode=model");
      if (!response.ok)
        throw new Error("Could not download the runtime report. Please retry.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "muse-student-reasoning-test.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <section className="panel settings-card wide runtime-test-panel">
      <span className="eyebrow">TEMPORARY · STUDENT REASONING TEST</span>
      <h2>Compare low and minimal student reasoning</h2>
      <p>
        Run both student settings with six workers on the same frozen notes and
        seeds: 12 games, up to 150 moves each (1,800 decisions total). Uses the
        first student's notes; results stay separate from classroom exams and
        lessons.
      </p>
      <p className="fine">
        Live Muse calls · $2 estimated total cap across both settings. Normal
        students stay on low; teacher and peer feedback stay on low. The planner
        remains enabled. This tests student moves, not teaching. A 150-move
        screening test cannot establish full-game equivalence or learning.
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
            {isStopping ? "Stopping…" : "Stop comparison"}
          </button>
        ) : (
          <button
            className="primary"
            onClick={onStart}
            disabled={disabled}
            aria-busy={starting}
          >
            <Play size={15} />
            {starting ? "Starting…" : "Test student reasoning · $2 max"}
          </button>
        )}
        {test?.reportAvailable && (
          <button
            className="secondary"
            onClick={download}
            disabled={downloading}
            aria-busy={downloading}
          >
            <Download size={15} />
            {downloading ? "Preparing…" : "Download test report"}
          </button>
        )}
      </div>
      {!live && (
        <p className="fine">
          Select Muse / model API in Settings to enable this test.
        </p>
      )}
      {test && (
        <div className="runtime-test-status" aria-live="polite">
          <strong>
            <FlaskConical size={16} /> {test.stage}
          </strong>
          <progress
            aria-label="Runtime comparison completed games"
            max={test.totalGames}
            value={test.completedGames}
          />
          <p>
            {test.completedGames}/{test.totalGames} games saved · $
            {test.spentUsd.toFixed(3)} / ${test.budgetUsd.toFixed(2)} estimated
            budget
          </p>
          {!!test.results.length && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reasoning</th>
                    <th>Workers</th>
                    <th>Games</th>
                    <th>Seconds</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {test.results.map((result, i) => (
                    <tr key={i}>
                      <td>{result.effort}</td>
                      <td>{result.concurrency}</td>
                      <td>{result.games}/6</td>
                      <td>{(result.elapsedMs / 1000).toFixed(1)}</td>
                      <td>{result.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="fine">
            Saved automatically: <code>{test.reportPath}</code>. You can leave
            this page open, return later, download the report, or use Export
            classroom in live mode.
          </p>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
