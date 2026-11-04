# Pip’s Classroom

**A classroom for AI students. Every lesson has to prove it helps.**

![Pip’s Classroom interface](docs/preview.png)

Three AI students, Ada, Lin and Sam, play the game 2048. They're powered by Meta's Muse model. A teacher looks at their mistakes and a classmate shares what worked in its own games. Together they suggest a lesson. A lesson is only kept if it actually helps on new boards. Then the students take an exam on their own, and we compare their scores with students who were never taught.

Pip the owl guides you through it.

## Why we built it

Writing advice that sounds convincing is easy. Advice that really changes how someone plays is harder. Pip’s Classroom ties every lesson to the moves it came from and the test it passed, so you can check whether the teaching helped.

The AI model itself never changes. What changes is each student's notebook: the lessons it keeps and a few strategy settings, such as how many moves ahead it looks.

## How a learning session works

1. **First exam.** Each student plays alone with no help. This is their starting score.
2. **Practice.** Each student practises on boards picked for its weakest skill: keeping room on the board, keeping big tiles in place, or planning ahead.
3. **Discuss.** The teacher reviews the student's recorded mistakes, and a classmate shares a related example from its own games. Before they suggest anything, they try out a few strategy changes for free to see which ones win. Then they propose one lesson.
4. **Test the lesson.** The student plays new boards with and without the lesson. It's kept only if it helps on the skill it targets and doesn't hurt normal play. A rejected lesson gets one second try.
5. **Final exam.** The students play alone again, with only their saved lessons. We compare this score with the first exam.

## What we found

We ran two live studies with Muse. In each, a classroom group was taught as described above, and an untrained group got no teaching. Both groups played exactly the same games.

**Study 2 (Nov 3, 2026): games played to the end**

| Group     | Lessons kept | Average score |
| --------- | -----------: | ------------: |
| Untrained |            — |        10,861 |
| Classroom |       2 of 4 |        12,341 |

Classroom students scored **1,479 points more per game (+13.6%)**. Allowing for luck, the real gain most likely falls between 333 and 2,813 points, so it's clearly above zero.

**Study 1 (Nov 2, 2026): games stopped at 300 moves**

The classroom group kept none of its 6 proposed lessons, so its scores matched the untrained group (+85 points, which is too small to mean anything).

These are early results. Each group was trained once and played 6 exam games (2 games for each of 3 students), so they show promise rather than proof. Study 2 cost about $10.70. Full numbers are in [Study 2 results](docs/STUDY_2_RESULTS.md) and [Study 1 results](docs/STUDY_RESULTS.md).

## How Muse is used

| Role      | What Muse does                                                                     |
| --------- | ---------------------------------------------------------------------------------- |
| Students  | Pick every move through a tool call, and say when a saved lesson guided the move.  |
| Teacher   | Reads a student's real moves, proposes a lesson, and rewrites it once if it fails. |
| Classmate | Shares an example from its own games that relates to the student's mistake.        |

We tested it live with `muse-spark-1.3-contributor` through the Meta Model API. The game checks every move, and the lesson test decides what's kept, so the AI never grades its own work.

## Run it yourself

You need **Node.js 22.12 or newer**.

```sh
git clone https://github.com/KrishayR/consequencelab.git
cd consequencelab
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The app starts in **practice mode**: a built-in player stands in for the AI, so it's free and doesn't need a key. Practice mode shows how the app works, but it doesn't show an AI learning.

**To use the live AI:**

1. Copy `.env.example` to `.env`.
2. Add your Meta API key as `MODEL_API_KEY`.
3. Restart the app, open **Settings** and choose **Live AI (Muse)**.
4. On the **Classroom** page, press **Run Learning Session**.

Your key stays on the local server and never reaches the browser. Don't put keys in variables that start with `VITE_`. Each learning session has a spending limit (`BATCH_BUDGET_USD`, $1 by default), but the costs shown are estimates, not your provider's bill. The example model is a Contributor model, which means Meta may use your prompts and responses for training. The other settings are explained in [.env.example](.env.example).

## The app’s pages

- **Classroom:** run a learning session and watch the students, the teacher and the conversation.
- **Lessons:** each student's notebook, every proposed lesson (kept or not) and the test results behind it. You can roll a notebook back.
- **Results:** exam scores from this classroom, before and after teaching.
- **Past results:** the two finished studies, with a chart.
- **Settings:** switch between practice mode and the live AI, or reset the classroom.
- **Export classroom:** download all the data as a ZIP file.

## How it’s built

React and Vite for the interface, plus a small Node/TypeScript server that talks to the AI and saves runs in a local database.

| Code                                      | What it does                                                   |
| ----------------------------------------- | -------------------------------------------------------------- |
| `src/core/engine.ts`, `curriculum.ts`     | The 2048 game, practice boards, and choosing what to practise. |
| `src/core/skills.ts`, `policy.ts`         | The move-planning tool, lessons and strategy settings.         |
| `src/core/classroom.ts`, `evaluation.ts`  | The learning steps, notebooks, lesson tests and exams.         |
| `server/model.ts`, `config.ts`, `keys.ts` | Talking to Muse, retries, and spending limits.                 |
| `scripts/evaluate.ts`                     | Runs a full study from the command line.                       |

To check everything works:

```sh
npm test
npm run build
```

`npm run evaluate`, `npm run pilot` and `npm run live-batch` run studies from the command line. Note that in model mode they make paid AI requests. The [protocol](docs/PROTOCOL.md) explains how a study is set up so that it's fair.

### What was hard

The hardest part was telling helpful lessons apart from lessons that only sound good. Some well-written rules changed nothing or made play worse, and short tests sometimes rejected strategies that only pay off over a whole game. So lessons are tested on fresh boards, rejected lessons get only one second try, and exams are kept separate from practice.

## Limits

- The AI model never changes. Only the students' notebooks do.
- The results are for 2048 only. We haven't shown that this works on other tasks.
- The studies are small. Each group was trained once, so more runs are needed before anyone can claim the classroom reliably helps.
- The server is built to run on your own computer. Putting it online would need logins and other security work first.

## Credits

The 2048 game concept is by [Gabriele Cirulli](https://github.com/gabrielecirulli/2048). Our game and interface were written from scratch; no original code or art was copied, and this project isn't endorsed by its author. React, Vite and Lucide keep their own licenses.
