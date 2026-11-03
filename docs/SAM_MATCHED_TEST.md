# Sam: frozen notebook versus empty notebook

This live Muse diagnostic follows cloud run 41683004809. It compares Sam's exact
final workspace (three lessons and its saved planner settings) with the original
empty workspace. It measures the learned package together, not prose lessons
in isolation. No teaching, peer feedback, verification or notebook updates occur.

The source notebook and four fresh seeds are frozen in
`tests/fixtures/sam-cloud-41683004809.json`. Each seed is played three times in
each condition: 24 games, a 300-move cap, low reasoning, the same model, planner
and compact context, and six independent game workers. Condition order alternates
within seed/repeat pairs. Repeated calls sample Muse variability; they are not
independent training runs. Four seeds remain a small exploratory sample.

Start **Actions → Sam notebook vs empty → Run workflow**, with workflow source
`main` and code branch `codex/muse-throughput`. The default additional Muse
budget is $5; the runner also stops new calls after four hours. It uses the
existing MODEL_API_KEY repository secret. Budget/time/API failures stop queued
games and save partial completed work. They are not treated as game losses or
zero-score controls. Retries, model and request-rate controls match the prior test.

Each game saves its row and board trajectory plus separate full decision/tool
records. Partial decision files are refreshed every 50 moves; progress logs report
completed moves every 25. The final ZIP includes the exact notebooks, actual
checked-out code commit, plan, diagnostics, per-game evidence, results.json and
SUMMARY.md. Download **sam-matched-…** under the run's Artifacts within seven days.

Only complete trained/empty pairs enter summary means. Report paired score changes,
early losses and seed-level consistency before interpreting them. A positive
result here is preliminary evidence for this frozen package; a negative result
suggests a targeted lesson-removal comparison, not an immediate teacher rewrite.
This test does not update model weights or establish full-game performance.

No-cost preview: `node --import tsx scripts/sam-matched.ts`.
Paid runner: `node --import tsx scripts/sam-matched.ts --live`.
