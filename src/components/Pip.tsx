/** Pip is a UI guide, not an extra model or a source of evaluation scores. */
export default function Pip({
  mood = "happy",
  size = 88,
}: {
  mood?: "happy" | "thinking" | "cheer";
  size?: number;
}) {
  return (
    <svg
      className={`pip pip-${mood}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Pip the little classroom owl, ${mood}`}
    >
      <ellipse cx="50" cy="91" rx="29" ry="5" fill="#344a2520" />
      <g className="pip-body">
        <path
          d="M23 34 21 14 39 24Q50 20 61 24L79 14 77 35Q88 47 82 69Q76 87 50 87Q24 87 18 69Q12 47 23 34Z"
          fill="#a6bb80"
          stroke="#78955d"
          strokeWidth="2"
        />
        <path d="M22 53Q30 42 35 57Q34 75 23 72" fill="#8ba769" />
        <path d="M78 53Q70 42 65 57Q66 75 77 72" fill="#8ba769" />
        <path
          d="M29 36Q39 28 50 38Q61 28 71 36Q82 48 70 63Q61 70 50 65Q39 70 30 63Q18 48 29 36"
          fill="#f9f6dc"
        />
        <g className="pip-eyes">
          {mood === "cheer" ? (
            <>
              <path
                d="m31 48 6-5 6 5M57 48l6-5 6 5"
                fill="none"
                stroke="#3b4b2e"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <ellipse cx="37" cy="47" rx="4.5" ry="6" fill="#3b4b2e" />
              <ellipse cx="63" cy="47" rx="4.5" ry="6" fill="#3b4b2e" />
              <circle cx="38" cy="45" r="1.5" fill="white" />
              <circle cx="64" cy="45" r="1.5" fill="white" />
            </>
          )}
        </g>
        <ellipse cx="29" cy="56" rx="5" ry="3" fill="#e5b69b" opacity=".7" />
        <ellipse cx="71" cy="56" rx="5" ry="3" fill="#e5b69b" opacity=".7" />
        <path d="m46 54 4 6 4-6Z" fill="#d4a654" />
        <path
          d="m39 72 4 3m5-3 4 3m5-3 4 3"
          stroke="#7d985d"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="m36 85-3 5m9-5 2 5m14-5-2 5m9-5 3 5"
          stroke="#b18a45"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M19 29Q49 12 81 28L50 37Z" fill="#415a3e" />
        <path d="M32 29v9q18 9 36 0v-9" fill="#54714a" />
        <path d="m73 29 9 6v15" stroke="#ddc878" strokeWidth="2" fill="none" />
        <circle cx="82" cy="51" r="3" fill="#ddc878" />
      </g>
      {mood === "cheer" && (
        <g fill="#d8ba62">
          <path d="m9 16 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
          <path d="m91 39 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" />
        </g>
      )}
    </svg>
  );
}
