# Validation record

Validated October 27, 2026 on Node 22.12.0.

- `npm test`: 18 passing tests, zero failures.
- `npm run build`: TypeScript check and production Vite build pass.
- Comparison CLI: one independent training repetition, three conditions, two seeds per student, 1,500-move cap, plus two classroom ablations. See the actual JSON report. Zero wins are retained and reported.
- Local API health: SQLite active, model unavailable without a key.
- Browser: desktop and narrow layout inspected; mobile navigation added after the initial check.
- Browser workflow: practice, teacher/peer discussion, candidate verification, full pair table, and short independent exam exercised. An unfavorable candidate was visibly rejected; exam output included all three capped games.
- Production bundle served with a plain static HTTP server: browser-local simulation runs without the API server.
- API adapter: mocked function-call round trips, token ceiling, and HTTP failure behavior pass. No live paid model requests were executed.

The software checks do not establish LLM learning gains or reliable 2048 completion. New final evaluation seeds are required after tuning.

The final update adds Pip, natural copy, genuine evidence-dependent peer proposals, recipient test plans, and an in-app comparison. Additional automated checks verify group isolation and that peer evidence changes the proposal without forcing acceptance.

The in-app comparison was exercised end to end. Each group accepted two lessons and rejected one. With one exam seed per student, mean simulation scores were 5,088 (solo), 5,088 (teacher), and 6,962.67 (teacher + classmates); no student reached 2048. Actual per-game outcomes and teaching exchanges are in `classroom-pilot.json`. This is a deterministic software demonstration, not an empirical LLM finding.
