# Prototype protocol v0.1

The model stays fixed. External memory and bounded skill parameters change. Agents never receive the actual spawn RNG. All arms begin with the same model, skill, memory cap and allowed tools.

Training conditions: solo self-review; teacher review; teacher plus one peer explanation. Peer contributions cite real examples from a different student. Recipients independently act during verification.

The candidate gate compares current and candidate workspaces across six reachable nonterminal practice snapshots and three regression snapshots. Each pair uses the same initial board and spawn RNG, with eight valid moves maximum. Utility is score gain / 8 + valid moves completed + 2 × final empty cells. Accept if mean practice delta ≥ 1 and mean regression delta ≥ -2. All pairs, including losses and unfavorable results, are retained. The pool version is nonterminal-snapshots-v2.

The CLI gives each condition identical simulation/token ceilings and records actual usage. It spends leftover simulation allowance on practice when possible. This is not exact dollar matching. Model decisions reserve at most four calls, twelve tools and 96 simulated transitions; teaching and verification model calls share the provider budget.

Exams use a fresh conversation per decision and a frozen workspace. No teacher/peer calls or memory updates. Primary outcome: fraction reaching 2048 under a fixed cap. Supporting outcomes: score, highest tile, successful-game moves, failure-inclusive capped time-to-target, errors, model calls, tokens and simulated transitions. A failure contributes the cap to capped time-to-target. Raw moves-to-loss are never called efficiency gains.

The source-distributed exam seeds are software-test fixtures. They cannot remain sealed after development. Generate new final seeds in a private evaluation process after freezing all tuning choices. Pair seeds across arms, acknowledging that diverging actions change available cells and therefore spawn locations. Students do not see the seed value.

Several students within one classroom share teaching information. Treat independent training repetitions as the unit for inference; multiple games from one workspace are not independent training replications. The current implementation reports descriptive results. Uncertainty intervals and a pre-registered decision rule for a positive classroom claim remain follow-up work.

## In-app pilot

The quick UI comparison is a separate, clearly labeled pilot: three fresh groups, 12 initial moves per student, one candidate per student, a 50,000 simulated-transition training ceiling per group, and one shared exam seed with a 1,500-move cap. It reports actual resource use without equal-cost claims. For model runs, the server process token ceiling is shared across groups and can truncate the pilot. Use the CLI with per-provider ceilings and new final seeds for research evaluation.
