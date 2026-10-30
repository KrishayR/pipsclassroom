# Pip’s Classroom

Meet **Pip**, the little owl who helps you follow a runnable agent classroom: seeded 2048, inspectable planning tools, an adaptive curriculum, teacher and peer feedback, candidate verification, versioned memory, independent exams, and a four-group comparison.

![The classroom and Pip](docs/preview.png)

## Start locally

Requires Node.js 22.12+ (Node 22 LTS recommended) and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The API listens on http://127.0.0.1:8787. Node's built-in SQLite is experimental on Node 22; its startup warning is expected.

The **simulation works without credentials**. It uses a deterministic heuristic controller. Its explanations are rule-based and labeled as simulation. Its outcomes must never be described as evidence of LLM learning.

## Connect Muse

```sh
cp .env.example .env
```

Set `MODEL_API_KEY` in `.env`, restart `npm run dev`, reload, and choose **Lab configuration → Muse / model API**. Keys stay in the backend; never use a `VITE_` variable for credentials.

Defaults: `https://api.meta.ai/v1`, `muse-spark-1.3`, `MODEL_REASONING_EFFORT=low`, `MODEL_MAX_COMPLETION_TOKENS=4000`. Live access was validated on October 28, 2026 (see `docs/VALIDATION.md`). This project runs the study in **Contributor mode** (`MODEL_ID=muse-spark-1.3-contributor`, $0.10 input / $0.002 cached / $0.20 output per 1M tokens): the same model at discounted prices, in exchange for Meta using prompts and responses to train future models, with a 150 requests/minute team limit. Every arm must use the same model ID. `muse-spark-1.3` is a reasoning model: hidden reasoning counts against the completion cap and is billed as output. It rejects `reasoning_effort: "none"`; accepted values are `minimal | low | medium | high | xhigh | max`.

`MODEL_TOKEN_BUDGET` (default 100,000) is a per-server-process ceiling shared by student, teacher, peer and verification calls. It reserves the request size plus the completion cap before each call, reconciles reported usage, and keeps the reservation when usage is unknown. Resetting the classroom does not reset it; restarting the server does. Rate limits (HTTP 429), server errors and timeouts get up to five backoff retries (honoring `Retry-After`); a retry is not counted as a new model call. Other API failures are surfaced, never replaced by a simulated move. One process-wide limiter (`MODEL_RPM`, default 120) keeps requests under the team rate limit. Set `MODEL_PRICE_INPUT_PER_M` and `MODEL_PRICE_OUTPUT_PER_M` (USD per million tokens, from your console) to get dollar figures in reports.

### Several API keys

To use several credit-limited keys (for example, one per teammate), list them in order:

```sh
MODEL_API_KEYS=key-one,key-two,key-three,key-four
MODEL_KEY_LIMIT_USD=145
MODEL_PRICE_INPUT_PER_M=...
MODEL_PRICE_OUTPUT_PER_M=...
```

Each request uses the first key whose estimated spend plus the request's worst-case cost stays under the limit. Estimated spend per key (by fingerprint, never the key itself) is kept in `data/key-spend.json` and shared by the server and CLI runs. A key the provider reports as out of credit (HTTP 402, or an `insufficient_quota`/billing error) or invalid (HTTP 401) is retired, and the same request is sent to the next key. Ordinary rate limits never switch keys. When every key is used up, no request is sent. The default limit is $145 because local spend is an estimate; spending made outside this app (for example in the console) is not in the ledger. Without prices, keys switch only on provider errors. Settings shows how many keys remain.

### Lessons, helper mode and command-line batches

Lessons are conditional: they step in only when a move breaks their skill, within `limits` (minimum options left, maximum points given up). `MODEL_STUDENT_HELPER=off` removes the move ranking so students decide from the board, per-move facts and lessons alone; use the same setting for every study arm. `npm run live-batch -- --cycles 3` runs the budgeted live batch ($1 cap) without the server. See [Conditional lessons](docs/CONDITIONAL_LESSONS.md).

## Walk through the prototype

1. **How this works** explains 2048 with an isolated human-playable board.
2. **Start practice** runs 12 moves per student and records actual tool outputs.
3. Select a student, then **Discuss**. The curriculum picks one skill (preserve room, keep structure, plan beyond one merge), the student plays a short **targeted exercise** alone on a reachable board chosen for that skill, then the teacher (and, in the classroom group, a classmate with relevant recorded evidence) proposes a candidate lesson.
4. **Test this idea** compares the candidate with the current workspace on targeted practice snapshots plus general regression snapshots. Acceptance is not guaranteed.
5. **Saved lessons** shows all outcomes, pairwise checks, provenance and rollback.
6. **Test results** freezes workspaces and runs fresh games on public development seeds. Mean score is the primary outcome.
7. **Watch a decision** shows before/after boards, exact tool results, the lesson the student cited, and recorded replay. Replay makes no model calls.
8. **Classroom vs solo** runs four fresh groups (solo, teacher + random practice, teacher + targeted practice, teacher + targeted practice + classmates). This UI pilot is not a cost-matched study.
9. **Export** downloads the complete JSON run.

## Architecture

- `src/core/engine.ts`: pure 2048 transitions, seeded spawning, reachable (optionally skill-tagged) snapshot pools.
- `src/core/curriculum.ts`: the three practice skills, per-move outcome checks, per-student counts, and the 80/20 targeted/exploration scheduler.
- `src/core/skills.ts`: bounded executable `compare_escape_moves` skill, retrieval, memory gate and replacement rules.
- `src/core/policy.ts`: deterministic simulation controller and rule-based review.
- `src/core/classroom.ts`: operation lock, phases, practice/exercise/review/verify/exam, rollback, in-app comparison.
- `src/core/evaluation.ts`: seeds, paired verification, exam episodes, summaries, paired bootstrap contrasts, planning-target rule.
- `server/model.ts`: server-only Chat Completions adapter and model-selected function-call loop.
- `server/config.ts`: environment, protocol sizes and prices shared by the server and scripts.
- `server/index.ts`: loopback HTTP API, SQLite persistence, SSE updates.
- `src/client.ts`: server transport, plus browser-local simulation fallback for static hosting.
- `src/App.tsx`, `src/components/*`, `src/styles.css`: React interface.
- `scripts/evaluate.ts`: four-arm study runner. `scripts/pilot.ts`: live cost pilot. `scripts/seal-seeds.ts`: sealed final exam seeds.

The engine was independently implemented; no original 2048 code or assets were copied. Game concept credit: Gabriele Cirulli, https://github.com/gabrielecirulli/2048 and https://play2048.co/. This project is not endorsed by the original creator. The UI is original. React, Vite and Lucide remain under their respective licenses.

## Students, tools and skills

Each decision starts a fresh conversation. The student receives the board, legal moves, board facts, its active saved lessons, and its last three moves; never the seed or future spawns. It also receives its saved skill's ranking (`run_skill`: a bounded sampled-continuation estimate, recorded in the trace), and must call `apply_move` with a direction, a short summary, and optionally the `lesson_id` that guided it, so a decision is normally one call. (In the first live runs the model requested the ranking in 15 of 16 decisions, so it is now supplied up front to halve latency and cost.) Invalid tool requests are counted. The `no-skill-tool` ablation removes the ranking, so moves come from the model's own reasoning.

Teachers and peers receive bounded, real trace excerpts and the chosen focus, and return JSON that is validated (lengths, trigger, known evidence IDs, skill bounds). A reply that fails validation gets **one** correction attempt naming the specific problem; a second failure stops the review. Teachers can flag a diagnosis as uncertain. The recipient writes a short test plan; the gate, not the explanation, decides.

Skills are a restricted procedure with versioned parameters, not generated code. Limits: 4 model calls and 12 tool calls per decision; 96 simulated transitions per decision; depth 1–4; up to 3 active lessons, one per focus; 1,600 characters of active lesson text. A newer verified lesson for the same focus replaces the older one; when memory is full, the lesson with the smallest verified practice gain leaves. An agent that cannot choose a legal move within its budget ends that episode (recorded); API, budget and stop errors abort the operation.

## Checks and evaluation

```sh
npm test
npm run build
npm run evaluate -- --seeds 2 --cap 1500 --training-rounds 3 --simulation-budget 60000 --out data/report.json
```

`docs/simulation-evaluation.json` is a completed simulation report: a software smoke benchmark, not a research finding.

**Model runs make paid calls.** Measure first:

```sh
npm run pilot -- --steps 10 --token-budget 150000
```

The pilot plays ~30 live moves and one full teaching cycle, reports tokens (prompt/completion/reasoning), calls, latency and invalid actions per decision, and projects the cost of the full study. Use its projection to size the study before running it.

Final study, after freezing prompts, skills, thresholds and budgets:

```sh
npm run seal-seeds -- --count 12          # writes data/sealed-exam-seeds.json and prints its SHA-256
MODEL_RPM=140 npm run evaluate -- --mode model --split exam --seeds 12 --cap 150 \
  --training-moves 24 --training-rounds 3 --token-budget 1000000 --simulation-budget 60000 \
  --repetitions 3 --concurrency 16 --out data/model-study.json
# interrupted? rerun the same command with --resume
```

Training for every arm and repetition runs in parallel; then exam games run `--concurrency` at a time, paced by the rate limiter. Each arm and repetition has a fresh training provider; each exam condition has a fresh provider (`--exam-token-budget`). The untrained baseline runs once and is paired with every repetition; the two classroom ablations (`lessons-only`, `no-skill-tool`) run in the first `--ablation-reps` repetitions. The report is saved after every game; `--resume` continues only with identical code (hashed), seeds and configuration. `--token-budget` is a **per-provider** ceiling. The report includes per-arm summaries, paired contrasts with bootstrap 95% intervals (primary: classroom − adaptive), the planning-target decision, and gain over the untrained baseline per 1k training tokens and per dollar. `--arms adaptive,classroom` and `--no-ablations` shrink a run.

## Persistence and deployment

Local backend: `data/classroom.sqlite` (WAL). Runtime records, pilot reports, sealed seeds and `.env` are ignored by Git.

Hosted static build: browser-only simulation using localStorage, with no model backend. Export to preserve a run.

```sh
npm run build
npm run preview
```

The Node backend is loopback-only and not suitable for unauthenticated public deployment. See `docs/HANDOFF.md` for remaining work.

## Guided first run

To compare lesson-test rollout lengths without API calls, run
`npm run calibrate-gate`. It saves a development-only agreement report and
leaves the live gate unchanged. See [Gate calibration](docs/GATE_CALIBRATION.md).

For unattended live testing, the Classroom page has a **Cycles** field and
**Run [count] live cycles · $1 max** button. Independent students and
verification rollouts run with up to six concurrent model requests (three for student games) while
learning cycles stay sequential. Baseline, stage checkpoints, cycle results,
and timing records save locally without assistant supervision. See
[Live batch guide](docs/LIVE_BATCH.md) for the fixed short-exam protocol,
budget limits, stopping behavior, and analysis files.

The walkthrough starts with **focused practice**: all three students try short
exercises in preserving room, maintaining structure, and planning ahead. This
collects relevant examples before review, using reachable boards that match
each skill. The same action is available in the classroom controls. It preserves
regular games and saved notes. Live mode uses API credits (up to 36 decisions
at the default four moves per exercise). It does not guarantee mistakes, peer
eligibility, accepted lessons, or improvement. The comparison and CLI runners
retain their existing protocols. See `docs/FOCUSED_PRACTICE_HANDOFF.md`.

Open the app and follow Pip’s field guide: guided practice → review → test the idea → short independent exam → inspect the evidence. The guide follows actual run state, including rejected ideas, and can be hidden or reopened. Simulation needs no API key. The short exam demonstrates the workflow; use matched comparisons and longer evaluations for performance claims.

Current utility: demonstrate agent tool use, inspect decisions, investigate teaching approaches in 2048, and export evidence. Coding, support, and planning environments are future extensions, not implemented integrations. A configured model endpoint alone does not demonstrate Muse Image or Muse Wonder use for the creative category.
