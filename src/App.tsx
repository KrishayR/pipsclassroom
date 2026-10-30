import { useEffect, useState } from "react";
import LearningRecord from "./components/LearningRecord";
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
  ChevronRight,
  Code2,
  Download,
  FlaskConical,
  GraduationCap,
  Layers,
  Lightbulb,
  LockKeyhole,
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
import { action, connect, exportRun, watch, type Connection } from "./client";
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
  { id: "lessons", name: "Saved lessons", icon: BookOpen },
  { id: "compare", name: "Classroom vs solo", icon: Users },
  { id: "results", name: "Test results", icon: GraduationCap },
  { id: "traces", name: "Watch a decision", icon: Activity },
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
  busy,
  exam,
}: {
  student: Student;
  selected: boolean;
  onSelect: () => void;
  busy: boolean;
  exam: boolean;
}) {
  const last = exam ? undefined : student.traces.at(-1);
  const Icon = last ? directions[last.action] : Activity;
  return (
    <button
      className={`student-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
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
      <div className="student-footer">
        <span>
          <Layers size={13} />
          {student.workspace.lessons.length} saved lessons
        </span>
        <span>
          Inspect <ChevronRight size={13} />
        </span>
      </div>
    </button>
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
        <b>When</b> {lesson.trigger}
        <br />
        <b>Exception</b> {lesson.exception}
        {lesson.sensitivity && (
          <>
            <br />
            <b>Changes the plan</b> on {lesson.sensitivity.changed} of{" "}
            {lesson.sensitivity.boards} sample boards
          </>
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
function HowItWorks({ close }: { close: () => void }) {
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
        <button className="primary" onClick={close}>
          Enter the classroom <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
export default function App() {
  const [connection, setConnection] = useState<Connection | null>(null),
    [mode, setMode] = useState<Mode>("simulation"),
    [state, setState] = useState<LabState>(() => initialState()),
    [page, setPage] = useState("classroom"),
    [selected, setSelected] = useState("student-1"),
    [intro, setIntro] = useState(false),
    [error, setError] = useState(""),
    [traceId, setTraceId] = useState<string | null>(null),
    [cap, setCap] = useState(1500),
    [seedCount, setSeedCount] = useState(3),
    [batchCycles, setBatchCycles] = useState("3"),
    [pending, setPending] = useState(false),
    [replaying, setReplaying] = useState(false);
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
    if (!connection) return;
    setError("");
    setPending(true);
    try {
      await action(connection, mode, name, params);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setPending(false);
    }
  };
  const busy = state.busy || pending || state.liveBatch?.status === "running";
  const student =
    state.students.find((s) => s.id === selected) ?? state.students[0];
  const traces = state.students.flatMap((s) => s.traces);
  const chosenTrace =
    traces.find((t) => t.id === traceId) ?? student.traces.at(-1);
  const lastExam = state.exams.at(-1);
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
    if (!replaying || page !== "traces") return;
    const timer = setTimeout(() => {
      if (replayIndex + 1 >= replayTraces.length) setReplaying(false);
      else setTraceId(replayTraces[replayIndex + 1].id);
    }, 650);
    return () => clearTimeout(timer);
  }, [replaying, page, replayIndex, replayTraces]);
  const inspect = (id: string) => {
    setTraceId(id);
    setPage("traces");
  };
  const download = async () => {
    if (!connection) return;
    try {
      const data = await exportRun(connection, mode);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `pips-classroom-${mode}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not export this run.");
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("classroom");
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
              className={page === id ? "active" : ""}
            >
              <Icon size={18} />
              {name}
              {id === "lessons" && state.ledger.length > 0 ? (
                <span className="nav-count">{state.ledger.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-experiment">
          <span className="eyebrow">EXPERIMENT 001</span>
          <h3>
            Learning through
            <br />
            consequences.
          </h3>
          <p>
            One teacher.
            <br />
            Three independent minds.
            <br />A test that tells the truth.
          </p>
          <div className="sidebar-tiles">
            <span>2</span>
            <span>4</span>
            <span>8</span>
            <span>?</span>
          </div>
        </div>
        <div className="sidebar-bottom">
          <button
            onClick={() => setPage("settings")}
            className={page === "settings" ? "active" : ""}
          >
            <Settings2 size={18} />
            Lab configuration
          </button>
          <div className="connection">
            <span className="dot" />
            {connection?.kind === "server"
              ? "Local server · SQLite"
              : "Browser workspace"}
            <span>v0.2</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span>Pip’s Classroom</span>
            <ChevronRight size={14} />
            <b>{pages.find((p) => p.id === page)?.name ?? "Configuration"}</b>
          </div>
          <div className="top-actions">
            <span className={`mode-badge ${mode}`}>
              <span className="dot" />
              {mode === "simulation" ? "Simulation mode" : "Live model mode"}
            </span>
            <button
              className="icon-button"
              aria-label="Export full run"
              onClick={download}
            >
              <Download size={17} />
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
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              <Icon size={17} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">OBSERVE. TEACH. VERIFY.</div>
              <h1>
                {page === "classroom"
                  ? "Watch agents turn practice into tested lessons."
                  : page === "lessons"
                    ? "Good ideas have to prove themselves."
                    : page === "compare"
                      ? "Better together? Let’s find out."
                      : page === "results"
                        ? "What can they do on their own?"
                        : page === "traces"
                          ? "Let’s look at that move."
                          : "Set up your classroom."}
              </h1>
              <p>
                {page === "classroom"
                  ? "Watch AI students try, share ideas, and find out what actually helps."
                  : page === "lessons"
                    ? "Students keep the advice that helps on new boards. The rest stays here too."
                    : page === "compare"
                      ? "Same starting point. Different ways to learn. One fair question."
                      : page === "results"
                        ? "Fresh games, saved lessons, and no hints from the teacher or classmates."
                        : page === "traces"
                          ? "See what the student checked, what it chose, and what happened next."
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
          <div className="pip-guide">
            <Pip
              size={68}
              mood={
                state.busy
                  ? "thinking"
                  : state.ledger.some((l) => l.status === "verified")
                    ? "cheer"
                    : "happy"
              }
            />
            <div>
              <b>Hi, I’m Pip. I’ll show you around.</b>
              <p>
                {state.busy
                  ? "They’re working on it. You can watch the steps or stop after the current move."
                  : page === "compare"
                    ? "Here’s our little experiment: four fresh study groups, then the same test with no hints."
                    : state.candidate
                      ? `${state.students.find((s) => s.id === state.candidate?.studentId)?.name ?? "A student"} has an idea to try. Let’s test it before calling it a lesson.`
                      : state.phase === "exam"
                        ? "The hints are off. This is where we see what the students can do by themselves."
                        : "The big question: do students learn more with a teacher and classmates than by practicing alone?"}
              </p>
            </div>
            <span className="pip-label">YOUR CLASSROOM GUIDE</span>
          </div>
          <div className="mode-notice">
            <FlaskConical size={15} />
            <span>
              {mode === "simulation" ? (
                <>
                  You’re trying the simulation. The students use local game
                  logic, not an LLM. <b>Connect a model to test AI learning.</b>
                </>
              ) : (
                <>
                  Live model decisions · <b>{state.modelId}</b> · credentials
                  stay on the server.
                </>
              )}
            </span>
            <button onClick={() => setPage("settings")}>
              {mode === "simulation" ? "Connect a model" : "View configuration"}
              <ArrowRight size={13} />
            </button>
          </div>
          <LearningGuide
            selected={selected}
            navigate={setPage}
            state={state}
            busy={busy}
            ready={!!connection}
            run={run}
          />
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
                    className={state.phase === phase ? "current" : ""}
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
              <div className="section-bar">
                <div>
                  <h2>
                    The classroom <span>3 students</span>
                  </h2>
                  <p>
                    {state.busy
                      ? `${state.phase[0].toUpperCase() + state.phase.slice(1)} in progress…`
                      : "Everyone gets the same tools and keeps their own notes."}
                  </p>
                </div>
                <div className="controls">
                  {busy ? (
                    <button className="secondary" onClick={() => run("stop")}>
                      <Square size={14} />
                      Stop
                    </button>
                  ) : (
                    <>
                      <button
                        className="secondary"
                        disabled={!traces.length || !!state.candidate}
                        onClick={() => run("review", { studentId: selected })}
                      >
                        <Users size={15} />
                        Discuss
                      </button>
                      {mode === "model" && connection?.kind === "server" && (
                        <>
                          <label>
                            Cycles{" "}
                            <input
                              aria-label="Live learning cycles"
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              value={batchCycles}
                              onChange={(e) => setBatchCycles(e.target.value)}
                              style={{ width: 72 }}
                            />
                          </label>
                          <button
                            className="primary"
                            disabled={
                              !Number.isInteger(Number(batchCycles)) ||
                              Number(batchCycles) < 1 ||
                              Number(batchCycles) > 100
                            }
                            onClick={() =>
                              run("live-batch", { cycles: Number(batchCycles) })
                            }
                          >
                            <Play size={14} />
                            Run {batchCycles || "…"} live cycles · $1 max
                          </button>
                        </>
                      )}
                      <button
                        className="secondary"
                        onClick={() => run("diagnose")}
                        disabled={!connection || !!state.candidate}
                      >
                        <FlaskConical size={14} />
                        Focused practice
                      </button>
                      <button
                        className="primary"
                        onClick={() => run("practice", { steps: 12 })}
                        disabled={!connection}
                      >
                        <Play size={14} />
                        Start practice
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="fine">
                {mode === "model" &&
                  "Choose 1–100 cycles. Three cycles give Ada, Lin and Sam one teaching attempt each. Three students play side by side; verification can run 6 independent rollouts at once. Each rejected lesson gets at most one teacher revision, tested on fresh boards. Each cycle ends with a 25-move exam per student; exam moves are saved. The batch uses a fresh classroom; your manual classroom returns afterward. The $1 estimated budget stays fixed; it may stop early. Results save automatically; keep the server running. "}
                Focused practice gives every student short exercises in all
                three skills, so reviews have relevant examples to discuss.
                Their regular games and saved notes stay in place.
                {mode === "model" ? " These exercises use API credits." : ""}
              </p>
              {mode === "model" && state.liveBatch && (
                <p role="status" className="fine">
                  <b>{state.liveBatch.stage}</b> · {state.liveBatch.completed}/
                  {state.liveBatch.total}
                  cycles saved · estimated $
                  {state.liveBatch.spentUsd.toFixed(4)} used. Results:{" "}
                  {state.liveBatch.directory}/status.json
                </p>
              )}
              {mode === "model" && !!state.liveBatch?.cycles.length && (
                <details>
                  <summary>Inspect completed teaching attempts</summary>
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
                      {mode === "simulation"
                        ? "Simulation example · generated from recorded moves"
                        : "AI feedback · still needs to pass a test"}
                    </span>
                  </div>
                  <button
                    disabled={busy || !traces.length || !!state.candidate}
                    onClick={() => run("review", { studentId: selected })}
                  >
                    Review {student.name}’s attempt <ArrowRight size={15} />
                  </button>
                </aside>
              </div>
              <LearningRecord
                student={student}
                mode={mode}
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
                          Press Start practice. You’ll see each student check
                          the board, try out moves, and make a choice.
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
                      <button
                        className="primary full"
                        disabled={busy}
                        onClick={() => run("verify")}
                      >
                        <ShieldCheck size={15} />
                        Test this idea
                      </button>
                      <p className="fine">
                        We’ll compare old and new notes on fresh boards chosen
                        for this skill, plus a few general check-up boards.
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
          {page === "compare" && (
            <ComparisonPanel
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
                mode={mode}
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
                    Run verification
                  </button>
                </div>
              )}
              <h2>Classroom idea archive</h2>
              <p className="fine">
                All students’ tested ideas, including rejected and retired ones.
                The individual notebook above shows only the selected student’s
                active memory.
              </p>
              {state.ledger.length ? (
                <div className="lesson-grid">
                  {[...state.ledger].reverse().map((l) => (
                    <div key={l.id}>
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
          {page === "results" && (
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
                  Start the test
                </button>
              </div>
              <div className="exam-config">
                <label>
                  Games per student
                  <select
                    value={seedCount}
                    disabled={busy}
                    onChange={(e) => setSeedCount(Number(e.target.value))}
                  >
                    {[1, 3, 6, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} development seeds
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Maximum valid moves
                  <select
                    value={cap}
                    disabled={busy}
                    onChange={(e) => setCap(Number(e.target.value))}
                  >
                    {[100, 500, 1500, 3000].map((n) => (
                      <option key={n} value={n}>
                        {n}
                        {n === 100 ? " · short smoke test" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  Short caps test the workflow. These are public development
                  seeds; the final study uses sealed seeds via the evaluation
                  runner.
                </p>
              </div>
              {lastExam && stats ? (
                <>
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
                      <h2>Latest exam · {lastExam.arm}</h2>
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
                      min={0}
                      max={Math.max(0, replayTraces.length - 1)}
                      value={Math.max(0, replayIndex)}
                      onChange={(e) => {
                        setReplaying(false);
                        setTraceId(replayTraces[Number(e.target.value)].id);
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
                  Start practice, then come back to replay a move and open the
                  tool results.
                </Empty>
              )}
            </>
          )}
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
                  <b>Connect a live model</b>
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
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => connect().then(setConnection)}
                  >
                    Refresh connection
                  </button>
                  <p>
                    <b>Connection:</b>{" "}
                    {connection?.kind === "server"
                      ? connection.modelAvailable
                        ? "Model configured; a successful move is still needed to verify credentials and compatibility."
                        : "Server connected; no model key configured."
                      : "Browser-only simulation; start the local backend for model mode."}
                  </p>
                  <p>
                    <b>What gets sent:</b> game boards, recent moves, saved
                    rules, and review evidence. The server makes model requests;
                    the key stays out of the browser. The supplied example
                    selects Contributor mode: review your provider’s data-use
                    terms before using it.
                  </p>
                  <p>
                    <b>What changes:</b> the model chooses moves and writes
                    review advice. The engine checks legal moves; paired tests
                    decide whether a lesson is stored. Each student has separate
                    memory, using the same configured model.
                  </p>
                  <p>
                    <b>Cost:</b> practice, peer feedback, verification rollouts,
                    and exams can all make paid calls. Token limits and
                    estimated key spending are configured in the environment
                    file; they are not a guaranteed provider billing cap.
                  </p>
                  <button
                    className="primary"
                    disabled={
                      busy || mode !== "model" || !connection?.modelAvailable
                    }
                    onClick={() => run("practice", { steps: 1 })}
                  >
                    Test connection · one move per student
                  </button>
                  <p>
                    Copy <code>.env.example</code> to <code>.env</code> in the
                    project, set <code>MODEL_API_KEY</code>, and restart{" "}
                    <code>npm run dev</code>. Reload this page after the server
                    starts.
                  </p>
                  <p>
                    Model endpoint and ID are configurable. No credential is
                    stored in the browser.
                  </p>
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
                  <select
                    value={state.arm}
                    disabled={busy || !!traces.length || !!state.ledger.length}
                    onChange={(e) => run("arm", { arm: e.target.value })}
                  >
                    {ARMS.map((a) => (
                      <option key={a} value={a}>
                        {armNames[a]}
                      </option>
                    ))}
                  </select>
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
      {intro && <HowItWorks close={() => setIntro(false)} />}
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
