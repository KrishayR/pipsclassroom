# Pip’s Classroom: submission draft

**Track / theme:** Indie · Push the Frontier (confirm against final rules)

## One line

A classroom for AI students: Muse students play 2048, a teacher and classmates suggest lessons, each lesson must prove it helps before it's kept, and an exam taken alone shows whether the teaching worked.

## What it does

Three Muse students play 2048 on their own boards. Every move is a real AI decision, and the game checks that it's legal. The app tracks three skills for each student: keeping room on the board, keeping big tiles in place, and planning ahead. Most practice targets the student's weakest skill.

After practice, a Muse teacher reviews the student's recorded mistakes, and a classmate shares a related example from its own games. They propose one lesson. The student then plays new boards with and without it, and the lesson is kept only if it helps. Finally, the students take an exam on their own, with only their saved lessons.

## Why it matters

AI agents can give each other advice, but people rarely check whether that advice helps. Pip’s Classroom is a small, open place to check. Every lesson links back to the moves it came from and the test it passed, and every score can be traced to recorded games. 2048 is the first test, not the end goal.

## How Muse is used

- **Students:** Muse picks each move through a tool call, and says when a saved lesson guided it.
- **Teacher and classmate:** Muse writes structured feedback that has to point to real recorded moves. If the feedback is badly formed, Muse gets one chance to fix it.
- **Setup:** we run `muse-spark-1.3-contributor` through the Meta Model API, with request-rate limits, automatic retries, spending limits, and support for more than one API key.

## Results

Full numbers: [Study 2 results](STUDY_2_RESULTS.md) and [Study 1 results](STUDY_RESULTS.md).

- **Classroom students scored higher.** In Study 2 (games played to the end), classroom students averaged 12,341 points against 10,861 for untrained students on the same games: **+1,479 points per game (+13.6%)**. The likely range for the gain is +333 to +2,813, so it's clearly above zero.
- **Lessons passed a test that was never made easier.** The classroom kept 2 of its 4 proposed lessons in Study 2. In Study 1 it kept none, so its scores matched untrained students.
- **Cost:** about $10.70 for Study 2 and $3.50 for Study 1.

## Honest limits

- The AI model never changes. Only the students' notebooks (lessons and strategy settings) do.
- Each group was trained once and played 6 exam games, so these are early results.
- The results are for 2048 only. We haven't shown that this works on other tasks.

## Links

- Source: https://github.com/KrishayR/pipsclassroom
- Demo video: _to add_
