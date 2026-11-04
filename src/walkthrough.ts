import type { LabState } from "./core/types";

export interface GuideRunResult {
  ok: boolean;
  error?: string;
}
interface Activity {
  step: number;
  studentId: string;
  candidateId?: string;
  messageIds: string[];
  examIds: string[];
  previousError: string | null;
  accepted: boolean;
  seenBusy: boolean;
}
export interface Walkthrough {
  step: number;
  completed: boolean[];
  activity?: Activity;
  failure?: { step: number; message: string };
}
export const newWalkthrough = (): Walkthrough => ({
  step: 0,
  completed: Array(5).fill(false),
});
type Event =
  | { type: "view"; step: number }
  | { type: "start"; state: LabState; studentId: string }
  | { type: "accepted"; result: GuideRunResult }
  | { type: "observe"; state: LabState }
  | { type: "read" };

// Explanation navigation never performs a classroom action. Only evidence created
// after this attempt can complete its action, regardless of the existing history.
export function walkthroughReducer(
  tour: Walkthrough,
  event: Event,
): Walkthrough {
  if (event.type === "view")
    return { ...tour, step: Math.max(0, Math.min(4, event.step)) };
  if (event.type === "read")
    return {
      ...tour,
      completed: tour.completed.map((done, i) => done || i === 4),
    };
  if (event.type === "start")
    return {
      ...tour,
      failure: undefined,
      activity: {
        step: tour.step,
        studentId: event.studentId,
        candidateId: event.state.candidate?.lesson.id,
        messageIds: event.state.messages.map((m) => m.id),
        examIds: event.state.exams.map((e) => e.id),
        previousError: event.state.error,
        accepted: false,
        seenBusy: false,
      },
    };
  const activity = tour.activity;
  if (!activity) return tour;
  const fail = (message: string): Walkthrough => ({
    ...tour,
    activity: undefined,
    failure: { step: activity.step, message },
  });
  if (event.type === "accepted")
    return event.result.ok
      ? { ...tour, activity: { ...activity, accepted: true } }
      : fail(
          event.result.error ??
            "The action could not start. Try again when the classroom is ready.",
        );
  if (event.type !== "observe") return tour;
  const state = event.state;
  if (state.busy) return { ...tour, activity: { ...activity, seenBusy: true } };
  if (!activity.accepted) return tour;
  if (
    state.error &&
    (activity.seenBusy || state.error !== activity.previousError)
  )
    return fail(state.error);
  const newExam = state.exams.find((e) => !activity.examIds.includes(e.id));
  if (
    activity.step === 3 &&
    newExam?.completedAt &&
    newExam.rows.some((r) => r.terminal === "error")
  )
    return fail(
      "The exam ended with an error. Partial results were saved; this step is not complete.",
    );
  const finished =
    activity.step === 0
      ? state.messages.some(
          (m) =>
            !activity.messageIds.includes(m.id) &&
            m.title === "Diagnostic practice finished",
        )
      : activity.step === 1
        ? !!state.candidate &&
          state.candidate.studentId === activity.studentId &&
          state.candidate.lesson.id !== activity.candidateId
        : activity.step === 2
          ? !state.candidate &&
            state.ledger.some(
              (l) => l.id === activity.candidateId && !!l.verification,
            )
          : activity.step === 3 &&
            !!newExam?.completedAt &&
            newExam.rows.length > 0;
  if (finished)
    return {
      ...tour,
      activity: undefined,
      failure: undefined,
      completed: tour.completed.map((done, i) => done || i === activity.step),
    };
  if (activity.seenBusy)
    return fail(
      "The action stopped before finishing. Your recorded data is kept. You can retry or continue reading the guide.",
    );
  return tour;
}
