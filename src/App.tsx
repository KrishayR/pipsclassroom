import { useEffect, useRef, useState } from "react";
import "./themes.css";
import "./dropdowns.css";
import LearningRecord from "./components/LearningRecord";
import ExamProgress from "./components/ExamProgress";
import Select from "./components/Select";
import useEdgeBounce from "./useEdgeBounce";
import SessionProgress from "./components/SessionProgress";
import StudyResults from "./components/StudyResults";
import LearningGuide from "./components/LearningGuide";
import Pip from "./components/Pip";
import ComparisonPanel, { armNames } from "./components/ComparisonPanel";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  FlaskConical,
  GraduationCap,
  History,
  Layers,
  Lightbulb,
  LockKeyhole,
  Moon,
  Sun,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  action,
  connect,
  exportClassroomArchive,
  loadRecording,
  watch,
  type Connection,
  type RecordingInfo,
} from "./client";
import { initialState } from "./core/classroom";
import { createGame, move, observe } from "./core/engine";
import { MILESTONES, summarize } from "./core/evaluation";
import { FOCI, focusName, skillEstimates } from "./core/curriculum";
import { ARMS } from "./core/classroom";
import type {
  Board,
  Direction,
  LabState,
  Lesson,
  Mode,
  Student,
  Trace,
} from "./core/types";
const directions = {
  up: ArrowUp,
  right: ArrowRight,
  down: ArrowDown,
  left: ArrowLeft,
};
const format = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
const pages = [
  { id: "classroom", name: "Classroom", icon: Users },
  { id: "lessons", name: "Lessons", icon: BookOpen },
  { id: "results", name: "Results", icon: GraduationCap },
];
function BoardView({
  board,
  small = false,
}: {
  board: Board;
  small?: boolean;
}) {
  return (
    <div
      className={`board ${small ? "small" : ""}`}
      role="img"
      aria-label={`2048 board: ${board.map((v) => v || "empty").join(", ")}`}
    >
      {board.map((value, i) => (
        <div key={i} className={`tile tile-${Math.min(value, 2048)}`}>
          <span>{value || ""}</span>
        </div>
      ))}
    </div>
  );
}
function animateButtonClick(
  event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const button = (event.target as Element).closest<HTMLButtonElement>(
    "button:not(:disabled)",
  );
  if (!button) return;
  button.classList.remove("click-animation");
  void button.offsetWidth;
  button.classList.add("click-animation");
  button.addEventListener(
    "animationend",
    () => button.classList.remove("click-animation"),
    { once: true },
  );
}
function Empty({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof BookOpen;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value}`}>
      {value === "verified" ? (
        <Check size={11} />
      ) : value === "candidate" ? (
        <FlaskConical size={11} />
      ) : null}
      {value}
    </span>
  );
}
function StudentCard({
  student,
  selected,
  onSelect,
  onInspect,
  busy,
  exam,
}: {
  student: Student;
  selected: boolean;
  onSelect: () => void;
  onInspect: (id: string) => void;
  busy: boolean;
  exam: boolean;
}) {
  const last = exam ? undefined : student.traces.at(-1);
  const Icon = last ? directions[last.action] : Activity;
  return (
    <article className={`student-card ${selected ? "selected" : ""}`}>
      <button
        className="student-select"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Select ${student.name}`}
      >
        <div className="student-heading">
          <div className={`avatar ${student.color}`}>
            {student.name.slice(0, 1)}
          </div>
          <div>
            <h3>
              {student.name}
              <span>Student {student.id.slice(-1)}</span>
            </h3>
            <p>
              <span className={`dot ${busy ? "pulse" : ""}`} />
              {busy ? "Working independently" : "Ready"}
            </p>
          </div>
          <span className="version">v{student.workspace.version}</span>
        </div>
        <div className="score-row">
          <div>
            <label>SCORE</label>
            <strong>{format(student.game.score)}</strong>
          </div>
          <div>
            <label>TOP TILE</label>
            <strong>{Math.max(...student.game.board)}</strong>
          </div>
          <div>
            <label>MOVES</label>
            <strong>{student.game.moves}</strong>
          </div>
        </div>
        <BoardView board={student.game.board} />
        <div className="student-action">
          <span className="action-icon">
            <Icon size={15} />
          </span>
          <div>
            <b>
              {exam
                ? "Independent exam"
                : last
                  ? `Moved ${last.action}`
                  : "Waiting for first move"}
            </b>
            <span>
              {exam
                ? student.status
                : last
                  ? `${last.simulations} simulated transitions · ${last.tools.length} tools`
                  : "A fresh board. A fresh attempt."}
            </span>
          </div>
        </div>
        <div
          className="skill-counts"
          title="Practice checks passed / applicable moves. Outcome checks, not grades."
        >
          {Object.entries(skillEstimates(student.traces)).map(([id, e]) => (
            <span key={id}>
              {focusName(id as keyof ReturnType<typeof skillEstimates>)}{" "}
              <b>
                {e.successes}/{e.attempts}
              </b>
            </span>
          ))}
        </div>
      </button>
      <div className="student-footer">
        <span>
          <Layers size={13} />
          {student.workspace.lessons.length} saved lessons
        </span>
        <button
          className="text-button"
          disabled={!last}
          onClick={(event) => {
            event.stopPropagation();
            if (last) onInspect(last.id);
          }}
        >
          Inspect <ChevronRight size={13} />
        </button>
      </div>
    </article>
  );
}
function LessonCard({
  lesson,
  onEvidence,
}: {
  lesson: Lesson;
  onEvidence?: (id: string) => void;
}) {
  return (
    <article className="lesson-card">
      <div className="row-between">
        <span className="eyebrow">
          {lesson.source}
          {lesson.focus ? ` · ${focusName(lesson.focus)}` : ""}
        </span>
        <Status value={lesson.status} />
      </div>
      <h3>{lesson.title}</h3>
      {lesson.revisionOf && (
        <p className="fine">Teacher revision · tested on fresh boards</p>
      )}
      <p>{lesson.rule}</p>
      <div className="lesson-scope">
        <p>
          <b>When</b> {lesson.trigger}
        </p>
        <p>
          <b>Exception</b> {lesson.exception}
        </p>
        {lesson.limits && (
          <p>
            <b>Only steps in</b> when a move breaks the skill; recommends moves
            leaving {lesson.limits.minOptions}+ options
            {lesson.limits.maxGainLoss !== undefined
              ? ` and giving up at most ${lesson.limits.maxGainLoss} points`
              : ""}
          </p>
        )}
        {lesson.sensitivity && (
          <p>
            <b>Changes the plan</b> on {lesson.sensitivity.changed} of{" "}
            {lesson.sensitivity.boards} sample boards
          </p>
        )}
      </div>
      <div className="skill-code">
        <Code2 size={15} />
        <code>{lesson.skill.id}</code>
        <span>
          v{lesson.skill.version} · depth {lesson.skill.depth}
        </span>
      </div>
      {lesson.verification && (
        <>
          <div className="verification-pair">
            <div>
              <span>Practice change</span>
              <b>
                {lesson.verification.meanDelta >= 0 ? "+" : ""}
                {lesson.verification.meanDelta.toFixed(1)}
              </b>
            </div>
            <div>
              <span>Regression change</span>
              <b>
                {lesson.verification.regressionDelta >= 0 ? "+" : ""}
                {lesson.verification.regressionDelta.toFixed(1)}
              </b>
            </div>
          </div>
          <details>
            <summary>
              Inspect all {lesson.verification.rows.length} verification pairs
            </summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Snapshot</th>
                    <th>Before</th>
                    <th>Candidate</th>
                    <th>Change</th>
                    <th title="Moves with the candidate where the student cited a saved lesson">
                      Cited
                    </th>
                    <th>Decisions</th>
                  </tr>
                </thead>
                <tbody>
                  {lesson.verification.rows.map((r) => (
                    <tr key={r.snapshot}>
                      <td>{r.snapshot}</td>
                      <td>{r.baseline.toFixed(1)}</td>
                      <td>{r.candidate.toFixed(1)}</td>
                      <td>{r.delta.toFixed(1)}</td>
                      <td>{r.cited ?? "—"}</td>
                      <td>
                        {r.trajectories && (
                          <details>
                            <summary>Inspect moves</summary>
                            {(["baseline", "candidate"] as const).map(
                              (side) => (
                                <div key={side}>
                                  <b>
                                    {side === "baseline"
                                      ? "Original strategy"
                                      : "Lesson-guided strategy"}
                                  </b>
                                  {r.trajectories![side].map((m, i) => (
                                    <details key={i}>
                                      <summary>
                                        Move {i + 1}: {m.action} · +
                                        {m.after.score - m.before.score} points
                                      </summary>
                                      <p>{m.summary}</p>
                                      <pre>
                                        {Array.from({ length: 4 }, (_, row) =>
                                          m.before.board
                                            .slice(row * 4, row * 4 + 4)
                                            .join("\t"),
                                        ).join("\n")}
                                        {"\n↓\n"}
                                        {Array.from({ length: 4 }, (_, row) =>
                                          m.after.board
                                            .slice(row * 4, row * 4 + 4)
                                            .join("\t"),
                                        ).join("\n")}
                                      </pre>
                                    </details>
                                  ))}
                                </div>
                              ),
                            )}
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fine">{lesson.verification.rule}</p>
          </details>
        </>
      )}
      <div className="evidence-row">
        {onEvidence &&
          lesson.evidence.map((id, i) => (
            <button key={id} onClick={() => onEvidence(id)}>
              Evidence {i + 1} <ArrowRight size={12} />
            </button>
          ))}
      </div>
    </article>
  );
}
function HowItWorks({
  close,
  enter,
}: {
  close: () => void;
  enter: () => void;
}) {
  const [game, setGame] = useState(() => createGame(42));
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          onClick={close}
          aria-label="Close introduction"
        >
          <X />
        </button>
        <span className="eyebrow">A 30-SECOND INTRODUCTION</span>
        <h2 id="intro-title">
          Small moves.
          <br />
          Visible consequences.
        </h2>
        <p>
          Slide the board. Matching tiles merge: <b>2 + 2 = 4</b>. Keep making
          larger tiles until you reach <b>2048</b>. Every valid move adds a new
          tile. If no moves remain, the game ends.
        </p>
        <div className="intro-game">
          <BoardView board={game.board} small />
          <div>
            <b>Try a move</b>
            <p>
              This board is yours to explore. It is separate from the
              experiment.
            </p>
            <div className="direction-buttons">
              {(["left", "up", "down", "right"] as Direction[]).map((d) => {
                const Icon = directions[d];
                return (
                  <button
                    key={d}
                    aria-label={`Move ${d}`}
                    disabled={!observe(game).legal.includes(d)}
                    onClick={() => setGame(move(game, d).game)}
                  >
                    <Icon size={20} />
                  </button>
                );
              })}
            </div>
            <button
              className="text-button"
              onClick={() => setGame(createGame(42))}
            >
              Start over
            </button>
          </div>
        </div>
        <div className="intro-note">
          <GraduationCap size={22} />
          <p>
            Our agents practice, receive feedback, test a lesson, and play new
            games alone. The exam tells us whether the lesson helped.
          </p>
        </div>
        <button className="primary" onClick={enter}>
          Enter the classroom <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
export default function App() {
  const themeReady = useRef(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("classroom-theme");
      return saved
        ? saved === "dark"
        : matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    };
    try {
      localStorage.setItem("classroom-theme", darkMode ? "dark" : "light");
    } catch {
      /* Theme still works when storage is unavailable. */
    }
    if (
      themeReady.current &&
      document.startViewTransition &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const transition = document.startViewTransition(apply);
      return () => transition.skipTransition();
    }
    themeReady.current = true;
    apply();
  }, [darkMode]);
  const pageSurface = useEdgeBounce();
  const [connection, setConnection] = useState<Connection | null>(null),
    [mode, setMode] = useState<Mode>("simulation"),
    [liveState, setState] = useState<LabState>(() => initialState()),
    [page, setPage] = useState("classroom"),
    [resultsView, setResultsView] = useState("exams"),
    [examId, setExamId] = useState(""),
    [traceOrigin, setTraceOrigin] = useState("classroom"),
    [selected, setSelected] = useState("student-1"),
    [intro, setIntro] = useState(false),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [traceId, setTraceId] = useState<string | null>(null),
    [cap, setCap] = useState(1500),
    [seedCount, setSeedCount] = useState(3),
    [batchCycles, setBatchCycles] = useState("1"),
    [pending, setPending] = useState(false),
    [pendingAction, setPendingAction] = useState<string | null>(null),
    [stopping, setStopping] = useState(false),
    [replaying, setReplaying] = useState(false),
    // A saved live run shown read-only in place of the live classroom.
    [recording, setRecording] = useState<{
      run: RecordingInfo;
      stage: number;
      state: LabState;
    } | null>(null);
  const state = recording?.state ?? liveState;
  // A recorded run is a live model run, whatever mode the live classroom is in.
  const shownMode: Mode = recording ? "model" : mode;
  const showRecording = async (run: RecordingInfo, stage: number) => {
    try {
      setError("");
      const recorded = await loadRecording(run.id, run.stages[stage].id);
      setRecording({ run, stage, state: recorded });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that run.");
    }
  };
  const requestLock = useRef(false);
  const stopLock = useRef(false);
  useEffect(() => {
    if (!state.busy && state.liveBatch?.status !== "running") {
      stopLock.current = false;
      setStopping(false);
    }
  }, [state.busy, state.liveBatch?.status]);
  const replaySlider = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = pageSurface.current?.animate(
      [
        { opacity: 0.65, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    return () => animation?.cancel();
  }, [page, resultsView, pageSurface]);
  useEffect(() => {
    connect().then(setConnection);
  }, []);
  useEffect(() => {
    if (!connection) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    watch(connection, mode, (s) => {
      if (!disposed) setState(s);
    })
      .then((fn) => {
        if (disposed) fn();
        else unsubscribe = fn;
      })
      .catch((e) => setError(e.message));
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [connection, mode]);
  const run = async (name: string, params: Record<string, unknown> = {}) => {
    if (
      !connection ||
      !!recording ||
      requestLock.current ||
      (name === "stop"
        ? stopLock.current
        : state.busy || state.liveBatch?.status === "running")
    )
      return;
    requestLock.current = true;
    if (name === "stop") {
      stopLock.current = true;
      setStopping(true);
    }
    setError("");
    setPending(true);
    setPendingAction(name);
    try {
      await action(connection, mode, name, params);
    } catch (e) {
      if (name === "stop") {
        stopLock.current = false;
        setStopping(false);
      }
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      requestLock.current = false;
      setPending(false);
      setPendingAction(null);
    }
  };
  const busy =
    !!recording ||
    state.busy ||
    pending ||
    state.liveBatch?.status === "running";
  const actionLabel = (name: string, label: string) =>
    pendingAction === name
      ? "Starting…"
      : state.busy && state.phase === name
        ? "Running…"
        : label;
  const batch = mode === "model" ? state.liveBatch : undefined;
  const stopPending =
    stopping ||
    (batch?.status === "running" &&
      batch.stage.toLowerCase().includes("stopping"));
  const batchStage =
    batch?.status === "running" ? batch.stage.toLowerCase() : "";
  const sessionComplete = batch?.status === "complete" && !state.busy;
  const pipelineState = (phase: string) => {
    if (!batchStage)
      return sessionComplete
        ? "done"
        : state.busy && state.phase === phase
          ? "current"
          : "";
    if (batchStage.includes("baseline") || batchStage.includes("stopping"))
      return "";
    if (batchStage.includes("practice"))
      return phase === "practice" ? "current" : "";
    if (batchStage.includes("teaching"))
      return phase === "practice"
        ? "done"
        : ["review", "verify"].includes(phase)
          ? "current"
          : "";
    if (batchStage.includes("review"))
      return phase === "practice"
        ? "done"
        : phase === "review"
          ? "current"
          : "";
    if (batchStage.includes("verification"))
      return ["practice", "review"].includes(phase)
        ? "done"
        : phase === "verify"
          ? "current"
          : "";
    if (batchStage.includes("exam"))
      return phase === "exam" ? "current" : "done";
    return "";
  };
  const student =
    state.students.find((s) => s.id === selected) ?? state.students[0];
  const traces = state.students.flatMap((s) => s.traces);
  const chosenTrace =
    traces.find((t) => t.id === traceId) ?? student.traces.at(-1);
  const lastExam =
    state.exams.find((e) => e.id === examId) ?? state.exams.at(-1);
  const stats = lastExam ? summarize(lastExam.rows, lastExam.cap) : null;
  const replayTraces = chosenTrace
    ? traces.filter(
        (t) =>
          t.episodeId === chosenTrace.episodeId &&
          t.studentId === chosenTrace.studentId,
      )
    : [];
  const replayIndex = replayTraces.findIndex((t) => t.id === chosenTrace?.id);
  useEffect(() => {
    if (!replaying || page !== "traces") {
      if (!replaying && replaySlider.current)
        replaySlider.current.value = String(Math.max(0, replayIndex));
      return;
    }
    const nextIndex = replayIndex + 1;
    if (nextIndex >= replayTraces.length) {
      setReplaying(false);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / 650);
      if (replaySlider.current)
        replaySlider.current.value = String(replayIndex + progress);
      if (progress < 1) frame = requestAnimationFrame(animate);
      else {
        setTraceId(replayTraces[nextIndex].id);
        if (nextIndex === replayTraces.length - 1) setReplaying(false);
      }
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [replaying, page, replayIndex, replayTraces.length]);
  const inspect = (id: string) => {
    if (page !== "traces") setTraceOrigin(page);
    setReplaying(false);
    setTraceId(id);
    setPage("traces");
  };
  const navigate = (next: string) => {
    if (next === "compare") {
      setResultsView("comparison");
      setPage("results");
    } else {
      if (next === "results") setResultsView("exams");
      if (next === "traces" && page !== "traces") setTraceOrigin(page);
      setPage(next);
    }
  };
  const download = async () => {
    if (!connection || exporting) return;
    setExporting(true);
    try {
      const data = await exportClassroomArchive(connection, mode);
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pips-classroom-${mode}-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(
        "Could not create the classroom archive. Please retry; saved run data is still on the server.",
      );
    } finally {
      setExporting(false);
    }
  };
  return (
    <div
      className="app-shell"
      onPointerDownCapture={animateButtonClick}
      onClickCapture={(event) => {
        if (event.detail === 0) animateButtonClick(event);
      }}
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("home");
          }}
        >
          <span className="brand-icon">
            <FlaskConical size={24} />
          </span>
          <span>
            Pip’s<span> Classroom</span>
            <small>THE AGENT CLASSROOM</small>
          </span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav>
          {pages.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={
                (page === "traces" ? traceOrigin : page) === id ? "active" : ""
              }
            >
              <Icon size={18} />
              {name}
              {id === "lessons" && state.ledger.length > 0 ? (
                <span className="nav-count">{state.ledger.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() => setPage("recordings")}
            className={page === "recordings" ? "active" : ""}
          >
            <History size={18} />
            Past results
          </button>
          <button
            onClick={() => setPage("settings")}
            className={page === "settings" ? "active" : ""}
          >
            <Settings2 size={18} />
            Settings
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span>Pip’s Classroom</span>
            <ChevronRight size={14} />
            <b>
              {page === "home"
                ? "Welcome"
                : page === "traces"
                  ? "Decision details"
                  : page === "recordings"
                    ? "Past results"
                    : (pages.find((p) => p.id === page)?.name ?? "Settings")}
            </b>
          </div>
          <div className="top-actions">
            <button
              className="theme-toggle"
              aria-label="Dark mode"
              aria-pressed={darkMode}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setDarkMode((value) => !value)}
            >
              <Sun size={14} aria-hidden="true" />
              <Moon size={14} aria-hidden="true" />
              <span className="theme-toggle-knob" aria-hidden="true" />
            </button>
            <span className={`mode-badge ${recording ? "model" : mode}`}>
              <span className="dot" />
              {recording
                ? "Recorded live run"
                : mode === "simulation"
                  ? "Simulation mode"
                  : "Live model mode"}
            </span>
            <button
              className="secondary export-button"
              aria-label="Export classroom archive"
              title="Download raw data, readable reports and latest live-run checkpoints"
              disabled={!connection || exporting}
              aria-busy={exporting}
              onClick={download}
            >
              <Download size={17} />
              <span>{exporting ? "Preparing…" : "Export classroom"}</span>
            </button>
            <span className="user-avatar">PC</span>
          </div>
        </header>
        <nav className="mobile-nav" aria-label="Main navigation">
          {[
            ...pages,
            { id: "settings", name: "Settings", icon: Settings2 },
          ].map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              className={
                (page === "traces" ? traceOrigin : page) === id ? "active" : ""
              }
              onClick={() => setPage(id)}
            >
              <Icon size={17} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        {recording && (
          <div className="recording-bar" role="status">
            <History size={16} />
            <span>
              <b>Recorded live run</b> ·{" "}
              {new Date(recording.run.startedAt).toLocaleString()} · read-only,
              no model calls
            </span>
            <button
              className="icon-button"
              aria-label="Previous stage"
              disabled={recording.stage === 0}
              onClick={() => showRecording(recording.run, recording.stage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <select
              aria-label="Stage"
              value={recording.stage}
              onChange={(e) =>
                showRecording(recording.run, Number(e.target.value))
              }
            >
              {recording.run.stages.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              aria-label="Next stage"
              disabled={recording.stage === recording.run.stages.length - 1}
              onClick={() => showRecording(recording.run, recording.stage + 1)}
            >
              <ChevronRight size={16} />
            </button>
            <button className="secondary" onClick={() => setRecording(null)}>
              Back to live classroom
            </button>
          </div>
        )}
        <main ref={pageSurface}>
          {page === "home" && (
            <section className="welcome-page">
              <div className="welcome-hero">
                <Pip size={150} mood="happy" />
                <span className="eyebrow">WELCOME TO PIP’S CLASSROOM</span>
                <h1>Agent learning, one tested lesson at a time.</h1>
                <p>
                  “A clever idea is just the beginning. Let’s put it to the
                  test.”
                </p>
              </div>
              <div className="welcome-options">
                {[
                  ...pages,
                  { id: "settings", name: "Settings", icon: Settings2 },
                ].map(({ id, name, icon: Icon }) => (
                  <button
                    key={id}
                    className="welcome-option panel"
                    onClick={() => setPage(id)}
                  >
                    <Icon size={28} aria-hidden="true" />
                    <span>
                      <b>{name}</b>
                      <small>
                        {id === "classroom"
                          ? "Watch Ada, Lin and Sam practice and test advice."
                          : id === "lessons"
                            ? "Explore saved lessons and the ideas behind them."
                            : id === "results"
                              ? "Follow exam scores and compare ways of learning."
                              : "Choose your model and classroom configuration."}
                      </small>
                    </span>
                    <ArrowRight size={20} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          )}
          {page !== "home" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>
                    {page === "classroom"
                      ? "Watch agents turn practice into tested lessons."
                      : page === "lessons"
                        ? "Good ideas have to prove themselves."
                        : page === "results" && resultsView === "comparison"
                          ? "Better together? Let’s find out."
                          : page === "results"
                            ? "What can they do on their own?"
                            : page === "traces"
                              ? "Let’s look at that move."
                              : page === "recordings"
                                ? "Past results."
                                : "Set up your classroom."}
                  </h1>
                  <p>
                    {page === "classroom"
                      ? "Watch AI students try, share ideas, and find out what actually helps."
                      : page === "lessons"
                        ? "Students keep the advice that helps on new boards. The rest stays here too."
                        : page === "results" && resultsView === "comparison"
                          ? "Same starting point. Different ways to learn. One fair question."
                          : page === "results"
                            ? "Fresh games, saved lessons, and no hints from the teacher or classmates."
                            : page === "traces"
                              ? "See what the student checked, what it chose, and what happened next."
                              : page === "recordings"
                                ? "What the finished live studies found."
                                : "Choose how the students think, who helps them, and how long their tests run."}
                  </p>
                </div>
                <button
                  className="secondary how-button"
                  onClick={() => setIntro(true)}
                >
                  <BookOpen size={16} />
                  How this works
                </button>
              </div>
              {page === "classroom" && (
                <>
                  <LearningGuide
                    selected={selected}
                    navigate={navigate}
                    state={state}
                    busy={busy}
                    ready={!!connection}
                    run={run}
                    starting={pending && pendingAction !== "stop"}
                    recorded={!!recording}
                  />
                </>
              )}
            </>
          )}
          {(error || state.error) && (
            <div className="error" role="alert">
              {error || state.error}
              <button
                onClick={() => setError("")}
                aria-label="Dismiss local error"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {page === "classroom" && (
            <>
              <div className="pipeline">
                {[
                  {
                    name: "Practice",
                    desc: "Have a go",
                    icon: Play,
                    phase: "practice",
                  },
                  {
                    name: "Discuss",
                    desc: "Swap ideas",
                    icon: Users,
                    phase: "review",
                  },
                  {
                    name: "Verify",
                    desc: "See if it helps",
                    icon: ShieldCheck,
                    phase: "verify",
                  },
                  {
                    name: "Exam",
                    desc: "Try it alone",
                    icon: GraduationCap,
                    phase: "exam",
                  },
                ].map(({ name, desc, icon: Icon, phase }, i) => (
                  <div
                    key={name}
                    className={pipelineState(phase)}
                    aria-current={
                      pipelineState(phase) === "current" ? "step" : undefined
                    }
                  >
                    <span className="pipeline-icon">
                      <Icon size={17} />
                    </span>
                    <div>
                      <b>
                        <span>0{i + 1}</span>
                        {name}
                      </b>
                      <small>{desc}</small>
                    </div>
                    {i < 3 && (
                      <ChevronRight className="pipeline-chevron" size={17} />
                    )}
                  </div>
                ))}
              </div>
              <section className="panel session-launcher">
                <div className="section-bar">
                  <div>
                    <h2>Run a learning session</h2>
                    <p>
                      Baseline exam → focused practice → teacher and peer
                      discussion → verification → independent exam.
                    </p>
                  </div>
                  {state.busy || batch?.status === "running" ? (
                    <button
                      className="secondary"
                      disabled={stopPending || pending}
                      aria-busy={stopPending}
                      onClick={() => run("stop")}
                    >
                      <Square size={14} />{" "}
                      {stopPending ? "Stopping…" : "Stop after current action"}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        mode !== "model" ||
                        connection?.kind !== "server" ||
                        !Number.isInteger(Number(batchCycles)) ||
                        Number(batchCycles) < 1 ||
                        Number(batchCycles) > 100
                      }
                      onClick={() =>
                        run("live-batch", {
                          cycles: Number(batchCycles),
                          kind: "classroom",
                        })
                      }
                    >
                      <Play size={15} />{" "}
                      {actionLabel("live-batch", "Run Learning Session")}
                    </button>
                  )}
                </div>
                <label>
                  Number of sessions{" "}
                  <input
                    aria-label="Number of learning sessions"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={batchCycles}
                    disabled={busy}
                    onChange={(e) => setBatchCycles(e.target.value)}
                  />
                </label>
                <p className="fine">
                  Teaches Ada, Lin and Sam. Starts a fresh classroom; previous
                  run data stays saved. Uses Muse credits within the server’s
                  configured budget. Keep the backend running.
                </p>
                {mode !== "model" && (
                  <p className="simulation-warning">
                    You’re in local simulation.{" "}
                    <button
                      className="text-button"
                      onClick={() => setPage("settings")}
                    >
                      Select Muse in Settings
                    </button>{" "}
                    to run an automated learning session, or try the individual
                    steps below.
                  </p>
                )}
              </section>
              {!batch && (
                <section
                  className="session-progress panel"
                  aria-label="Learning session progress"
                >
                  <strong>Ready to start a learning session</strong>
                  <progress
                    aria-label="Completed learning stages"
                    max={1}
                    value={0}
                  />
                </section>
              )}
              {batch && (!state.busy || batch.status === "running") && (
                <SessionProgress
                  batch={batch}
                  diagnostics={
                    batch.status === "running"
                      ? state.requestDiagnostics
                      : undefined
                  }
                  onResume={() => run("resume-batch")}
                  resumeDisabled={
                    busy || pending || connection?.kind !== "server"
                  }
                  resuming={pendingAction === "resume-batch"}
                />
              )}
              <details className="individual-steps panel">
                <summary>Run Individual steps</summary>
                <div className="controls">
                  <button
                    className="secondary"
                    disabled={busy || !connection}
                    onClick={() => run("practice", { steps: 12 })}
                  >
                    <Play size={14} />{" "}
                    {actionLabel("practice", "Play 12 more moves")}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || !connection || !!state.candidate}
                    onClick={() => run("diagnose")}
                  >
                    <FlaskConical size={14} />{" "}
                    {actionLabel("diagnose", "Focused practice")}
                  </button>
                  <button
                    className="secondary"
                    disabled={
                      busy || !student.traces.length || !!state.candidate
                    }
                    onClick={() => run("review", { studentId: student.id })}
                  >
                    <Users size={14} />{" "}
                    {actionLabel("review", `Discuss ${student.name}’s attempt`)}
                  </button>
                  {state.candidate && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => run("verify")}
                    >
                      <ShieldCheck size={14} />{" "}
                      {actionLabel("verify", "Test pending lesson")}
                    </button>
                  )}
                  {mode === "model" && connection?.kind === "server" && (
                    <button
                      className="secondary"
                      disabled={
                        busy ||
                        !Number.isInteger(Number(batchCycles)) ||
                        Number(batchCycles) < 1 ||
                        Number(batchCycles) > 100
                      }
                      onClick={() =>
                        run("live-batch", {
                          cycles: Number(batchCycles),
                          kind: "individual",
                        })
                      }
                    >
                      {actionLabel(
                        "live-batch",
                        `Run individual cycles · ${batchCycles || "…"}`,
                      )}
                    </button>
                  )}
                </div>
              </details>
              <div className="section-bar">
                <div>
                  <h2>
                    The classroom <span>3 students</span>
                  </h2>
                  <p>
                    Shared tools, separate notes. Select a student to inspect
                    their learning record.
                  </p>
                </div>
              </div>
              {mode === "model" && !!state.liveBatch?.cycles.length && (
                <details className="teaching-attempts">
                  <summary className="secondary">
                    <ChevronRight size={16} aria-hidden="true" />
                    Inspect completed teaching attempts
                  </summary>
                  {state.liveBatch.cycles.map((c) => (
                    <section key={c.cycle}>
                      <h3>
                        Cycle {c.cycle} · {c.student}
                      </h3>
                      {(c.attempts ?? [c.lesson]).map((l) => (
                        <LessonCard key={l.id} lesson={l} />
                      ))}
                    </section>
                  ))}
                </details>
              )}
              <div className="classroom-grid">
                <div className="students-grid">
                  {state.students.map((s) => (
                    <StudentCard
                      key={s.id}
                      student={s}
                      selected={selected === s.id}
                      onSelect={() => setSelected(s.id)}
                      onInspect={(id) => inspect(id)}
                      busy={state.busy}
                      exam={state.phase === "exam"}
                    />
                  ))}
                </div>
                <aside className="teacher-panel">
                  <div className="panel-heading">
                    <span className="teacher-icon">
                      <GraduationCap size={19} />
                    </span>
                    <div>
                      <h3>
                        {state.arm === "solo" ? "Study notes" : "The teacher"}
                      </h3>
                      <span>
                        {state.arm === "solo"
                          ? "Learning on your own"
                          : "Here to help, not play for you"}
                      </span>
                    </div>
                    <span className="dot" />
                  </div>
                  <div className="teacher-content">
                    <span className="eyebrow">TODAY’S FOCUS</span>
                    <h3>{state.focus?.name ?? "Chosen at the next review"}</h3>
                    <p>
                      {state.focus
                        ? FOCI.find((f) => f.id === state.focus!.focus)!
                            .question
                        : "Each review picks one skill. Targeted groups usually pick the weakest measured skill; the rest pick at random."}
                    </p>
                    {state.focus && (
                      <p className="focus-reason">{state.focus.reason}</p>
                    )}
                    <div className="focus-detail">
                      <Layers size={16} />
                      <span>
                        Selected student <b>{student.name}</b>
                      </span>
                    </div>
                    <div className="teacher-divider" />
                    <span className="eyebrow">LET’S TALK ABOUT THAT MOVE</span>
                    {state.messages
                      .filter((m) => m.role === "teacher")
                      .at(-1) ? (
                      <p className="teacher-quote">
                        {
                          state.messages
                            .filter((m) => m.role === "teacher")
                            .at(-1)!.text
                        }
                      </p>
                    ) : (
                      <p className="teacher-quote muted">
                        Let’s play a little first. Then we can look at a real
                        move and work out what might help.
                      </p>
                    )}
                    <span className="teacher-disclaimer">
                      {shownMode === "simulation"
                        ? "Simulation example · generated from recorded moves"
                        : "AI feedback · still needs to pass a test"}
                    </span>
                  </div>
                  <p className="teacher-next-step">
                    <ArrowUp size={16} aria-hidden="true" />
                    <span>
                      Open <b>Run Individual steps</b> above to discuss{" "}
                      {student.name}’s attempt.
                    </span>
                  </p>
                </aside>
              </div>
              <LearningRecord
                student={student}
                mode={shownMode}
                onInspect={inspect}
              />
              <div className="lower-grid">
                <section className="panel activity-panel">
                  <div className="panel-title">
                    <h2>
                      <Activity size={17} />
                      Classroom activity
                    </h2>
                    <span className="live-label">
                      <span className="dot" />
                      Recorded events
                    </span>
                  </div>
                  {!state.messages.length ? (
                    <div className="activity-welcome">
                      <span>
                        <Lightbulb size={22} />
                      </span>
                      <div>
                        <b>Everyone’s here. Let’s begin.</b>
                        <p>
                          Choose Play 12 more moves under Run Individual steps.
                          You’ll see each student check the board, try out
                          moves, and make a choice.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="feed">
                      {state.messages
                        .slice(-4)
                        .reverse()
                        .map((m) => (
                          <article key={m.id}>
                            <span className={`feed-avatar ${m.role}`}>
                              {m.role === "teacher" ? (
                                <GraduationCap size={16} />
                              ) : m.role === "peer" ? (
                                <Users size={16} />
                              ) : (
                                <Activity size={16} />
                              )}
                            </span>
                            <div>
                              <div className="row-between">
                                <b>{m.title}</b>
                                <time>
                                  {new Date(m.time).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </time>
                              </div>
                              <p>{m.text}</p>
                              {m.evidence?.[0] && (
                                <button
                                  className="text-button"
                                  onClick={() => inspect(m.evidence![0])}
                                >
                                  Inspect evidence <ArrowRight size={12} />
                                </button>
                              )}
                            </div>
                          </article>
                        ))}
                    </div>
                  )}
                </section>
                <section className="panel memory-panel">
                  <div className="panel-title">
                    <h2>
                      <BookOpen size={17} />
                      An idea to try
                    </h2>
                    {state.candidate && <Status value="candidate" />}
                  </div>
                  {state.candidate ? (
                    <>
                      <h3>{state.candidate.lesson.title}</h3>
                      <p>{state.candidate.lesson.rule}</p>
                      <div className="memory-target">
                        <Code2 size={16} />
                        <code>
                          depth {state.candidate.lesson.skill.depth} · space{" "}
                          {state.candidate.lesson.skill.spaceWeight}
                        </code>
                      </div>
                      <p className="fine">
                        Open “Run Individual steps” and choose “Test pending
                        lesson” to compare old and new notes on fresh boards
                        chosen for this skill, plus a few general check-up
                        boards.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="blank-memory">
                        <ShieldCheck size={28} />
                        <p>
                          A good idea is a start.
                          <br />
                          Let’s see if it actually helps.
                        </p>
                      </div>
                      <button
                        className="secondary full"
                        onClick={() => setPage("lessons")}
                      >
                        See saved lessons <ArrowRight size={14} />
                      </button>
                    </>
                  )}
                </section>
              </div>
              <div className="bottom-metrics">
                <span>
                  <Terminal size={15} />
                  <b>{format(traces.length)}</b> recorded moves
                </span>
                <span>
                  <Zap size={15} />
                  <b>{format(state.simulations)}</b> simulated transitions
                </span>
                <span>
                  <Code2 size={15} />
                  <b>{format(state.calls)}</b> model calls
                </span>
                <span>
                  <Layers size={15} />
                  <b>{format(state.tokens)}</b> tokens
                </span>
                <span className="right-note">
                  Nothing is hidden. Take a look.
                </span>
              </div>
            </>
          )}
          {page === "results" && (
            <div className="section-bar">
              <div
                className="student-tabs"
                role="group"
                aria-label="Results view"
              >
                <button
                  className={resultsView === "exams" ? "active" : ""}
                  aria-pressed={resultsView === "exams"}
                  onClick={() => setResultsView("exams")}
                >
                  Student exams
                </button>
                <button
                  className={resultsView === "comparison" ? "active" : ""}
                  aria-pressed={resultsView === "comparison"}
                  onClick={() => setResultsView("comparison")}
                >
                  Classroom vs solo
                </button>
              </div>
              <button
                className="secondary"
                disabled={!student.traces.length}
                onClick={() => inspect(student.traces.at(-1)!.id)}
              >
                <Activity size={15} /> Inspect recorded decisions
              </button>
            </div>
          )}
          {page === "results" && resultsView === "comparison" && (
            <ComparisonPanel
              starting={pendingAction === "compare"}
              stopping={stopPending}
              requestPending={pending}
              comparison={state.comparisons?.at(-1)}
              busy={busy}
              onRun={() => run("compare", { cap: 1500 })}
              onStop={() => run("stop")}
            />
          )}
          {page === "lessons" && (
            <>
              <div className="section-bar">
                <div>
                  <h2>Their notebooks</h2>
                  <p>
                    Each student keeps up to three lessons. You can go back to
                    their earlier notes.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => run("rollback", { studentId: selected })}
                  disabled={busy || !student.history.length}
                >
                  <RotateCcw size={15} />
                  Roll back {student.name}
                </button>
              </div>
              <div className="student-tabs">
                {state.students.map((s) => (
                  <button
                    key={s.id}
                    className={selected === s.id ? "active" : ""}
                    onClick={() => setSelected(s.id)}
                  >
                    {s.name}
                    <span>
                      v{s.workspace.version} · {s.workspace.lessons.length}{" "}
                      active
                    </span>
                  </button>
                ))}
              </div>
              <LearningRecord
                student={student}
                mode={shownMode}
                onInspect={inspect}
              />
              {state.candidate?.studentId === selected && (
                <div className="pending-candidate">
                  <LessonCard
                    lesson={state.candidate.lesson}
                    onEvidence={inspect}
                  />
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => run("verify")}
                  >
                    <ShieldCheck size={16} />
                    {actionLabel("verify", "Run verification")}
                  </button>
                </div>
              )}
              <h2 className="archive-heading">Classroom idea archive</h2>
              <p className="fine">
                All students’ tested ideas, including rejected and retired ones.
                The individual notebook above shows only the selected student’s
                active memory.
              </p>
              {state.ledger.length ? (
                <div className="lesson-grid">
                  {[...state.ledger].reverse().map((l) => (
                    <div className="archive-entry" key={l.id}>
                      <p className="eyebrow">
                        {state.students.find((s) => s.id === l.studentId)
                          ?.name ?? "Earlier record · owner not recorded"}
                      </p>
                      <LessonCard lesson={l} onEvidence={inspect} />
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon={BookOpen} title="No lessons saved yet.">
                  Play a little, talk about a move, and test an idea. You’ll see
                  what helped and what didn’t.
                </Empty>
              )}
            </>
          )}
          {page === "results" && resultsView === "exams" && (
            <>
              <div className="exam-banner">
                <span className="exam-icon">
                  <LockKeyhole size={26} />
                </span>
                <div>
                  <h2>No hints this time.</h2>
                  <p>
                    Students can use their saved notes and tools. The teacher
                    and classmates sit this one out.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => run("exam", { seedCount, cap })}
                >
                  <GraduationCap size={16} />
                  {actionLabel("exam", "Start the test")}
                </button>
              </div>
              <div className="exam-config">
                <label>
                  Games per student
                  <Select
                    label="Games per student"
                    value={seedCount}
                    disabled={busy}
                    onValueChange={(value) => setSeedCount(Number(value))}
                  >
                    {[1, 3, 6, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} development seeds
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  Maximum valid moves
                  <Select
                    label="Maximum valid moves"
                    value={cap}
                    disabled={busy}
                    onValueChange={(value) => setCap(Number(value))}
                  >
                    {[100, 500, 1500, 3000].map((n) => (
                      <option key={n} value={n}>
                        {n}
                        {n === 100 ? " · short smoke test" : ""}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              {lastExam && stats ? (
                <>
                  <label className="exam-history">
                    Exam history
                    <Select
                      label="Exam history"
                      value={examId}
                      onValueChange={setExamId}
                    >
                      <option value="">
                        Latest exam (updates automatically)
                      </option>
                      {state.exams.map((exam, i) => (
                        <option key={exam.id} value={exam.id}>
                          Exam {i + 1} ·{" "}
                          {new Date(exam.startedAt).toLocaleString()} ·{" "}
                          {exam.completedAt ? "Complete" : "Partial"}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <ExamProgress
                    exams={state.exams}
                    exam={lastExam}
                    students={state.students}
                  />
                  <div className="result-metrics">
                    <div>
                      <label>MEAN SCORE · PRIMARY</label>
                      <strong>{format(stats.meanScore)}</strong>
                      <span>
                        Every game counts, under a {lastExam.cap}-move cap
                      </span>
                    </div>
                    <div>
                      <label>MEDIAN SCORE</label>
                      <strong>{format(stats.medianScore ?? 0)}</strong>
                      <span>{stats.n} games</span>
                    </div>
                    <div>
                      <label>TILE MILESTONES</label>
                      <strong>
                        {stats.successes}
                        <small> / {stats.n} reached 2048</small>
                      </strong>
                      <span>
                        {MILESTONES.slice(0, 3)
                          .map(
                            (m) =>
                              `${m}+: ${Math.round(stats.milestones[m] * stats.n)}`,
                          )
                          .join(" · ")}
                      </span>
                    </div>
                    <div>
                      <label>HOW GAMES ENDED</label>
                      <strong>
                        {stats.truncated}
                        <small> hit the move cap</small>
                      </strong>
                      <span>
                        {stats.losses} ran out of moves · {stats.errors} errors
                      </span>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-title">
                      <h2>Selected exam · {lastExam.arm}</h2>
                      <Status
                        value={
                          lastExam.completedAt
                            ? "complete"
                            : state.busy
                              ? "running"
                              : "interrupted"
                        }
                      />
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Seed</th>
                            <th>Top tile</th>
                            <th>Score</th>
                            <th>Moves</th>
                            <th>Outcome</th>
                            <th>Model calls</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lastExam.rows.map((r, i) => (
                            <tr key={i}>
                              <td>
                                <b>{r.name}</b>
                                <span className="table-sub">
                                  workspace v{r.workspaceVersion}
                                </span>
                              </td>
                              <td className="mono">{r.seed}</td>
                              <td>
                                <span
                                  className={`mini-tile tile-${Math.min(r.highest, 2048)}`}
                                >
                                  {r.highest}
                                </span>
                              </td>
                              <td>{format(r.score)}</td>
                              <td>{r.moves}</td>
                              <td title={r.error}>
                                <Status value={r.terminal} />
                              </td>
                              <td>{r.calls}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="fine result-note">
                    {state.exams.length} exam runs stored in the export. A
                    single run does not establish classroom improvement. Use the
                    evaluation runner for matched conditions and training
                    repetitions.
                  </p>
                </>
              ) : (
                <Empty icon={GraduationCap} title="Ready when you are.">
                  Try a test before and after practice. We’ll keep every
                  outcome, even when a student gets stuck.
                </Empty>
              )}
            </>
          )}
          {page === "traces" && (
            <>
              <button
                className="text-button"
                onClick={() => {
                  setReplaying(false);
                  setPage(traceOrigin);
                }}
              >
                <ArrowLeft size={15} /> Back to{" "}
                {pages.find((p) => p.id === traceOrigin)?.name ?? "Classroom"}
              </button>
              <div className="section-bar">
                <div>
                  <h2>Inside a move</h2>
                  <p>
                    Pick a move to see what the student tried and what changed.
                  </p>
                </div>
                <button className="secondary" onClick={download}>
                  <Download size={15} />
                  Export all traces
                </button>
              </div>
              {traces.length ? (
                <>
                  <div className="replay-toolbar">
                    <button
                      className="secondary"
                      onClick={() => {
                        if (
                          !replaying &&
                          replayIndex === replayTraces.length - 1
                        )
                          setTraceId(replayTraces[0].id);
                        setReplaying(!replaying);
                      }}
                    >
                      {replaying ? <Square size={14} /> : <Play size={14} />}
                      {replaying ? "Pause replay" : "Replay episode"}
                    </button>
                    <input
                      aria-label="Recorded move"
                      type="range"
                      ref={replaySlider}
                      min={0}
                      max={Math.max(0, replayTraces.length - 1)}
                      step="any"
                      defaultValue={Math.max(0, replayIndex)}
                      onChange={(e) => {
                        setReplaying(false);
                        const index = Number(e.target.value);
                        setTraceId(replayTraces[index].id);
                      }}
                    />
                    <span>Recorded replay · no model calls</span>
                  </div>
                  <div className="trace-layout">
                    <div className="trace-list">
                      {[...traces]
                        .reverse()
                        .slice(0, 250)
                        .map((t) => {
                          const Icon = directions[t.action];
                          return (
                            <button
                              key={t.id}
                              className={
                                chosenTrace?.id === t.id ? "active" : ""
                              }
                              onClick={() => setTraceId(t.id)}
                            >
                              <span>
                                <Icon size={16} />
                              </span>
                              <div>
                                <b>
                                  {
                                    state.students.find(
                                      (s) => s.id === t.studentId,
                                    )?.name
                                  }{" "}
                                  · move {t.after.moves}
                                </b>
                                <small>
                                  {t.action} · +{t.scoreDelta} points · v
                                  {t.workspaceVersion}
                                </small>
                              </div>
                              <ChevronRight size={14} />
                            </button>
                          );
                        })}
                    </div>
                    {chosenTrace && <TraceDetail trace={chosenTrace} />}
                  </div>
                </>
              ) : (
                <Empty icon={Activity} title="First, let’s make a move.">
                  Play 12 more moves under Run Individual steps, then come back
                  to replay a move and open the tool results.
                </Empty>
              )}
            </>
          )}
          {page === "recordings" && <StudyResults />}
          {page === "settings" && (
            <div className="settings-grid">
              <section className="panel settings-card">
                <h2>How the students think</h2>
                <p>
                  Simulation runs immediately. Live model mode requires the
                  local backend and a server-side API key.
                </p>
                <div className="mode-options">
                  {(["simulation", "model"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      className={mode === m ? "active" : ""}
                      disabled={
                        busy || (m === "model" && !connection?.modelAvailable)
                      }
                      onClick={() => setMode(m)}
                    >
                      <span>
                        {m === "simulation" ? (
                          <FlaskConical size={22} />
                        ) : (
                          <Code2 size={22} />
                        )}
                      </span>
                      <b>
                        {m === "simulation"
                          ? "Local simulation"
                          : "Muse / model API"}
                      </b>
                      <small>
                        {m === "simulation"
                          ? "Deterministic heuristic · no API cost"
                          : connection?.modelAvailable
                            ? connection.modelId
                            : "API key not configured"}
                      </small>
                      {mode === m && <CheckCircle2 size={17} />}
                    </button>
                  ))}
                </div>
                <div className="config-instructions">
                  <h3>Connect a live model</h3>
                  <ol className="setup-steps">
                    <li>
                      Copy <code>.env.example</code> to <code>.env</code> in the
                      project folder. Add your provider key to{" "}
                      <code>MODEL_API_KEY</code>; set the endpoint and model
                      using <code>MODEL_BASE_URL</code> and{" "}
                      <code>MODEL_ID</code>.
                    </li>
                    <li>
                      Restart <code>npm run dev</code>, then refresh the
                      connection below. Select Muse / model API when enabled.
                    </li>
                    <li>
                      Run one move per student first. Inspect the recorded tools
                      and model calls before starting a longer practice or
                      verification run.
                    </li>
                  </ol>
                  <div className="connection-actions">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => connect().then(setConnection)}
                    >
                      Refresh connection
                    </button>
                    <button
                      className="primary"
                      disabled={
                        busy || mode !== "model" || !connection?.modelAvailable
                      }
                      onClick={() => run("practice", { steps: 1 })}
                    >
                      {actionLabel(
                        "practice",
                        "Test connection · one move per student",
                      )}
                    </button>
                  </div>
                  <p className="connection-status">
                    <b>Connection:</b>{" "}
                    {connection?.kind === "server"
                      ? connection.modelAvailable
                        ? "Model configured; a successful move is still needed to verify credentials and compatibility."
                        : "Server connected; no model key configured."
                      : "Browser-only simulation; start the local backend for model mode."}
                  </p>
                  <div className="connection-notes">
                    <p>
                      <b>What gets sent:</b> game boards, recent moves, saved
                      rules, and review evidence. The server makes model
                      requests; the key stays out of the browser. The supplied
                      example selects Contributor mode: review your provider’s
                      data-use terms before using it.
                    </p>
                    <p>
                      <b>What changes:</b> the model chooses moves and writes
                      review advice. The engine checks legal moves; paired tests
                      decide whether a lesson is stored. Each student has
                      separate memory, using the same configured model.
                    </p>
                    <p>
                      <b>Cost:</b> practice, peer feedback, verification
                      rollouts, and exams can all make paid calls. Learning
                      session batches have a configured estimated budget; manual
                      actions can also spend credits. Local estimates are not a
                      guaranteed provider billing cap.
                    </p>
                  </div>
                </div>
              </section>
              <section className="panel settings-card">
                <h2>Who helps them learn?</h2>
                <p>
                  Choose before practice. Reset or export the current run before
                  changing conditions.
                </p>
                <label className="field-label">
                  Study group
                  <Select
                    label="Study group"
                    value={state.arm}
                    disabled={busy || !!traces.length || !!state.ledger.length}
                    onValueChange={(value) => run("arm", { arm: value })}
                  >
                    {ARMS.map((a) => (
                      <option key={a} value={a}>
                        {armNames[a]}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="configuration-facts">
                  <span>
                    Per-decision simulation cap <b>96 transitions</b>
                  </span>
                  <span>
                    Active memory limit <b>3 lessons</b>
                  </span>
                  <span>
                    Lesson check{" "}
                    <b>
                      {(() => {
                        const v =
                          connection?.protocol?.[mode]?.verify ??
                          ({ practice: 6, regression: 3, moves: 8 } as const);
                        return `${v.practice} + ${v.regression} boards × ${v.moves} moves`;
                      })()}
                    </b>
                  </span>
                  <span>
                    Model session token ceiling{" "}
                    <b>{format(connection?.tokenBudget ?? 100000)}</b>
                  </span>
                  {!!connection?.keys?.length && (
                    <span>
                      API keys{" "}
                      <b>
                        {connection.keys.filter((k) => !k.retired).length} of{" "}
                        {connection.keys.length} available · $
                        {connection.keys
                          .reduce((n, k) => n + k.spentUsd, 0)
                          .toFixed(2)}{" "}
                        estimated
                      </b>
                    </span>
                  )}
                  <span>
                    Storage{" "}
                    <b>
                      {connection?.kind === "server"
                        ? "SQLite · local server"
                        : "Local browser storage"}
                    </b>
                  </span>
                </div>
                <button
                  className="secondary full"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reset this classroom? Export first if you want to keep its traces.",
                      )
                    )
                      run("reset");
                  }}
                  disabled={busy}
                >
                  <RotateCcw size={15} />
                  Reset current classroom
                </button>
              </section>
              <section className="panel settings-card wide">
                <h2>What you can try today</h2>
                <div className="capability-list">
                  {[
                    "Seeded 2048 engine + replayable traces",
                    "Bounded planning tools + executable skill parameters",
                    "Teacher / peer review + evidence validation",
                    "Paired candidate verification + regression checks",
                    "Their notebooks + rollback",
                    "Frozen independent exams + JSON export",
                    "Server-side model tool loop + SQLite storage",
                    "Adaptive curriculum: per-skill checks + 80/20 scheduler",
                    "Four-arm CLI study, sealed seeds, paired intervals",
                    "Cost pilot + automated tests",
                  ].map((t) => (
                    <span key={t}>
                      <CheckCircle2 size={16} />
                      {t}
                    </span>
                  ))}
                </div>
                <p className="fine">
                  Coding tasks are the next environment, after the game learning
                  loop is validated. Simulation outcomes establish software
                  behavior, not LLM learning or cross-domain transfer.
                </p>
              </section>
            </div>
          )}
          <footer>
            Pip’s Classroom <span>Learning is better when you can see it.</span>
            <button onClick={() => setIntro(true)}>
              Meet the classroom <ArrowUp size={12} />
            </button>
          </footer>
        </main>
      </div>
      {intro && (
        <HowItWorks
          close={() => setIntro(false)}
          enter={() => {
            setIntro(false);
            setPage("classroom");
            window.scrollTo({ top: 0, behavior: "instant" });
          }}
        />
      )}
    </div>
  );
}
function TraceDetail({ trace }: { trace: Trace }) {
  return (
    <section className="panel trace-detail">
      <div className="panel-title">
        <h2>
          Move {trace.after.moves} · {trace.action}
        </h2>
        <span className="version">workspace v{trace.workspaceVersion}</span>
      </div>
      <div className="before-after">
        <div>
          <span className="eyebrow">BEFORE</span>
          <BoardView board={trace.before.board} small />
        </div>
        <ArrowRight size={20} />
        <div>
          <span className="eyebrow">AFTER</span>
          <BoardView board={trace.after.board} small />
        </div>
      </div>
      <div className="trace-summary">
        <b>{trace.summary}</b>
        <p>
          Empty cells {trace.before.empty} → {trace.after.empty} · score +
          {trace.scoreDelta} · {trace.tokens} tokens ·{" "}
          {trace.durationMs.toFixed(0)} ms
          {trace.exercise
            ? ` · targeted exercise: ${focusName(trace.exercise)}`
            : ""}
          {trace.lessonId
            ? ` · applied lesson ${trace.lessonId.slice(0, 8)}`
            : ""}
          {trace.invalid ? ` · ${trace.invalid} invalid tool requests` : ""}
        </p>
      </div>
      <h3 className="tool-heading">Tool activity</h3>
      <div className="tool-list">
        {trace.tools.map((t, i) => (
          <details key={i}>
            <summary>
              <span className="tool-number">{i + 1}</span>
              <code>{t.name}</code>
              <span>{t.durationMs.toFixed(1)} ms</span>
              <ChevronRight size={14} />
            </summary>
            <pre>
              {JSON.stringify({ arguments: t.args, result: t.result }, null, 2)}
            </pre>
          </details>
        ))}
      </div>
      <p className="fine">
        {trace.mode === "simulation"
          ? "Deterministic simulation controller"
          : "Live model-selected tools"}{" "}
        · trace {trace.id}
      </p>
    </section>
  );
}
