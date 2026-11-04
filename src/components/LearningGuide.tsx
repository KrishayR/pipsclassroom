import { useState } from "react";
import { BookOpen, X } from "lucide-react";
import Pip from "./Pip";

// Explains the steps of a learning session (Run Learning Session below runs them).
const steps = [
  {
    title: "First exam",
    text: "Ada, Lin and Sam each play a game alone, with no help. This is their starting score, so we can see later whether they improved.",
  },
  {
    title: "Practice",
    text: "Each student practises on boards chosen for its weakest skill: keeping room, keeping structure, or planning ahead. Every move is recorded, good and bad.",
  },
  {
    title: "Discuss",
    text: "The teacher reviews the student’s recorded mistakes, and a classmate shares a relevant example from its own games. Quick, free strategy experiments show which changes win. Together they propose one lesson: a rule plus a strategy setting.",
  },
  {
    title: "Test the lesson",
    text: "An idea is not a lesson yet. The student plays fresh boards with the lesson and without it. The lesson is kept only if it helps on the targeted boards and does not hurt general play. A rejected lesson gets one revision.",
  },
  {
    title: "Final exam",
    text: "The students play alone again with only their saved lessons, and no teacher or classmate. Comparing this score with the first exam shows what they learned.",
  },
];

export default function LearningGuide() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("pip-tour-dismissed-v2") !== "yes";
    } catch {
      return true;
    }
  });
  const [step, setStep] = useState(0);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem("pip-tour-dismissed-v2", open ? "yes" : "no");
    } catch {}
  };
  return (
    <section
      className="learning-guide"
      aria-label="How a learning session works"
    >
      <div className="guide-heading">
        <div>
          <h2>How does an agent get better?</h2>
        </div>
        <button className="secondary" onClick={toggle}>
          {open ? <X size={15} /> : <BookOpen size={15} />}{" "}
          {open ? "Hide guide" : "Show guide"}
        </button>
      </div>
      {open && (
        <>
          <div className="guide-steps" role="tablist">
            {steps.map((s, i) => (
              <div
                key={s.title}
                role="tab"
                tabIndex={0}
                aria-selected={i === step}
                className={i === step ? "active" : ""}
                onClick={() => setStep(i)}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && setStep(i)
                }
              >
                <b>{`0${i + 1}`}</b>
                <span>{s.title}</span>
              </div>
            ))}
          </div>
          <div className="guide-body">
            <Pip
              size={92}
              mood={step === steps.length - 1 ? "cheer" : "happy"}
            />
            <div>
              <span className="eyebrow">
                STEP {step + 1} OF {steps.length}
              </span>
              <h3>{steps[step].title}</h3>
              <p>{steps[step].text}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
