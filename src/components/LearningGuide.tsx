import { useState } from "react";
import { ArrowRight, BookOpen, Check, X } from "lucide-react";
import Pip from "./Pip";
import type { LabState } from "../core/types";

export default function LearningGuide({
  selected,
  navigate,
  state,
  busy,
  ready,
  run,
}: {
  selected: string;
  navigate: (page: string) => void;
  state: LabState;
  busy: boolean;
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
  const latest = checked.at(-1);
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
    "Make a few moves",
    "Ask for feedback",
    "Test the idea",
    "Try it independently",
    "Read the evidence",
  ];
  const descriptions = [
    "Watch three students slide and merge matching tiles. Each move leaves a record: what they saw, which tools they used, and what happened next.",
    "The class now has real moves to discuss. A review selects a skill to work on and proposes a rule grounded in recorded decisions.",
    "An idea is not a lesson yet. Compare it against the old approach on targeted boards, then check that it does not hurt general play.",
    "Now freeze the students’ notes and try fresh games without teacher hints. This short, 100-move exam demonstrates the workflow; it is not a full performance study.",
    "You have completed the learning loop. Inspect the outcomes, then compare teaching approaches to investigate whether the classroom helps.",
  ];
  const labels = [
    "Start guided practice",
    "Review a student",
    "Test this idea",
    "Run a short exam",
    "Explore classroom vs solo",
  ];
  const act = () => {
    if (stage === 0) {
      navigate("classroom");
      void run("practice", { steps: 6 });
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
          <span className="eyebrow">
            PIP’S FIELD GUIDE ·{" "}
            {state.mode === "simulation" ? "NO API KEY NEEDED" : "LIVE MODEL"}
          </span>
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
                  {busy ? "Classroom working…" : labels[stage]}
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
              <p className="guide-caption">
                {state.mode === "simulation"
                  ? "Simulation uses local game logic. Switch to a connected model in Configuration to study AI decisions."
                  : "These actions use the configured model and may consume API credits."}{" "}
                Progress follows this run automatically.
              </p>
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
      {open && latest?.verification && (
        <div className="learning-verdict">
          <span className="eyebrow">
            LATEST EVIDENCE ·{" "}
            {latest.verification.accepted ? "PASSED" : "DID NOT PASS"}
          </span>
          <h3>{latest.title}</h3>
          <p>
            {latest.verification.accepted
              ? "This idea passed the local checks."
              : "This idea did not meet the checks, so it was not adopted."}{" "}
            Targeted-board change:{" "}
            <b>
              {latest.verification.meanDelta >= 0 ? "+" : ""}
              {latest.verification.meanDelta.toFixed(1)}
            </b>{" "}
            · general-board change:{" "}
            <b>
              {latest.verification.regressionDelta >= 0 ? "+" : ""}
              {latest.verification.regressionDelta.toFixed(1)}
            </b>{" "}
            score points on average.
          </p>
          <button className="text-button" onClick={() => navigate("lessons")}>
            See the rule and paired checks <ArrowRight size={14} />
          </button>
          <p className="guide-caption">
            Passing a local check is a reason to try a skill, not proof of broad
            improvement. Learning updates notes and executable skills, not model
            weights.
          </p>
        </div>
      )}
      <details className="guide-utility">
        <summary>What could you use this for?</summary>
        <div className="utility-grid">
          <article>
            <span className="eyebrow">USE TODAY</span>
            <h3>Teach agent literacy</h3>
            <p>
              Show how an agent observes, uses tools, acts, and checks outcomes.
              Replay a decision instead of asking viewers to trust a black box.
            </p>
          </article>
          <article>
            <span className="eyebrow">USE TODAY</span>
            <h3>Investigate feedback</h3>
            <p>
              Compare classroom and solo practice in 2048. Inspect accepted and
              rejected ideas, then export the evidence for analysis.
            </p>
          </article>
          <article>
            <span className="eyebrow">FUTURE EXTENSIONS</span>
            <h3>Bring the loop to real work</h3>
            <p>
              Test coding repair strategies, support procedures, or scheduling
              rules. Each needs a new environment, tools, and independent
              evaluation; these integrations are not built yet.
            </p>
          </article>
        </div>
        <p className="guide-caption">
          Observe → propose → verify → remember → test independently. The game
          makes this reusable workflow visible and measurable.
        </p>
      </details>
    </section>
  );
}
