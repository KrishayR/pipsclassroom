# ConsequenceLab: submission draft

**Track / theme:** Indie · Push the Frontier (confirm against final rules)

## One line

A classroom for AI agents: Muse students play 2048, a teacher coaches them, classmates share lessons, and fresh exams taken alone show whether any of it helped.

## What it does

Three Muse student agents play 2048 on separate boards. Every move is a real model decision, validated and applied by a deterministic, seeded game engine. A curriculum tracks each student's measured skills (keeping room, keeping structure, planning past one merge) and picks the next exercise: the weakest skill 80% of the time, a random one 20% of the time. After a short targeted exercise, a Muse teacher diagnoses one weakness from the recorded moves and may flag its diagnosis as uncertain. In the full classroom, a classmate with relevant recorded evidence explains what worked for it. Their advice becomes a candidate lesson. It is saved only if it beats the current notes on fresh, reachable boards in paired tests. Students then take exams alone, with frozen memory, on sealed seeds.

## Why it matters

Agents can talk to each other, but it is rarely measured whether that helps them learn. ConsequenceLab is a small, inspectable testbed for that question. Every claim links to recorded moves, every lesson has provenance and a verification table, and the comparison is matched and pre-registered. 2048 is the first environment, not the market.

## How Muse is used

- **Students:** one Chat Completions call per move with function calling (`apply_move`, citing a `lesson_id` when a saved lesson guided the move).
- **Teacher and peer:** structured JSON output, validated against real evidence IDs, with one bounded correction attempt.
- **Ablations** separate what Muse does from what its tools do: one removes the skill ranking, one removes the tuned skill parameters.
- Runs on `muse-spark-1.3-contributor` through the Meta Model API, with a rate limiter, backoff retries, a per-process token ceiling and a multi-key spend pool.

## Technical depth

- Deterministic engine with tested mechanics and seeded replay.
- Reachable, skill-tagged practice boards.
- Versioned memory with a verification gate, replacement rules and rollback.
- Four-arm study: solo, teacher with random practice, teacher with adaptive practice, full classroom. It adds an untrained baseline and runs under equal budget ceilings.
- Sealed exam seeds with a published hash and a source-code hash as the freeze record.
- Paired bootstrap intervals and a pre-registered decision rule.
- Resumable, rate-limited parallel runner.

## Results

_To be filled from `data/model-study.json` after the sealed run. Report the primary contrast (classroom − adaptive) with its interval, all four arms against the untrained baseline, both ablations, costs, and the planning-target decision, including if it is negative._

## Honest limits

- Memory and skill parameters change; model weights do not.
- Results hold under this fixed 2048 protocol only. They don't show transfer to other tasks.
- Short verification rollouts are noisy, so the sealed exam is the real test.

## Links

- Source: https://github.com/KrishayR/consequencelab
- Demo video: _to add_
