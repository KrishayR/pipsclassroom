export type Direction = "up" | "right" | "down" | "left";
export type Board = number[];
export type Mode = "simulation" | "model";
export type Phase =
  "idle" | "practice" | "review" | "verify" | "exam" | "comparison";
// solo = A, teacher = B (random exercises), adaptive = C (targeted), classroom = D (targeted + peers).
export type Arm = "solo" | "teacher" | "adaptive" | "classroom";
export type Focus = "space" | "structure" | "planning";
export interface FocusChoice {
  focus: Focus;
  name: string;
  reason: string;
  adaptive: boolean;
}
export interface RecentMove {
  action: Direction;
  scoreDelta: number;
  emptyBefore: number;
  emptyAfter: number;
}
export interface DecisionContext {
  recent?: RecentMove[];
}
export interface Game {
  board: Board;
  score: number;
  moves: number;
  rng: number;
  seed: number;
  won: boolean;
  over: boolean;
}
export interface Observation {
  board: Board;
  score: number;
  moves: number;
  legal: Direction[];
  highest: number;
  empty: number;
}
export interface Skill {
  id: string;
  name: string;
  version: number;
  depth: number;
  spaceWeight: number;
  structureWeight: number;
  mergeWeight: number;
  riskWeight: number;
}
export interface Lesson {
  id: string;
  title: string;
  rule: string;
  trigger: string;
  exception: string;
  source: string;
  evidence: string[];
  focus?: Focus;
  status: "candidate" | "verified" | "rejected" | "retired";
  skill: Skill;
  verification?: Verification;
  createdAt: string;
}
export interface Workspace {
  version: number;
  lessons: Lesson[];
  skill: Skill;
}
export interface ToolEvent {
  name: string;
  args: unknown;
  result: unknown;
  durationMs: number;
}
export interface Decision {
  action: Direction;
  summary: string;
  tools: ToolEvent[];
  tokens: number;
  calls: number;
  simulations: number;
  lessonId?: string;
  invalid?: number;
}
export interface Trace {
  id: string;
  studentId: string;
  episodeId: string;
  before: Observation;
  after: Observation;
  action: Direction;
  summary: string;
  tools: ToolEvent[];
  lessonId?: string;
  exercise?: Focus;
  invalid?: number;
  spawn: { index: number; value: number } | null;
  scoreDelta: number;
  workspaceVersion: number;
  mode: Mode;
  tokens: number;
  calls: number;
  simulations: number;
  durationMs: number;
}
export interface Student {
  id: string;
  name: string;
  color: string;
  game: Game;
  episodeId: string;
  workspace: Workspace;
  history: Workspace[];
  traces: Trace[];
  episodes: number;
  status: string;
}
export interface VerificationRow {
  snapshot: string;
  split: "practice" | "regression";
  seed: number;
  baseline: number;
  candidate: number;
  delta: number;
  errors?: number;
}
export interface Verification {
  rows: VerificationRow[];
  meanDelta: number;
  regressionDelta: number;
  accepted: boolean;
  rule: string;
  mode: Mode;
  focus?: Focus;
  sizes?: { practice: number; regression: number; moves: number };
}
export interface Message {
  id: string;
  role: "system" | "teacher" | "peer" | "student";
  title: string;
  text: string;
  evidence?: string[];
  time: string;
}
export interface ExamRow {
  studentId: string;
  name: string;
  arm: Arm;
  seed: number;
  score: number;
  highest: number;
  moves: number;
  reached: boolean;
  terminal: "target" | "loss" | "cap" | "error";
  tokens: number;
  calls: number;
  simulations: number;
  workspaceVersion: number;
  invalid?: number;
  latencyMs?: number[];
  repetition?: number;
  error?: string;
}
export interface Exam {
  id: string;
  mode: Mode;
  arm: Arm;
  cap: number;
  seeds: number[];
  frozen: Record<string, Workspace>;
  rows: ExamRow[];
  startedAt: string;
  completedAt?: string;
}
export interface LabState {
  schemaVersion: 1;
  id: string;
  mode: Mode;
  phase: Phase;
  arm: Arm;
  students: Student[];
  messages: Message[];
  candidate: { studentId: string; lesson: Lesson } | null;
  ledger: Lesson[];
  exams: Exam[];
  tokens: number;
  calls: number;
  simulations: number;
  busy: boolean;
  error: string | null;
  trainingRound: number;
  selectedSkill: string;
  focus?: FocusChoice | null;
  modelId: string | null;
  comparisons: Comparison[];
}
export interface Policy {
  mode: Mode;
  modelId?: string;
  decide(
    observation: Observation,
    workspace: Workspace,
    seed: number,
    context?: DecisionContext,
  ): Promise<Decision>;
  propose(
    student: Student,
    arm: Arm,
    peer?: Student,
    focus?: FocusChoice,
  ): Promise<{
    lesson: Omit<Lesson, "id" | "status" | "createdAt">;
    messages: {
      role: "teacher" | "peer" | "student";
      title: string;
      text: string;
      evidence: string[];
    }[];
    tokens: number;
    calls: number;
  }>;
}
export interface ComparisonArmResult {
  arm: Arm;
  status: "training" | "exam" | "complete" | "error";
  rows: ExamRow[];
  accepted: number;
  rejected: number;
  trainingTokens: number;
  trainingCalls: number;
  trainingSimulations: number;
  lessons: Lesson[];
  messages: Message[];
  error?: string;
}
export interface Comparison {
  id: string;
  mode: Mode;
  status: "running" | "complete" | "stopped";
  cap: number;
  startedAt: string;
  completedAt?: string;
  activeArm: Arm | null;
  runs: ComparisonArmResult[];
}
