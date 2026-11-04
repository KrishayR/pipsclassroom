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
    exam: "Live Muse full games (up to 1,500 moves), 2 sealed seeds × 3 students = 6 games per condition, with both ablations.",
    training: [
      {
        group: "Solo",
        kept: 1,
        tested: 5,
        lessons: ["Ada: Keep structure when crowded even for small merges"],
      },
      {
        group: "Teacher",
        kept: 1,
        tested: 5,
        lessons: ["Ada: Keep structure when the board is almost full"],
      },
      {
        group: "Adaptive",
        kept: 2,
        tested: 4,
        lessons: [
          "Lin: Keep extra room when the board is crowded",
          "Sam: In crowded spots, pick the move that frees more room",
        ],
      },
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
        condition: "Solo",
        mean: 12593,
        vsUntrained: [1732, -4839, 8524],
      },
      {
        condition: "Teacher",
        mean: 8601,
        vsUntrained: [-2260, -7789, 4451],
      },
      {
        condition: "Adaptive",
        mean: 10195,
        vsUntrained: [-666, -4903, 3158],
      },
      {
        condition: "Classroom",
        mean: 12341,
        vsUntrained: [1479, 333, 2813],
      },
    ],
    takeaways: [
      "Every group kept 1–2 lessons under the unchanged test, the classroom group included.",
      "Classroom students beat untrained students in live full games: +1,479 points, interval above zero.",
      "Without the skill tool, the same classroom students lose 5,515 points: Muse uses the lessons through the planner.",
      "No classroom advantage over adaptive teaching was shown; 6 live games cannot rank the groups.",
    ],
    notes:
      "One training repetition, exploratory. Teacher, adaptive and classroom were retrained after provider 504 errors cut their first training short; 7 broken exam games were replayed. About $10.70.",
  },
  {
    id: "study-1",
    title: "Study 1 · 300-move exams",
    date: "Nov 2, 2026",
    exam: "Live Muse games capped at 300 moves, 2 sealed seeds × 3 students = 6 games per condition. Every game reached the cap.",
    training: [
      {
        group: "Solo",
        kept: 1,
        tested: 5,
        lessons: ["Ada: Keep structure on crowded boards when it costs little"],
      },
      {
        group: "Teacher",
        kept: 1,
        tested: 5,
        lessons: ["Ada: Keep structure when crowded instead of chasing merges"],
      },
      {
        group: "Adaptive",
        kept: 2,
        tested: 4,
        lessons: [
          "Lin: Keep an escape when the board gets crowded",
          "Sam: Keep room on crowded boards, but take the good merge",
        ],
      },
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
        condition: "Solo",
        mean: 4513,
        vsUntrained: [140, -161, 449],
      },
      {
        condition: "Teacher",
        mean: 4389,
        vsUntrained: [16, -406, 377],
      },
      {
        condition: "Adaptive",
        mean: 4295,
        vsUntrained: [-77, -342, 189],
      },
      {
        condition: "Classroom",
        mean: 4457,
        vsUntrained: [85, -189, 352],
      },
    ],
    takeaways: [
      "The classroom group kept no lesson, so its notes never changed.",
      "300-move exams showed no difference: every game survived to the cap.",
    ],
    notes:
      "One training repetition, exploratory. Exams were cut from full games to 300 moves after training, for time. About $3.50.",
  },
];
