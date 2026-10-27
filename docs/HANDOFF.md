# Handoff — October 27, 2026

## Current state

This is a working prototype, not a finished learning result. The complete game workflow runs locally and in the standalone browser simulation build. Real model integration is implemented and mock-tested, but needs credentials and live validation. The initial heuristic does not reliably reach 2048. No learning gain is fabricated.

## What is finished

- Pip, an original animated SVG owl guide; natural classroom copy; explicit teacher → student and peer → student exchanges.
- In-app three-condition comparison with fresh groups, recorded teaching exchanges, saved/rejected lesson counts, usage and independent exam results.
- Responsive classroom, three boards, introduction with playable demo, activity feed, candidate cards, lesson ledger, pairwise verification details, tool trace explorer, episode replay, exam table, configuration, JSON export.
- Deterministic 2048 mechanics and seed replay. No-op handling, once-per-move merges, score, terminal and target detection tested.
- Independent student workspaces and fresh per-decision context. Model-selected tool calls with bounded simulation and validation.
- Teacher review and a bounded peer explanation from actual trace excerpts. Unknown evidence is rejected.
- Six practice + three regression snapshots drawn from legal trajectories, all nonterminal. Paired 8-move rollouts and explicit acceptance rule.
- Accepted memory installation, rejection, version history, rollback and retirement. Exam workspaces are frozen.
- Local SQLite + server-sent events; static browser simulation fallback.
- Per-process model token reservation and bounded calls/timeouts; API failures are visible.
- CLI solo / teacher / classroom comparisons, independent repetitions, paired seeds, no-workspace and lessons-only ablations.
- Automated engine, lifecycle, evaluation, mock-provider and budget tests.

## Highest-priority work for the next developer

1. **Live API pilot.** Supply a key locally, check model availability, exercise actual parallel tool responses, structured teacher output, token usage, and rate limits. Current schema and function messages follow the official Meta docs; account compatibility is unverified. Keep credentials out of frontend bundles.
2. **Planning quality.** The current skill uses shallow sampled random continuations and simple space/smoothness/corner heuristics. Improve it using development-only seeds, count all simulated transitions, and preserve equal access for every comparison arm. Do not hide a stronger solver in the taught arm. A future expectimax skill should remain explicitly inspectable.
3. **Adaptive curriculum.** Review currently chooses a selected student (or the most crowded one) and a peer with space-preserving examples. Verification uses reachable pools. A measured skill mastery model and the proposed 80/20 targeted-exercise scheduler are not implemented. Add coverage-aware selection using only training traces; label the chosen exercise and selection reason.
4. **Study design.** The checked-in fixed exam seeds have now been used for software tests and are development fixtures. Generate and seal NEW final exam seeds outside source control before the real study. Tune only on development data. Add multiple independent training repetitions, paired/clustered uncertainty intervals and quality-versus-cost curves. Current report is descriptive, with equal ceilings rather than exact cost matching. The UI comparison runs one candidate per student and uses a shared 50,000-transition training ceiling per arm; model calls also share the server’s process token ceiling, so interrupted model comparisons must not be presented as matched studies.
5. **Persistence scale.** SQLite currently persists the full state blob on each emission, plus operation records. Normalize episodes, moves, lessons, and provider usage when runs grow; use checkpointed jobs and restart recovery. Browser fallback stores the full state and is intended for short demos.
6. **Coding environment.** Deferred until the 2048 loop and evaluation are validated. Define a shared environment adapter, isolated file workspace, bounded test execution, hidden tests and objective success. Do not expose a shell to the model without real isolation and execution limits.

## Known limits and concrete tradeoffs

- Verification is a small screening gate, not a guarantee. Score/survival utility can favor short-term improvements; the held-out full-game exam is necessary.
- Lessons and skill parameter changes are currently verified together. The lessons-only ablation helps separate them at exam time but does not establish all causal effects.
- Teaching uses bounded trace excerpts injected as context; a model-driven `inspect_trace` retrieval tool for teachers is a next extension.
- No confidence intervals, currency conversion, provider rate cards, p50/p95 dashboard or multi-user authentication yet.
- Skill procedures are prewritten with learned parameter proposals. Arbitrary skill composition/code generation is not implemented.
- Browser mode has no access to a model. The hosted version is a usable simulation, not a hosted live-model service.
- Failed requests conservatively consume reserved tokens. Provider bills may differ; actual dollars require current rate information and billing reconciliation.
- The server binds localhost and restricts browser origins. Before remote deployment add authentication, per-user state, request validation hardening, durable job execution and provider quota enforcement.
- The model API budget is per process (CLI: per provider instance), not a permanent account spending cap. UI resets do not reset it; server restarts do.
- Simulation results cannot demonstrate whether peer discussion helps an LLM. All three simulation arms start with the same heuristic. The classroom arm can use observed peer examples or verified peer skills to alter its proposed parameters, which still must pass verification.

## Suggested acceptance sequence

1. `npm ci`, `npm test`, `npm run build`.
2. `npm run dev`; complete practice → discuss → verify → exam → export.
3. Confirm a rejected candidate leaves memory unchanged; confirm an accepted one can be rolled back. Never force an acceptance for a demo.
4. Run a small real-model pilot. Inspect tool IDs, actual tokens, failure reports and evidence IDs.
5. Freeze prompts, skill definitions, model ID, budgets, rollout utility and acceptance thresholds.
6. Run all three conditions with fresh final seeds and independent training repetitions; publish all outcomes and total costs.

## Demo script

Explain 2048 in one sentence. Show a real recorded move, inspect its tool output, propose a conditional lesson, and show the acceptance or rejection evidence. Run a short independent exercise live. Use explicitly labeled replay and full-game aggregate results for the longer portion. State the active mode on screen and verbally. A negative result is still a valid engineering demonstration.

## Publication status

Source is uploaded to the private GitHub repository https://github.com/KrishayR/consequencelab. The repository includes automated test/build checks. The final ZIP includes the production build; GitHub stores source and build instructions.

A private Sites project was registered as `appgprj_6ae122fb32308191aacaac56c91eb100`; the exact ID is persisted in `.openai/hosting.json`. Source upload was blocked by automatic approval review before credentials were passed to the workflow, so no hosted version or deployment was completed. Reuse this project ID if publishing later; do not create a duplicate. The local production build is ready. No source credential is stored in this handoff.

## Final handoff additions

Pip is drawn in `src/components/Pip.tsx` as an original animated SVG. Its happy/thinking/cheer states respond to classroom activity; it is a guide, not another learning agent. Animation respects reduced-motion preferences.

`src/components/ComparisonPanel.tsx` shows the three study groups, per-game results, resource counts and directed teaching exchanges. The comparison is implemented in `Classroom.compare()`, so it works both in the browser simulation and through the local API. Current student workspaces are isolated from the fresh comparison classrooms. In model mode, all groups share the provider process budget; a budget interruption makes the run incomplete, not evidence of a classroom effect.

The simulation peer proposal is evidence-dependent: it either incorporates a verified peer skill or adjusts a bounded space parameter based on an observed peer move that made room. The gate can reject it. In live mode, peer explanations and the recipient’s test plan are actual model calls. Neither path forces a positive result.

Final delivery includes readable formatted source, a locked dependency file, a production build in the ZIP, 18 automated tests, a GitHub Actions test/build workflow, and both CLI and in-app pilot reports.
