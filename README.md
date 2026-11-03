# Pip’s Classroom
![Pip’s Classroom interface](docs/preview.png)

**Run a five-hour experiment while your computer is off:** [Cloud test setup and results](docs/CLOUD_TEST.md).

## Run locally

Requires **Node.js 22.12+** and npm. Node 22’s experimental SQLite startup warning is expected.

```sh
git clone https://github.com/KrishayR/consequencelab.git
cd consequencelab
npm ci
npm run dev
```

Open http://127.0.0.1:5173; the API listens on http://127.0.0.1:8787. **Simulation requires no credentials** and uses a deterministic heuristic with rule-based explanations. It does not establish model learning.

For live Muse:

```sh
cp .env.example .env
```

Set `MODEL_API_KEY`, restart the app, reload, and select **Settings → Muse / model API**. Credentials stay on the backend; never use `VITE_` variables for keys.

The example config selects `muse-spark-1.3-contributor`; without `MODEL_ID`, the code defaults to `muse-spark-1.3`. Endpoint: `https://api.meta.ai/v1`; reasoning effort: `low`; completion cap: 4,000. Hidden reasoning consumes the completion allowance; `none` was rejected in live testing. **Contributor mode permits Meta to use prompts and responses for training.** Check current provider terms, prices, and account limits before sending data; example prices are historical project settings.

`MODEL_TOKEN_BUDGET` defaults to 100,000, shared across server operations; classroom resets do not reset it, server restarts do. `MODEL_RPM` defaults to 120 per process; team quotas are shared across keys. Set the `MODEL_PRICE_*` values for cost estimates. Each request uses the first available key. Estimated spend per key (by fingerprint, never the key itself) is kept in `data/key-spend.json` and shared by the server and CLI runs. There is no local cumulative key-spending cap. A key the provider reports as out of credit (HTTP 402, or an `insufficient_quota`/billing error) or invalid (HTTP 401) is retired, and the same request is sent to the next key. Ordinary rate limits never switch keys. When every key is retired, no request is sent. Live learning-session batches enforce their own estimated budget (`BATCH_BUDGET_USD`, default $1 for the entire batch, including all requested sessions). Resuming retains earlier spending against that budget. Manual actions are not covered by the batch's dollar cap. Spending outside this app is not in the ledger; local estimates are not a guaranteed provider billing cap. Settings shows how many keys remain. Configure multiple keys with `MODEL_API_KEYS`.

`MODEL_STUDENT_HELPER=off` removes sampled rankings; keep the model ID and helper setting identical across comparison groups. See [.env.example](.env.example) for verification and batch settings.

**Give AI agents a classroom. Test what they learn.**

Pip’s Classroom is an inspectable classroom for AI agents. Three Meta Muse students play 2048, practice measured weaknesses, receive teacher and peer feedback, and test proposed lessons before saving them. Independent exams then ask whether those lessons helped. Pip, the owl, guides you through the evidence.

The problem: convincing advice is easy to generate; useful advice must change behavior and survive a test. Pip’s Classroom connects every lesson to recorded decisions, a verification verdict, and versioned memory. **Learning here means changing external notes and bounded strategy parameters; model weights stay fixed.**


[Source](https://github.com/KrishayR/consequencelab) · [Live study results](docs/STUDY_RESULTS.md) · [Evaluation protocol](docs/PROTOCOL.md) · **3-minute demo video: not yet linked**

## A working lab for teaching and testing AI agents

**Follow an agent from a mistake to a tested strategy, with the evidence visible at every step.** Pip’s Classroom brings adaptive practice, model-driven coaching, controlled experiments, and independent evaluation into one runnable interface. Its first environment is **2048**, where every action has a measurable consequence.

1. **Find exactly where an agent struggles.** Ada, Lin, and Sam play independently while the curriculum tracks room, board structure, and planning beyond one merge. Adaptive practice targets the weakest measured skill 80% of the time, so coaching starts from observed behavior.
2. **Turn experience into actionable coaching.** A Muse teacher reviews real moves and local strategy experiments to propose a conditional lesson. Eligible classmates contribute relevant recorded experience, making peer advice traceable to something they actually did.
3. **Make advice earn its place.** Test each candidate against the current notebook on paired targeted and general boards. The default helper-on gate requires targeted utility gain ≥ +1 and general change ≥ −2. A rejected idea can receive one bounded revision, tested on fresh verification boards.
4. **Build an auditable learning history.** Save passing lessons with their evidence, limits, test results, and versions. Inspect why a strategy changed, replace outdated advice, or roll back. Named strategy experiments are adopted exactly as tested.
5. **Measure what survives beyond practice.** Freeze notebooks and examine students alone. Compare self-review, teacher feedback, adaptive practice, and peer contribution against an untrained baseline to investigate which parts of the classroom help.
6. **Inspect and share the complete experiment.** Replay before-and-after boards, inspect tool calls and cited lessons, and export raw JSON records, readable summaries, and saved checkpoints in a ZIP archive. Seeded spawning and reachable practice boards make the environment reproducible while preserving the actual model decisions.

For agent builders and researchers, this provides a concrete way to investigate **whether feedback changes decisions, whether those changes help on fresh games, and where a teaching approach breaks down**. The live results below distinguish successful integration from demonstrated performance gains.

## Why Meta’s models matter

Muse is inside the decision and teaching loop, rather than an explanation layer added afterward:

| Role | Implemented Meta model use |
| --- | --- |
| Student | Chooses legal actions through `apply_move`; can cite the saved lesson that changed its choice. |
| Teacher | Reads bounded real traces and strategy experiments, proposes structured lessons, and revises rejected candidates. |
| Peer | Shares evidence-backed feedback when eligible; the classroom condition tests its added value. |

The integration uses the **Meta Model API** and was tested live with `muse-spark-1.3-contributor`. Function calling turns reasoning into executable moves; validated JSON connects feedback to real evidence IDs. The simulator computes consequences and the gate decides acceptance independently of the model’s explanation.

**Why use Meta here?** Its tested tool use and structured feedback support the complete experimental loop, and Contributor-mode costs made repeated verification feasible for this prototype. The contribution is a measured environment around a fixed Meta model. Other capable models could implement these roles; we have no cross-provider benchmark establishing that Meta is uniquely necessary or superior. Switching would require revalidating tool behavior, prompts, budgets, and results.

## Tested live: results and limits

The **November 2, 2026 study** used Muse with the planner enabled in every group, three teaching rounds, and **one training repetition per group**. Exams covered two sealed seeds × three students per group, including the baseline.

| Group | Lessons kept | Live mean score, 300-move cap |
| --- | ---: | ---: |
| Untrained | N/A | 4,373 |
| Solo / self-review | 1 | 4,513 |
| Teacher + random practice | 1 | 4,389 |
| Teacher + adaptive practice | 2 | 4,295 |
| Adaptive + teacher + peer | 0 | 4,457 |

**30 live games, zero errors, zero invalid moves; estimated exam cost $1.73.** The primary classroom − adaptive contrast was **+162 points, 95% interval [−191, 579]**. The planning target was not met, and no live performance advantage was established. Every game reached the cap, limiting assessment of survival benefits.

A **separate simulation full-game check** played each group’s saved notes on 40 fresh seeds per student. Teacher-group notes scored **+929 [243, 1,620]** over untrained notes. This measures the saved strategy under the deterministic controller, **not live Muse improvement**. Every lesson retained in this study adopted a free strategy experiment exactly; no teacher-invented strategy passed. Classroom notes stayed unchanged.

The original full-game live exam plan was shortened to 300 moves and its two ablations omitted after training, before any exam game finished, because throughput could not meet the deadline. Code and training were unchanged. Results are exploratory; one repetition cannot establish that peers help or hurt. Total study cost was about $3.50, including stopped exams. See [full results, intervals, and protocol deviation](docs/STUDY_RESULTS.md). Raw study records are local and ignored by Git, not bundled with the public summary.

Earlier live checks also exercised teacher review, verification, and accepted lessons; see [lesson acceptance](docs/LESSON_ACCEPTANCE.md) and [validation history](docs/VALIDATION.md). The bundled [simulation report](docs/simulation-evaluation.json) is a software benchmark, not evidence of LLM learning.

## Beyond 2048: incident-response training (proposed)

Imagine an AI assistant handling a simulated checkout outage. After a deployment, latency rises and database connections saturate. The assistant repeatedly restarts application workers before checking the connection pool; the restarts trigger a reconnection surge and worsen the simulated outage.

A future Pip’s Classroom environment could apply the same loop:

1. **Record consequences:** expose sandbox tools for metrics, deployment history, rollback, and restarts. Record each action, recovery time, failed requests, and the affected services.
2. **Target the weakness:** generate incidents that distinguish deployment regressions, connection leaks, and downstream failures. Vary symptoms so the agent cannot simply memorize “always roll back.”
3. **Propose a conditional lesson:** “When latency rises after a deployment and pool occupancy is saturated, inspect deployment changes and connection metrics before restarting workers. Roll back only when evidence supports a deployment regression.” A peer could supply a contrasting incident where rollback would be wrong.
4. **Test before saving:** compare old and candidate runbooks on paired sandbox incidents. Reject advice that improves the target case but causes unnecessary rollbacks or broader disruption elsewhere.
5. **Examine unfamiliar outages:** freeze the runbook and test different services and failure combinations, measuring recovery time, failed requests, unsafe actions, and escalation quality against an untrained baseline.

The specific potential impact is **fewer repeated operational mistakes before an assistant is trusted during a real outage**, with an audit trail explaining why a runbook changed. This requires a new incident simulator, tool adapters, domain-specific checks, and independent evaluation. **No incident-response integration or operational benefit is implemented or demonstrated today.** Production actions would require appropriate human approval controls.

## Technical implementation and obstacles

React + Vite provide the interface; a local Node/TypeScript backend stores runs in SQLite and streams updates. Core components:

| Component | Responsibility |
| --- | --- |
| `src/core/engine.ts`, `curriculum.ts` | Seeded mechanics, reachable exercises, skill measurements, adaptive scheduling. |
| `src/core/skills.ts`, `policy.ts` | Bounded planning, conditional lessons, free strategy experiments, simulation controller. |
| `src/core/classroom.ts`, `evaluation.ts` | Learning phases, memory, paired verification, exams, bootstrap contrasts. |
| `server/model.ts`, `config.ts`, `keys.ts` | Model/tool loop, validated replies, concurrency, retries, token and spending controls. |
| `scripts/evaluate.ts` | Resumable comparisons, sealed seeds, code hashes, baseline and optional ablations. |

Each student decision starts a fresh conversation with board facts, recent moves, and saved notes; it never receives the actual seed or future tile spawns. With the helper on, a bounded sampled planner supplies rankings and a lesson plan. Lessons are restricted procedures and parameters, not generated executable code. Memory holds at most three active lessons and 1,600 characters of lesson text.

The hardest obstacle was **separating useful teaching from noise and planner assistance**. Fluent rules sometimes changed nothing or worsened play; short tests could reject beneficial long-game strategies. Responses included behavioral checks, separate experiment/test boards, regression tests, revision limits, and full-game checks. Helper-free verification uses more boards, repeated rollouts, and a noise guard ([details](docs/STURDY_GATE.md)).

Live integration also exposed completion caps consumed by hidden reasoning, invalid structured replies, and throughput limits. The adapter handles truncation, allows one validation correction, and reports failures without silently substituting simulated moves. Earlier adapter timings describe earlier versions, not guaranteed current latency.

## Runtime diagnostics and latency pilot

Independent classroom exam games can use up to six workers (`MODEL_EXAM_CONCURRENCY`, default 6); moves inside each game stay sequential. A one-seed exam still has only three games. Saved-run details and exports include queue, provider, rate-limit and retry timings. `npm run benchmark-muse` previews a separate concurrency/reasoning-effort comparison without making calls; paid execution requires `--live` and uses its own shared budget. Normal runs retain `low` reasoning and the planner. See [Muse runtime checks](docs/MUSE_RUNTIME.md) before running a live pilot.

## Demo and evaluation

Follow this workflow for the demo:

1. **How this works** explains 2048 with an isolated human-playable board. The Pip’s Classroom logo opens a welcome page linking to Classroom, Lessons, Results, and Settings.
2. In live model mode, choose **Number of sessions** on **Classroom**, then **Run Learning Session**. A batch starts a fresh classroom and teaches Ada, Lin, and Sam through baseline exam → focused practice → teacher and peer discussion → verification → independent exam. Stage progress and estimated spending appear below the controls. Lesson acceptance and improved scores are not guaranteed.
3. Open **Run Individual steps** for manual practice, focused exercises, discussion, and pending-lesson checks. **Run individual cycles** instead teaches students one at a time in Ada → Lin → Sam order. Controls lock while an operation runs; Stop preserves partial results.
4. **Lessons** shows student notebooks and the classroom idea archive, including rejected ideas, verification evidence, and rollback controls.
5. **Results → Student exams** shows exam history and per-student score changes when settings and seeds are comparable. A single session is exploratory evidence, not proof of learning.
6. **Results → Classroom vs solo** runs four fresh groups (solo, teacher + random practice, teacher + targeted practice, teacher + targeted practice + classmates). This is a separate exploratory comparison, not a cost-matched study.
7. **Inspect** opens recorded decisions with before/after boards, tool results, lesson citations, and episode replay. Replay makes no model calls.
8. **Export classroom** downloads a ZIP with raw JSON, readable summaries, and the latest live batch's saved checkpoints. Only retained messages are included; see Persistence below.
9. **Settings** controls simulation/model mode and study conditions. The top-bar sun/moon toggle remembers the preferred light or dark theme. Failed or interrupted sessions with a usable checkpoint and remaining budget offer **Resume session**.

Local checks and a free simulation benchmark:

```sh
npm test
npm run build
npm run evaluate -- --seeds 2 --cap 1500 --training-rounds 3 --simulation-budget 60000 --out data/report.json
```

**The following commands make paid calls.** Measure cost before sizing a study:

```sh
npm run pilot -- --steps 10 --token-budget 150000
npm run live-batch -- --cycles 3 --kind classroom
```

Batch spending defaults to an estimated $1 for the entire batch; default 25-move exams demonstrate the workflow rather than long-game gains. For a free saved-notes check, use `npm run full-game-check -- <final.json>`. See [live batches](docs/LIVE_BATCH.md) and [lesson acceptance](docs/LESSON_ACCEPTANCE.md).

Example larger study configuration; this is **not the configuration of the published November 2 results**:

```sh
npm run seal-seeds -- --count 12
MODEL_RPM=140 npm run evaluate -- --mode model --split exam --seeds 12 --cap 150 \
  --training-moves 24 --training-rounds 3 --token-budget 1000000 --simulation-budget 60000 \
  --repetitions 3 --concurrency 16 --out data/model-study.json
# To resume an interrupted run, repeat the command with --resume.
```

Freeze tuning choices and publish the seed hash before exams. Resume requires identical code, seeds, and configuration. CLI token ceilings are per provider, not a total study spending cap. Equal budget ceilings are not equal actual costs. Short move caps can conceal survival gains; meaningful full-game live exams need a much larger budget. See [protocol](docs/PROTOCOL.md).

## Production considerations and submission notes

The backend binds to loopback and needs authentication, access controls, and deployment hardening before public use. SQLite stores local runs in `data/classroom.sqlite`; static hosting runs browser-only simulation in localStorage, with no live model backend. Export runs to preserve them. Preview with `npm run build` then `npm run preview`.

Failed or interrupted live batches with a usable checkpoint and budget remaining show **Resume session**. Resume reuses completed stages and the original exam and verification settings. Unfinished stages repeat, using the remaining original batch budget; earlier spending is retained. The original model and planner setting must match. Completed and intentionally stopped sessions are not resumable. Earlier failed snapshots are preserved as `attempt-*.json` in the batch directory.

**Export classroom** downloads a ZIP containing the current raw classroom state and a readable report. In Live model mode it also includes the latest batch's JSON checkpoints, status and reports for each saved stage. Export after completion for the final report; exports during a run are partial. Older batches remain in `data/`. Conversation reports include retained messages only (latest 100 per snapshot). ZIP creation happens on demand in the browser and makes no model calls. The archive is for analysis, not automatic import or restore.

Production model choice depends on reliable tool use, evidence-backed gains, latency, total inference cost, quotas, availability, and data-handling terms. Contributor-mode training terms may be unsuitable for sensitive incidents. Switching models requires rerunning the evaluation. Longer live exams, repeated training runs, and the omitted ablations remain necessary before claiming a classroom advantage or transfer beyond 2048.

For the submission form: use the linked source and results; add the demo URL and the event’s exact track/problem statement. API recommendation ratings, Muse Code ratings, and Fireworks/Modal/Baseten feedback must reflect the team’s actual experience; this repository does not substantiate them. It demonstrates Muse text/tool use, not Muse Image or Muse Wonder integration.

2048 concept credit: [Gabriele Cirulli](https://github.com/gabrielecirulli/2048). The engine and UI were independently implemented; no original game code or assets were copied, and no endorsement is implied. React, Vite, and Lucide retain their respective licenses.
