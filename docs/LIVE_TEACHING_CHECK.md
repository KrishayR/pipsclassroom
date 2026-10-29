# Live teaching check — October 29, 2026

## Outcome

The live Muse workflow completed: recorded practice, an independent baseline,
teacher feedback, candidate verification, and an independent repeat exam.
The candidate was rejected and the student's notebook remained unchanged.
This run does not demonstrate a teaching or peer-learning advantage.

## Configuration

- Model: `muse-spark-1.3-contributor`, reasoning effort `low`, completion cap 4,000.
- One reviewed student: Ada; classroom condition. All three students completed
  six additional practice moves after the earlier one-move connection check.
- Ada played a four-move targeted exercise before teacher review.
- Gate: six targeted and two general snapshots; four moves per rollout,
  comparing current and candidate workspaces with paired spawn streams.
- Independent exams: Ada, public development seed `301546601`, 25 valid moves
  per exam, frozen workspace, no teacher or peer assistance.
- Sequential execution. Server allowance: 300,000 tokens; the separate exam
  provider shared a 120,000-token allowance across both exams. Estimated
  key-spending threshold: $1, using the persistent local ledger.
- Approximate runtime: 30 minutes, 2:11–2:41 PM PDT.

## Teacher and verification

Muse proposed **Save open space when the board gets crowded**: prefer roomier
moves on boards with six or fewer empty cells. It proposed increasing
`spaceWeight` from 12 to 20, leaving the other strategy parameters unchanged.
The teacher explicitly marked its diagnosis as uncertain and cited four
recorded exercise moves.

| Measure | Result |
| --- | ---: |
| Mean targeted utility change | +0.4167 |
| Mean general-board utility change | 0.0000 |
| Completed verification pairs | 8 |
| Verification errors | 0 |
| Required targeted improvement | At least +1 |
| Verdict | Rejected |

Utility combines rollout score gain / 8, completed moves, and twice the final
empty-cell count. These changes are not raw 2048 score points.

Ada retained workspace v1, no saved lessons, and `spaceWeight=12`.
No classmate had eligible relevant evidence; no peer response was requested.
Peer integration therefore remains unvalidated by this check.

## Independent exams

| Exam | Score | Highest tile | Moves | Invalid actions |
| --- | ---: | ---: | ---: | ---: |
| Before teacher feedback | 176 | 32 | 25 | 0 |
| After the rejected candidate | 148 | 32 | 25 | 0 |

Both exams reached the move cap. The workspaces are identical. The -28-point
difference is variation between live runs with unchanged memory, not an effect
of adopting a lesson. Matching the environment seed does not make stochastic
model responses identical. One student, one public seed, and a short cap are
insufficient to establish a performance advantage or disadvantage.

## Usage and evidence

- This experiment: 137 model calls and 305,089 reported tokens.
- Estimated experiment cost: $0.042870262 (about 4.3 cents).
- Including the earlier connection check: about $0.043533362 (4.4 cents).
- These are the application's estimates, not a reconciliation of Meta billing.
- Local raw record: `data/live-teaching-1793308297389.json`. It includes the
  baseline and repeat decision records, teacher evidence, all verification
  pairs, frozen workspaces, checkpoints, and usage. `data/` is ignored by Git.
- The live classroom and lesson verdict are also persisted in local SQLite.
- Windows environment-file loading was fixed on the working branch; the
  regression check covers Windows and Unix line endings. All 32 automated
  tests and the production build passed before this experiment. Agent prompts,
  verification thresholds, and strategy code were not changed during the run.

## Next validation

Test a real peer exchange with sufficient relevant experience, and investigate
why this candidate missed the existing gate. Any later performance experiment
needs matched conditions and independent repetitions; keep this run as an
exploratory integration check.
