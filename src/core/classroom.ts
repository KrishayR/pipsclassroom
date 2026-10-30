import {
  analyze,
  createGame,
  hash,
  move,
  observe,
  snapshotPool,
  fromBoard,
} from "./engine";
import {
  emptyWorkspace,
  installLesson,
  LESSON_TRIGGERS,
  mergeLessons,
  validateSkill,
} from "./skills";
import { decisionSeed, lessonSensitivity } from "./policy";
import { mapConcurrent } from "./concurrency";
import {
  chooseFocus,
  FOCI,
  focusApplies,
  focusOutcome,
  skillEstimates,
} from "./curriculum";
import {
  DEFAULT_MOVE_CAP,
  DEFAULT_VERIFY,
  DEV_SEEDS,
  examEpisode,
  isAgentError,
  verifyCandidate,
  type VerifyOptions,
} from "./evaluation";
import type {
  Arm,
  FocusChoice,
  Game,
  Lesson,
  Workspace,
  LabState,
  Message,
  Policy,
  Student,
} from "./types";
export const ARMS: Arm[] = ["solo", "teacher", "adaptive", "classroom"];
// The workspace a candidate lesson would produce, as verification tests it.
export function candidateWorkspace(
  current: Workspace,
  draft: Pick<Lesson, "skill" | "trigger" | "focus">,
): Workspace {
  const lesson: Lesson = {
    id: "draft",
    title: "",
    rule: "",
    exception: "",
    source: "",
    evidence: [],
    createdAt: "",
    ...draft,
    status: "verified",
  };
  return {
    version: current.version + 1,
    skill: draft.skill,
    lessons: mergeLessons(current.lessons, lesson),
  };
}
export interface ClassroomOptions {
  verify?: VerifyOptions;
  // Moves in the short targeted exercise that precedes each review (0 disables).
  exerciseMoves?: number;
  concurrency?: number;
  verificationConcurrency?: number;
}
const clone = <T>(v: T): T => structuredClone(v);
const id = () => crypto.randomUUID();
export function initialState(mode: Policy["mode"] = "simulation"): LabState {
  const students = ["Ada", "Lin", "Sam"].map((name, i): Student => ({
    id: `student-${i + 1}`,
    name,
    color: ["sage", "clay", "blue"][i],
    game: createGame(hash(`practice:0:${i}`)),
    episodeId: `practice:0:${i}`,
    workspace: emptyWorkspace(),
    history: [],
    traces: [],
    episodes: 1,
    status: "Ready to practice",
  }));
  return {
    schemaVersion: 1,
    id: id(),
    mode,
    phase: "idle",
    arm: "classroom",
    students,
    messages: [],
    candidate: null,
    ledger: [],
    exams: [],
    tokens: 0,
    calls: 0,
    simulations: 0,
    busy: false,
    error: null,
    trainingRound: 0,
    selectedSkill: "Not chosen yet",
    focus: null,
    modelId: null,
    comparisons: [],
  };
}
export class Classroom {
  state: LabState;
  private listeners = new Set<(state: LabState) => void>();
  private cancelled = false;
  readonly verifyOptions: VerifyOptions;
  readonly exerciseMoves: number;
  readonly concurrency: number;
  readonly verificationConcurrency: number;
  constructor(
    public policy: Policy,
    state?: LabState,
    public options: ClassroomOptions = {},
  ) {
    this.verifyOptions = options.verify ?? DEFAULT_VERIFY;
    this.exerciseMoves = options.exerciseMoves ?? 4;
    this.concurrency = options.concurrency ?? 1;
    this.verificationConcurrency =
      options.verificationConcurrency ?? this.concurrency;
    if (
      !Number.isInteger(this.concurrency) ||
      this.concurrency < 1 ||
      this.concurrency > 6
    )
      throw new Error("Classroom concurrency must be 1–6.");
    if (
      !Number.isInteger(this.verificationConcurrency) ||
      this.verificationConcurrency < 1 ||
      this.verificationConcurrency > 6
    )
      throw new Error("Verification concurrency must be 1–6.");
    this.state = state ?? initialState(policy.mode);
    this.state.comparisons ??= [];
    this.state.focus ??= null;
    this.state.mode = policy.mode;
    this.state.modelId = policy.modelId ?? null;
    if (this.state.busy)
      this.state.error =
        "The previous operation was interrupted. Its recorded results are preserved.";
    this.state.busy = false;
  }
  subscribe(fn: (s: LabState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  emit() {
    this.listeners.forEach((fn) => fn(clone(this.state)));
  }
  private message(
    role: Message["role"],
    title: string,
    text: string,
    evidence?: string[],
  ) {
    this.state.messages.push({
      id: id(),
      role,
      title,
      text,
      evidence,
      time: new Date().toISOString(),
    });
    this.state.messages = this.state.messages.slice(-100);
  }
  private usage = (tokens: number, calls: number, simulations: number) => {
    this.state.tokens += tokens;
    this.state.calls += calls;
    this.state.simulations += simulations;
  };
  private async task(phase: LabState["phase"], fn: () => Promise<void>) {
    if (this.state.busy)
      throw new Error("A classroom operation is already running.");
    this.cancelled = false;
    this.state.busy = true;
    this.state.phase = phase;
    this.state.error = null;
    this.emit();
    try {
      await fn();
    } catch (e) {
      this.state.error = e instanceof Error ? e.message : "Operation failed";
      throw e;
    } finally {
      this.state.busy = false;
      this.emit();
    }
  }
  stop() {
    this.cancelled = true;
    this.message(
      "system",
      "Stopping",
      "The current bounded action will finish; no new actions will begin.",
    );
    this.emit();
  }
  setArm(arm: Arm) {
    if (
      this.state.busy ||
      this.state.students.some((s) => s.traces.length) ||
      this.state.ledger.length
    )
      throw new Error("Reset before changing the experiment condition.");
    this.state.arm = arm;
    this.emit();
  }
  reset() {
    if (this.state.busy)
      throw new Error("Stop the current operation before resetting.");
    this.state = initialState(this.policy.mode);
    this.state.modelId = this.policy.modelId ?? null;
    this.emit();
  }
  // One recorded decision on the student's current game. Returns false when an
  // agent-level failure ended the episode (see isAgentError).
  private async step(student: Student, exercise?: FocusChoice) {
    const before = observe(student.game);
    const started = performance.now();
    const recent = student.traces
      .filter((t) => t.episodeId === student.episodeId)
      .slice(-3)
      .map((t) => ({
        action: t.action,
        scoreDelta: t.scoreDelta,
        emptyBefore: t.before.empty,
        emptyAfter: t.after.empty,
      }));
    let decision;
    try {
      decision = await this.policy.decide(
        before,
        student.workspace,
        decisionSeed(student.episodeId, student.game.moves),
        { recent },
      );
    } catch (e) {
      if (!isAgentError(e)) throw e;
      this.message(
        "system",
        `${student.name}’s episode ended`,
        `${(e as Error).message} The episode is recorded as an agent failure; a fresh one starts next.`,
      );
      student.status = "Decision failed · episode ended";
      return false;
    }
    const result = move(student.game, decision.action);
    this.usage(decision.tokens, decision.calls, decision.simulations);
    if (!result.changed) throw new Error("Agent attempted an invalid move.");
    student.game = result.game;
    const after = observe(student.game);
    student.traces.push({
      id: id(),
      studentId: student.id,
      episodeId: student.episodeId,
      before,
      after,
      action: decision.action,
      summary: decision.summary,
      tools: [
        ...decision.tools,
        {
          name: "apply_move",
          args: { direction: decision.action },
          result: {
            scoreDelta: result.gain,
            spawn: result.spawn,
            empty: after.empty,
          },
          durationMs: performance.now() - started,
        },
      ],
      lessonId: decision.lessonId,
      exercise: exercise?.focus,
      invalid: decision.invalid,
      spawn: result.spawn,
      scoreDelta: result.gain,
      workspaceVersion: student.workspace.version,
      mode: this.state.mode,
      tokens: decision.tokens,
      calls: decision.calls,
      simulations: decision.simulations,
      durationMs: performance.now() - started,
    });
    const check = exercise ? focusOutcome(exercise.focus, before, after) : null;
    student.status = `Moved ${decision.action} · ${after.empty} empty cells${check === null ? "" : check ? " · check passed" : " · check missed"}`;
    return true;
  }
  // A short targeted exercise on a reachable board chosen for the focus. The
  // practice game is restored afterwards; exercise moves are recorded as evidence.
  private async exercise(
    student: Student,
    choice: FocusChoice,
    diagnostic = false,
  ) {
    if (!this.exerciseMoves) return;
    const snapshots = snapshotPool(
      "exercise",
      this.state.trainingRound,
      {
        key: `${choice.focus}:${student.id}`,
        applies: (b) => focusApplies(choice.focus, b),
      },
      diagnostic ? 6 : 1,
    );
    const snapshot = diagnostic
      ? snapshots.find((s) => s.tagged)
      : snapshots[0];
    if (!snapshot)
      throw new Error(
        `No reachable diagnostic board found for ${choice.name}.`,
      );
    const saved: [Game, string] = [student.game, student.episodeId];
    const baseEpisode = `exercise:${this.state.trainingRound}:${student.id}`;
    let episode = baseEpisode;
    let attempt = 0;
    while (student.traces.some((t) => t.episodeId === episode))
      episode = `${baseEpisode}:${++attempt}`;
    student.episodeId = episode;
    student.game = fromBoard(snapshot.board, snapshot.seed);
    try {
      for (let k = 0; k < this.exerciseMoves && !this.cancelled; k++) {
        if (student.game.over || !(await this.step(student, choice))) break;
        this.emit();
      }
    } finally {
      [student.game, student.episodeId] = saved;
    }
  }
  // Explicit, optional diagnostic stage. Every condition gets the same opportunity
  // to collect real skill evidence; existing CLI studies do not invoke this stage.
  async diagnose() {
    if (this.state.candidate)
      throw new Error(
        "Test the pending idea before starting diagnostic practice.",
      );
    if (!this.exerciseMoves)
      throw new Error(
        "Diagnostic practice requires exercise moves to be enabled.",
      );
    const afterExam = this.state.phase === "exam";
    try {
      await this.task("practice", async () => {
        this.message(
          "system",
          "Focused diagnostic practice",
          `Each student tries ${this.exerciseMoves} moves per skill on reachable boards. There is no feedback or memory update during these exercises.`,
        );
        for (const focus of FOCI) {
          await mapConcurrent(
            this.state.students,
            this.concurrency,
            async (student) => {
              const choice: FocusChoice = {
                focus: focus.id,
                name: focus.name,
                reason:
                  "Diagnostic exercise: collect evidence for this skill before choosing feedback.",
                adaptive: false,
              };
              this.state.focus = choice;
              this.state.selectedSkill = choice.name;
              student.status = `Diagnostic practice · ${choice.name}`;
              this.emit();
              await this.exercise(student, choice, true);
            },
            () => this.cancelled,
          );
          if (this.cancelled) break;
        }
        this.message(
          "system",
          this.cancelled
            ? "Diagnostic practice stopped"
            : "Diagnostic practice finished",
          "Recorded exercises are available for diagnosis and peer selection. A classmate contributes only when a real move passed the chosen skill check; lesson acceptance still requires the existing verification gate.",
        );
      });
    } finally {
      // A diagnostic exercise must not turn an exam board into training play.
      if (afterExam) {
        this.state.phase = "exam";
        this.emit();
      }
    }
  }
  async practice(steps = 12) {
    if (!Number.isInteger(steps) || steps < 1 || steps > 100)
      throw new Error("Practice steps must be 1–100.");
    const afterExam = this.state.phase === "exam";
    await this.task("practice", async () => {
      if (afterExam)
        for (const student of this.state.students) {
          student.episodes++;
          student.episodeId = `practice:${student.id}:${student.episodes}`;
          student.game = createGame(hash(student.episodeId));
        }
      for (let k = 0; k < steps && !this.cancelled; k++) {
        await mapConcurrent(
          this.state.students,
          this.concurrency,
          async (student) => {
            if (student.game.over || student.game.won) {
              student.episodes++;
              student.episodeId = `practice:${student.id}:${student.episodes}`;
              student.game = createGame(hash(student.episodeId));
            }
            if (!(await this.step(student))) {
              student.episodes++;
              student.episodeId = `practice:${student.id}:${student.episodes}`;
              student.game = createGame(hash(student.episodeId));
            }
            this.emit();
          },
          () => this.cancelled,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, this.state.mode === "simulation" ? 35 : 0),
        );
      }
      this.message(
        "system",
        "Practice finished",
        "We saved every move, the tools each student used, and what happened next. Pick a student to talk through an attempt.",
      );
    });
  }
  async review(studentId?: string) {
    if (this.state.candidate)
      throw new Error(
        "Test the pending idea before reviewing another student.",
      );
    await this.task("review", async () => {
      const eligible = this.state.students.filter((s) => s.traces.length);
      if (!eligible.length)
        throw new Error("Run practice before reviewing evidence.");
      const student =
        eligible.find((s) => s.id === studentId) ??
        [...eligible].sort(
          (a, b) => analyze(a.game.board).empty - analyze(b.game.board).empty,
        )[0];
      const choice = chooseFocus(
        this.state.arm,
        skillEstimates(student.traces),
        // Deterministic and shared across arms (common random numbers).
        `${student.id}:${this.state.trainingRound}`,
      );
      this.state.focus = choice;
      this.state.selectedSkill = choice.name;
      this.message(
        "system",
        `Practice focus for ${student.name}: ${choice.name}`,
        `${choice.reason} ${this.exerciseMoves ? `${student.name} plays ${this.exerciseMoves} moves alone on a reachable board chosen for this skill.` : ""}`,
      );
      this.emit();
      await this.exercise(student, choice);
      // A peer is chosen for relevant recorded evidence on this focus, not for score.
      const passed = (s: Student) =>
        s.traces.filter(
          (t) => focusOutcome(choice.focus, t.before, t.after) === true,
        ).length;
      const peer = eligible
        .filter((s) => s.id !== student.id && passed(s) > 0)
        .sort(
          (a, b) =>
            b.workspace.lessons.filter((l) => l.focus === choice.focus).length -
              a.workspace.lessons.filter((l) => l.focus === choice.focus)
                .length || passed(b) - passed(a),
        )[0];
      // Sample boards for the sensitivity check: reachable boards for this focus, drawn
      // from their own pool so the candidate is never tuned on verification boards.
      const samples = snapshotPool(
        "sensitivity",
        this.state.trainingRound,
        {
          key: `${choice.focus}:${student.id}`,
          applies: (b) => focusApplies(choice.focus, b),
        },
        6,
      );
      const sensitivity = (
        draft: Pick<Lesson, "skill" | "trigger" | "focus">,
      ) =>
        lessonSensitivity(
          student.workspace,
          candidateWorkspace(student.workspace, {
            ...draft,
            focus: choice.focus,
          }),
          samples,
        );
      const proposed = await this.policy.propose(
        student,
        this.state.arm,
        peer,
        choice,
        {
          check: (draft) => {
            try {
              validateSkill(draft.skill);
            } catch {
              return null;
            }
            return sensitivity(draft).changed
              ? null
              : `This change would not alter the planned move on any of ${samples.length} sample boards for "${choice.name}", so it cannot change behaviour. Propose a larger change that the evidence supports, or a different parameter.`;
          },
        },
      );
      this.usage(proposed.tokens, proposed.calls, 0);
      const l = proposed.lesson;
      validateSkill(l.skill);
      if (!(LESSON_TRIGGERS as readonly string[]).includes(l.trigger))
        throw new Error("Unsupported lesson trigger.");
      if (
        l.rule.length > 600 ||
        l.trigger.length > 150 ||
        l.exception.length > 250
      )
        throw new Error("Candidate exceeds memory limits.");
      const known = new Set(
        this.state.students.flatMap((s) => s.traces.map((t) => t.id)),
      );
      if (!l.evidence.length || l.evidence.some((e) => !known.has(e)))
        throw new Error("Candidate references unknown evidence.");
      const lesson = {
        ...l,
        studentId: student.id,
        focus: choice.focus,
        sensitivity: sensitivity(l),
        id: id(),
        status: "candidate" as const,
        createdAt: new Date().toISOString(),
      };
      this.state.candidate = { studentId: student.id, lesson };
      for (const m of proposed.messages)
        this.message(m.role, m.title, m.text, m.evidence);
      student.status = "Candidate lesson awaiting verification";
    });
  }
  async verify() {
    if (!this.state.candidate)
      throw new Error("Review an attempt before verification.");
    await this.task("verify", async () => {
      const candidate = this.state.candidate!;
      const student = this.state.students.find(
        (s) => s.id === candidate.studentId,
      )!;
      const guardPolicy: Policy = {
        ...this.policy,
        decide: async (...args) => {
          if (this.cancelled)
            throw new Error(
              "Verification stopped; candidate remains unverified.",
            );
          return this.policy.decide(...args);
        },
      };
      const verification = await verifyCandidate(
        guardPolicy,
        student.workspace,
        candidate.lesson,
        this.state.trainingRound,
        this.usage,
        (n, total) => {
          student.status = `Checking candidate · ${n}/${total} snapshots`;
          this.emit();
        },
        this.verifyOptions,
        this.verificationConcurrency,
      );
      const lesson = {
        ...candidate.lesson,
        verification,
        status: verification.accepted
          ? ("verified" as const)
          : ("rejected" as const),
      };
      this.state.ledger.push(lesson);
      this.state.trainingRound++;
      if (verification.accepted) {
        student.history.push(clone(student.workspace));
        student.workspace = installLesson(student.workspace, lesson);
        for (const old of student.history.at(-1)!.lessons)
          if (!student.workspace.lessons.some((l) => l.id === old.id)) {
            const ledger = this.state.ledger.find((x) => x.id === old.id);
            if (ledger) ledger.status = "retired";
          }
        student.status = `Workspace v${student.workspace.version} · verified on practice set`;
      } else student.status = "Candidate rejected · workspace unchanged";
      this.message(
        "system",
        verification.accepted ? "Lesson accepted" : "Lesson rejected",
        `The idea changed the practice score by ${verification.meanDelta.toFixed(1)} and the check-up score by ${verification.regressionDelta.toFixed(1)}. ${verification.accepted ? "It passed both checks, so we’ll keep it and try it in the next test." : "It didn’t pass both checks. Let’s keep the old notes and try another idea."}`,
        lesson.evidence,
      );
      this.state.candidate = null;
    });
  }
  rollback(studentId: string) {
    if (this.state.busy) throw new Error("Wait for the current operation.");
    const student = this.state.students.find((s) => s.id === studentId);
    if (!student?.history.length)
      throw new Error("No prior workspace version.");
    const old = student.history.pop()!;
    const retired = student.workspace.lessons.filter(
      (l) => !old.lessons.some((o) => o.id === l.id),
    );
    for (const l of retired) {
      const ledger = this.state.ledger.find((x) => x.id === l.id);
      if (ledger) ledger.status = "retired";
    }
    student.workspace = { ...old, version: student.workspace.version + 1 };
    this.message(
      "system",
      "Back to the earlier notes",
      `${student.name} is using the previous lessons and skill settings again. We saved this as version ${student.workspace.version}, so the history stays clear.`,
    );
    this.emit();
  }
  async exam(seedCount = 3, cap = DEFAULT_MOVE_CAP) {
    if (
      !Number.isInteger(seedCount) ||
      seedCount < 1 ||
      seedCount > 12 ||
      !Number.isInteger(cap) ||
      cap < 1 ||
      cap > 5000
    )
      throw new Error("Invalid exam configuration.");
    await this.task("exam", async () => {
      const frozen = Object.fromEntries(
        this.state.students.map((s) => [s.id, clone(s.workspace)]),
      );
      const exam = {
        id: id(),
        mode: this.state.mode,
        arm: this.state.arm,
        cap,
        seeds: DEV_SEEDS.slice(0, seedCount),
        frozen,
        rows: [],
        startedAt: new Date().toISOString(),
      } as LabState["exams"][number];
      this.state.exams.push(exam);
      this.message(
        "system",
        "Independent exam",
        "Teacher and peers are disabled. Workspaces are frozen; every decision starts with fresh context. These are development seeds; the final study uses sealed seeds from the CLI.",
      );
      for (const seed of exam.seeds) {
        await mapConcurrent(
          this.state.students,
          this.concurrency,
          async (student) => {
            student.status = "Independent exam · frozen workspace";
            const guarded: Policy = {
              ...this.policy,
              decide: async (...args) => {
                if (this.cancelled) throw new Error("Exam stopped by user.");
                const d = await this.policy.decide(...args);
                this.usage(d.tokens, d.calls, d.simulations);
                return d;
              },
            };
            const row = await examEpisode(
              guarded,
              frozen[student.id],
              seed,
              cap,
              student,
              this.state.arm,
              (game, n) => {
                student.game = game;
                if (n % 10 === 0) this.emit();
              },
            );
            exam.rows.push(row);
            exam.rows.sort(
              (a, b) =>
                exam.seeds.indexOf(a.seed) - exam.seeds.indexOf(b.seed) ||
                a.studentId.localeCompare(b.studentId),
            );
            student.status = row.reached
              ? "Reached 2048"
              : row.terminal === "error"
                ? "Exam interrupted"
                : `Exam finished · ${row.highest} tile`;
            this.emit();
            await new Promise((r) => setTimeout(r, 0));
          },
          () => this.cancelled,
        );
        if (this.cancelled) break;
      }
      if (!this.cancelled) exam.completedAt = new Date().toISOString();
      this.message(
        "system",
        this.cancelled ? "Exam stopped" : "Exam complete",
        `${exam.rows.length} game outcomes recorded. Results are ${this.state.mode === "simulation" ? "local heuristic simulation, not LLM learning evidence" : "model runs; compare against matched training conditions before claiming gains"}.`,
      );
    });
  }

  async compare(cap = 1500) {
    if (!Number.isInteger(cap) || cap < 1 || cap > 3000)
      throw new Error("Comparison move cap must be 1–3,000.");
    await this.task("comparison", async () => {
      const comparison: LabState["comparisons"][number] = {
        id: id(),
        mode: this.state.mode,
        status: "running",
        cap,
        startedAt: new Date().toISOString(),
        activeArm: null,
        runs: [],
      };
      this.state.comparisons.push(comparison);
      this.message(
        "system",
        "Let’s compare four classrooms",
        "We’ll start fresh students in each group: solo practice, a teacher with random exercises, a teacher with targeted exercises, and a teacher plus classmates. Your current students keep their saved lessons.",
      );
      for (const arm of ARMS) {
        if (this.cancelled) break;
        comparison.activeArm = arm;
        const result: (typeof comparison.runs)[number] = {
          arm,
          status: "training",
          rows: [],
          accepted: 0,
          rejected: 0,
          trainingTokens: 0,
          trainingCalls: 0,
          trainingSimulations: 0,
          lessons: [],
          messages: [],
        };
        comparison.runs.push(result);
        let training = true;
        const bounded: Policy = {
          ...this.policy,
          decide: async (...args) => {
            if (this.cancelled) throw new Error("Comparison stopped.");
            if (training && result.trainingSimulations + 96 > 50000)
              throw new Error("Training simulation allowance used up.");
            const d = await this.policy.decide(...args);
            this.usage(d.tokens, d.calls, d.simulations);
            if (training) {
              result.trainingTokens += d.tokens;
              result.trainingCalls += d.calls;
              result.trainingSimulations += d.simulations;
            }
            return d;
          },
          propose: async (...args) => {
            if (this.cancelled) throw new Error("Comparison stopped.");
            const p = await this.policy.propose(...args);
            this.usage(p.tokens, p.calls, 0);
            result.trainingTokens += p.tokens;
            result.trainingCalls += p.calls;
            return p;
          },
        };
        const child = new Classroom(bounded, undefined, this.options);
        child.state.arm = arm;
        const unsubscribe = child.subscribe((s) => {
          result.lessons = clone(s.ledger);
          result.messages = clone(s.messages);
          result.accepted = s.ledger.filter(
            (l) => l.status === "verified",
          ).length;
          result.rejected = s.ledger.filter(
            (l) => l.status === "rejected",
          ).length;
          this.emit();
        });
        try {
          await child.practice(12);
          for (const student of child.state.students) {
            if (this.cancelled) break;
            await child.review(student.id);
            await child.verify();
          }
          if (this.cancelled) throw new Error("Comparison stopped.");
          training = false;
          result.status = "exam";
          this.emit();
          await child.exam(1, cap);
          result.rows = clone(child.state.exams.at(-1)!.rows);
          result.status = result.rows.some((r) => r.terminal === "error")
            ? "error"
            : "complete";
        } catch (e) {
          result.status = "error";
          result.error = e instanceof Error ? e.message : "Comparison failed";
        } finally {
          unsubscribe();
          this.emit();
        }
      }
      comparison.status = this.cancelled ? "stopped" : "complete";
      comparison.activeArm = null;
      comparison.completedAt = new Date().toISOString();
      this.message(
        "system",
        "Comparison saved",
        "All outcomes are included. This pilot uses the same tasks and simulation ceiling; compare actual tokens and teaching costs before drawing a conclusion.",
      );
    });
  }
  export() {
    return {
      exportedAt: new Date().toISOString(),
      engine: "cl-2048-1",
      rng: "mulberry32-1",
      protocol: {
        concurrency: this.concurrency,
        verificationConcurrency: this.verificationConcurrency,
        verify: this.verifyOptions,
        exerciseMoves: this.exerciseMoves,
      },
      limitations: [
        "Simulation mode is a deterministic heuristic controller, not an LLM.",
        "Single classroom runs are exploratory.",
        "Matched seed streams do not guarantee identical spawn positions after diverging actions.",
      ],
      state: clone(this.state),
    };
  }
}
