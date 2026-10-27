import { analyze, createGame, hash, move, observe } from "./engine";
import { emptyWorkspace, installLesson, validateSkill } from "./skills";
import { decisionSeed } from "./policy";
import {
  DEFAULT_MOVE_CAP,
  examEpisode,
  EXAM_SEEDS,
  verifyCandidate,
} from "./evaluation";
import type { Arm, LabState, Message, Policy, Student } from "./types";
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
    selectedSkill: "Leave yourself some room",
    modelId: null,
    comparisons: [],
  };
}
export class Classroom {
  state: LabState;
  private listeners = new Set<(state: LabState) => void>();
  private cancelled = false;
  constructor(
    public policy: Policy,
    state?: LabState,
  ) {
    this.state = state ?? initialState(policy.mode);
    this.state.comparisons ??= [];
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
        for (const student of this.state.students) {
          if (this.cancelled) break;
          if (student.game.over || student.game.won) {
            student.episodes++;
            student.episodeId = `practice:${student.id}:${student.episodes}`;
            student.game = createGame(hash(student.episodeId));
          }
          const before = observe(student.game);
          const started = performance.now();
          const decision = await this.policy.decide(
            before,
            student.workspace,
            decisionSeed(student.episodeId, student.game.moves),
          );
          const result = move(student.game, decision.action);
          this.usage(decision.tokens, decision.calls, decision.simulations);
          if (!result.changed)
            throw new Error("Agent attempted an invalid move.");
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
            spawn: result.spawn,
            scoreDelta: result.gain,
            workspaceVersion: student.workspace.version,
            mode: this.state.mode,
            tokens: decision.tokens,
            calls: decision.calls,
            simulations: decision.simulations,
            durationMs: performance.now() - started,
          });
          student.status = `Moved ${decision.action} · ${after.empty} empty cells`;
          this.emit();
        }
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
    await this.task("review", async () => {
      const eligible = this.state.students.filter((s) => s.traces.length);
      if (!eligible.length)
        throw new Error("Run practice before reviewing evidence.");
      const student =
        eligible.find((s) => s.id === studentId) ??
        [...eligible].sort(
          (a, b) => analyze(a.game.board).empty - analyze(b.game.board).empty,
        )[0];
      const peer = eligible
        .filter((s) => s.id !== student.id)
        .sort(
          (a, b) =>
            b.traces.filter((t) => t.after.empty > t.before.empty).length -
            a.traces.filter((t) => t.after.empty > t.before.empty).length,
        )[0];
      const proposed = await this.policy.propose(student, this.state.arm, peer);
      this.usage(proposed.tokens, proposed.calls, 0);
      const l = proposed.lesson;
      validateSkill(l.skill);
      if (!["always", "crowded boards"].includes(l.trigger))
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
      seedCount > 6 ||
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
        seeds: EXAM_SEEDS.slice(0, seedCount),
        frozen,
        rows: [],
        startedAt: new Date().toISOString(),
      } as LabState["exams"][number];
      this.state.exams.push(exam);
      this.message(
        "system",
        "Independent exam",
        "Teacher and peers are disabled. Workspaces are frozen; every game starts with fresh context.",
      );
      for (const seed of exam.seeds) {
        for (const student of this.state.students) {
          if (this.cancelled) break;
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
          student.status = row.reached
            ? "Reached 2048"
            : row.terminal === "error"
              ? "Exam interrupted"
              : `Exam finished · ${row.highest} tile`;
          this.emit();
          await new Promise((r) => setTimeout(r, 0));
        }
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
        "Let’s compare three classrooms",
        "We’ll start fresh students in each group: solo practice, a teacher, and a teacher plus classmates. Your current students keep their saved lessons.",
      );
      for (const arm of ["solo", "teacher", "classroom"] as Arm[]) {
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
        const child = new Classroom(bounded);
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
      limitations: [
        "Simulation mode is a deterministic heuristic controller, not an LLM.",
        "Single classroom runs are exploratory.",
        "Matched seed streams do not guarantee identical spawn positions after diverging actions.",
      ],
      state: clone(this.state),
    };
  }
}
