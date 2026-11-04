// Results of the two live studies (docs/STUDY_RESULTS.md, docs/STUDY_2_RESULTS.md),
// built into the app so they can be shown without the raw reports or a backend.
// Values are [mean difference, 95% CI low, 95% CI high] in points, paired by seed.
export interface StudyResult {
  id: string;
  title: string;
  date: string;
  exam: string;
  training: {
    group: string;
    kept: number;
    tested: number;
    lessons: string[];
  }[];
  live: { condition: string; mean: number; vsUntrained: number[] | null }[];
  takeaways: string[];
  notes: string;
}
export const STUDY_RESULTS: StudyResult[] = [
  {
    id: "study-2",
    title: "Study 2 · full-game exams",
    date: "Nov 3, 2026",
    exam: "Live Muse games played to the end (up to 1,500 moves): 2 games × 3 students = 6 games per group.",
    training: [
      {
        group: "Classroom",
        kept: 2,
        tested: 4,
        lessons: [
          "Lin: Pick merges that keep room to move",
          "Sam: Take the close-score move that keeps room",
        ],
      },
    ],
    live: [
      {
        condition: "Untrained",
        mean: 10861,
        vsUntrained: null,
      },
      {
        condition: "Classroom",
        mean: 12341,
        vsUntrained: [1479, 333, 2813],
      },
    ],
    takeaways: [
      "The classroom kept 2 of its 4 proposed lessons. The test for keeping a lesson was not made easier.",
      "Classroom students beat untrained students by 1,479 points per game (+13.6%), and the likely range stays above zero.",
    ],
    notes:
      "Trained once, so treat it as an early result. Some training was redone after the AI service had outages, and 7 games that errored were replayed. About $10.70.",
  },
  {
    id: "study-1",
    title: "Study 1 · 300-move exams",
    date: "Nov 2, 2026",
    exam: "Live Muse games stopped at 300 moves: 2 games × 3 students = 6 games per group. Every game reached 300 moves.",
    training: [
      {
        group: "Classroom",
        kept: 0,
        tested: 6,
        lessons: [],
      },
    ],
    live: [
      {
        condition: "Untrained",
        mean: 4373,
        vsUntrained: null,
      },
      {
        condition: "Classroom",
        mean: 4457,
        vsUntrained: [85, -189, 352],
      },
    ],
    takeaways: [
      "The classroom group kept none of its 6 proposed lessons, so its notes never changed.",
      "Its scores matched untrained students: +85 points, too small to mean anything.",
    ],
    notes:
      "Trained once, so treat it as an early result. Exams were shortened to 300 moves to save time. About $3.50.",
  },
];
