import { useState } from "react";
import { ArrowRight, BookOpen, Check, X } from "lucide-react";
import Pip from "./Pip";
import type { LabState } from "../core/types";

export default function LearningGuide({
  selected,
  navigate,
  state,
  busy,
  starting = false,
  recorded = false,
  ready,
  run,
}: {
  selected: string;
  navigate: (page: string) => void;
  state: LabState;
  busy: boolean;
  starting?: boolean;
  // A recorded run is shown read-only: nothing here can run.
  recorded?: boolean;
  ready: boolean;
  run: (name: string, params?: Record<string, unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("pip-tour-dismissed-v2") !== "yes";
    } catch {
      return true;
    }
  });
  const moves = state.students.reduce((n, s) => n + s.traces.length, 0);
  const checked = state.ledger.filter((l) => l.verification);
  const accepted = checked.filter((l) => l.verification?.accepted);
  const exam = state.exams.filter((e) => e.completedAt).at(-1);
  const stage = !moves
    ? 0
    : state.candidate
      ? 2
      : !checked.length
        ? 1
        : !exam
          ? 3
          : 4;
  const titles = [
    "Practice the three skills",
    "Ask for feedback",
    "Test the idea",
    "Try it independently",
    "Read the evidence",
  ];
  const descriptions = [
    "Each student tries short exercises in preserving room, keeping structure, and planning ahead. These reachable boards give the teacher and classmates relevant examples to discuss. Mistakes and successes are both recorded; a lesson still has to pass verification.",
    "The class now has real moves to discuss. A review selects a skill to work on and proposes a rule grounded in recorded decisions.",
    "An idea is not a lesson yet. Compare it against the old approach on targeted boards, then check that it does not hurt general play.",
    "Now freeze the students’ notes and try fresh games without teacher hints. This short, 100-move exam demonstrates the workflow; it is not a full performance study.",
    "You have completed the learning loop. Inspect the outcomes, then compare teaching approaches to investigate whether the classroom helps.",
  ];
  const labels = [
    "Start focused practice",
    "Review a student",
    "Test this idea",
    "Run a short exam",
    "Explore classroom vs solo",
  ];
  const act = () => {
    if (stage === 0) {
      navigate("classroom");
      void run("diagnose");
    }
    if (stage === 1) {
      navigate("classroom");
      void run("review", { studentId: selected });
    }
    if (stage === 2) {
      navigate("classroom");
      void run("verify");
    }
    if (stage === 3) {
      navigate("results");
      void run("exam", { seedCount: 1, cap: 100 });
    }
    if (stage === 4) navigate("compare");
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
    >
      <div className="guide-heading">
        <div>
          <h2>How does an agent get better?</h2>
        </div>
        <button
          className="secondary"
          onClick={() => (open ? dismiss() : setOpen(true))}
        >
          {open ? <X size={15} /> : <BookOpen size={15} />}{" "}
          {open ? "Hide guide" : "Show walkthrough"}
        </button>
      </div>
      {open && (
        <>
          <div className="guide-steps">
            {titles.map((title, i) => (
              <div
                key={title}
                aria-current={i === stage ? "step" : undefined}
                className={i === stage ? "active" : i < stage ? "done" : ""}
              >
                <b>{i < stage ? <Check size={16} /> : `0${i + 1}`}</b>
                <span>{title}</span>
              </div>
            ))}
          </div>
          <div className="guide-body">
            <Pip
              size={92}
              mood={busy ? "thinking" : stage === 4 ? "cheer" : "happy"}
            />
            <div>
              <span className="eyebrow">
                {stage === 4
                  ? "YOUR FIRST LOOP IS COMPLETE"
                  : `NEXT UP · STEP ${stage + 1} OF 5`}
              </span>
              <h3>{titles[stage]}</h3>
              <p>{descriptions[stage]}</p>
              <div className="controls">
                <button
                  className="primary"
                  disabled={busy || !ready}
                  onClick={act}
                >
                  {recorded
                    ? "Recorded run · read-only"
                    : starting
                      ? "Starting…"
                      : busy
                        ? "Classroom working…"
                        : labels[stage]}
                  <ArrowRight size={15} />
                </button>
                {moves > 0 && (
                  <button
                    className="secondary"
                    onClick={() => navigate("traces")}
                  >
                    Explain a recorded move
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      <div className="guide-evidence" aria-live="polite">
        <span>
          <b>{moves}</b> recorded decisions
        </span>
        <span>
          <b>{checked.length}</b> ideas tested
        </span>
        <span>
          <b>{accepted.length}</b> passed verification
        </span>
        <span>
          <b>{state.exams.filter((e) => e.completedAt).length}</b> completed
          exams
        </span>
      </div>
    </section>
  );
}
