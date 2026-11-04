import { useState } from "react";

/* A row of stars. Marked up as radio buttons so a keyboard and a screen reader can use it. */
export function Rating({ value = 0, count = 5, readOnly = false }: { value?: number; count?: number; readOnly?: boolean }) {
  const [score, setScore] = useState(value);
  return (
    <div data-slot="rating" data-value={score} role="radiogroup" aria-label="Rating" className="inline-flex items-center gap-0.5">
      {Array.from({ length: count }, (_, i) => {
        const on = i < score;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i + 1 === score}
            aria-label={`${i + 1}`}
            disabled={readOnly}
            className={`text-title-large size-7 leading-none ${on ? "text-primary" : "text-outline-variant"}`}
            onClick={() => setScore(i + 1)}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
