import { useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Square,
  X,
} from "lucide-react";
import Pip from "./Pip";
import type { LabState } from "../core/types";
import {
  newWalkthrough,
  walkthroughReducer,
  type GuideRunResult,
} from "../walkthrough";

const titles = [
  "Practice the three skills",
  "Ask for feedback",
  "Test the idea",
  "Try it independently",
  "Read the evidence",
];
const descriptions = [
  "Focused practice records each student’s decisions about room, structure and planning. Those examples give the teacher and classmates something concrete to discuss.",
  "Review the selected student’s evidence. The teacher proposes a conditional rule; an eligible classmate may contribute a recorded example. The idea is not saved as a lesson yet.",
  "Compare the pending idea with the current approach on targeted and general boards. Accepted and rejected outcomes both complete this step. Only passing lessons enter the notebook.",
  "Freeze the notebooks and run a short, 100-move exam without teacher or peer help. This demonstrates the workflow; longer games and repeated comparisons are needed to measure improvement.",
  "Inspect the saved lesson verdicts and independent exam scores. Passing a local check does not guarantee better game scores. Compare teaching approaches when you are ready for a separate experiment.",
];
const labels = [
  "Run focused practice",
  "Review selected student",
  "Test pending idea",
  "Run 100-move exam",
];

export default function LearningGuide({
  selected,
  navigate,
  state,
  busy,
  stopping = false,
  recorded = false,
  visible = true,
  ready,
  run,
}: {
  selected: string;
  navigate: (page: string) => void;
  state: LabState;
  busy: boolean;
  stopping?: boolean;
  recorded?: boolean;
  visible?: boolean;
  ready: boolean;
  run: (
    name: string,
    params?: Record<string, unknown>,
  ) => Promise<GuideRunResult>;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("pip-tour-dismissed-v2") !== "yes";
    } catch {
      return true;
    }
  });
  const [tour, dispatch] = useReducer(
    walkthroughReducer,
    undefined,
    newWalkthrough,
  );
  const actionLock = useRef(false);
  useEffect(() => {
    if (!recorded) dispatch({ type: "observe", state });
  }, [state, tour.activity?.accepted, recorded]);
  const stage = tour.step;
  const running = tour.activity?.step === stage;
  const failure =
    tour.failure?.step === stage ? tour.failure.message : undefined;
  const completed = tour.completed[stage];
  const student = state.students.find((s) => s.id === selected);
  const moves = state.students.reduce((n, s) => n + s.traces.length, 0);
  const checked = state.ledger.filter((l) => l.verification);
  const prerequisite =
    stage === 0 && state.candidate
      ? "An idea is already waiting. Open ‘Test the idea’ before starting more practice."
      : stage === 1 && state.candidate
        ? "An idea is already waiting. Open ‘Test the idea’ to check it."
        : stage === 1 && !student?.traces.length
          ? "Run focused practice first so the selected student has evidence to review."
          : stage === 2 && !state.candidate
            ? "Review a student to create a pending idea first."
            : stage === 3 && state.candidate
              ? "Test the pending idea before running this walkthrough’s exam."
              : undefined;
  const status = recorded
    ? "Read-only"
    : running
      ? tour.activity?.accepted
        ? "Running"
        : "Starting"
      : failure
        ? "Failed"
        : completed
          ? "Completed"
          : busy
            ? "Classroom busy"
            : prerequisite
              ? "Needs earlier step"
              : "Ready";
  const act = async () => {
    if (
      actionLock.current ||
      busy ||
      !ready ||
      recorded ||
      tour.activity ||
      completed ||
      prerequisite ||
      stage === 4
    )
      return;
    actionLock.current = true;
    dispatch({ type: "start", state, studentId: selected });
    try {
      const actions = ["diagnose", "review", "verify", "exam"];
      const params =
        stage === 1
          ? { studentId: selected }
          : stage === 3
            ? { seedCount: 1, cap: 100 }
            : {};
      const result = await run(actions[stage], params);
      dispatch({ type: "accepted", result });
      if (result.ok && stage === 3) navigate("results");
    } catch (error) {
      dispatch({
        type: "accepted",
        result: {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "The walkthrough action failed.",
        },
      });
    } finally {
      actionLock.current = false;
    }
  };
  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem("pip-tour-dismissed-v2", "yes");
    } catch {}
  };
  return (
    <section
      className="learning-guide"
      aria-label="Pip’s interactive walkthrough"
      hidden={!visible}
    >
      <div className="guide-heading">
        <div>
          <h2>How does an agent get better?</h2>
        </div>
        <button
          className="secondary"
          onClick={() => (open ? dismiss() : setOpen(true))}
          aria-expanded={open}
        >
          {open ? <X size={15} /> : <BookOpen size={15} />}{" "}
          {open ? "Hide guide" : "Show walkthrough"}
        </button>
      </div>
      {open && (
        <>
          <nav className="guide-steps" aria-label="Walkthrough steps">
            {titles.map((title, i) => (
              <button
                type="button"
                key={title}
                aria-current={i === stage ? "step" : undefined}
                className={
                  i === stage ? "active" : tour.completed[i] ? "done" : ""
                }
                onClick={() => dispatch({ type: "view", step: i })}
              >
                <b>
                  {tour.completed[i] ? (
                    <Check size={16} aria-label="Completed" />
                  ) : (
                    `0${i + 1}`
                  )}
                </b>
                <span>{title}</span>
              </button>
            ))}
          </nav>
          <div className="guide-body">
            <Pip
              size={80}
              mood={tour.activity ? "thinking" : completed ? "cheer" : "happy"}
            />
            <div className="guide-copy">
              <div className="guide-step-heading">
                <span className="eyebrow">STEP {stage + 1} OF 5</span>
                <span
                  className={`guide-status ${failure ? "failed" : completed ? "completed" : running ? "running" : ""}`}
                  role="status"
                >
                  {status}
                </span>
              </div>
              <h3>{titles[stage]}</h3>
              <p>{descriptions[stage]}</p>
              {tour.activity && !running && (
                <p className="guide-caption">
                  The action for step {tour.activity.step + 1} is still running.
                  You can read other steps while it finishes.
                </p>
              )}
              {failure && (
                <p className="guide-error" role="alert">
                  {failure}
                </p>
              )}
              {prerequisite && <p className="guide-caption">{prerequisite}</p>}
              {completed && stage === 2 && (
                <p className="guide-caption">
                  The idea was checked. A rejection is a valid result; it keeps
                  the previous notebook unchanged.
                </p>
              )}
              <div className="controls">
                {stage < 4 ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      busy ||
                      !ready ||
                      recorded ||
                      !!tour.activity ||
                      completed ||
                      !!prerequisite
                    }
                    onClick={() => void act()}
                    aria-busy={running}
                  >
                    {running
                      ? `${status}…`
                      : completed
                        ? "Completed"
                        : failure
                          ? "Retry this action"
                          : labels[stage]}{" "}
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <button
                    className="primary"
                    onClick={() => {
                      dispatch({ type: "read" });
                      navigate("results");
                    }}
                  >
                    View exam results <ArrowRight size={15} />
                  </button>
                )}
                {tour.activity && busy && !recorded && (
                  <button
                    className="secondary"
                    disabled={stopping}
                    aria-busy={stopping}
                    onClick={() => void run("stop")}
                  >
                    <Square size={15} />
                    {stopping ? "Stopping…" : "Stop current action"}
                  </button>
                )}
                {stage === 4 && (
                  <button
                    className="secondary"
                    onClick={() => {
                      dispatch({ type: "read" });
                      navigate("compare");
                    }}
                  >
                    Explore classroom vs solo
                  </button>
                )}
                {moves > 0 && (
                  <button
                    className="secondary"
                    onClick={() => navigate("traces")}
                  >
                    Inspect a recorded move
                  </button>
                )}
              </div>
              <p className="guide-caption">
                Back, Next and step cards only change the explanation.{" "}
                {recorded
                  ? "Recorded classroom actions are disabled."
                  : state.mode === "model"
                    ? "Run buttons use Muse credits and change the current classroom."
                    : "Run buttons use local simulation in the current classroom."}
              </p>
              <div className="guide-navigation">
                <button
                  className="secondary"
                  disabled={stage === 0}
                  onClick={() => dispatch({ type: "view", step: stage - 1 })}
                >
                  <ArrowLeft size={15} /> Back
                </button>
                <span>
                  {tour.completed.slice(0, 4).filter(Boolean).length}/4 guided
                  actions completed
                </span>
                <button
                  className="secondary"
                  disabled={stage === 4}
                  onClick={() => dispatch({ type: "view", step: stage + 1 })}
                >
                  Next <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      <div className="guide-evidence" aria-label="Current classroom totals">
        <span>
          <b>{moves}</b> recorded decisions
        </span>
        <span>
          <b>{checked.length}</b> ideas tested
        </span>
        <span>
          <b>{checked.filter((l) => l.verification?.accepted).length}</b> passed
          verification
        </span>
        <span>
          <b>{state.exams.filter((e) => e.completedAt).length}</b> completed
          exams
        </span>
      </div>
    </section>
  );
}
