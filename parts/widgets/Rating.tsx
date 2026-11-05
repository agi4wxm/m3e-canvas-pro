import { useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Tap } from "./Tap";

/* A row of stars. Marked up as radio buttons so a keyboard and a screen reader can use it. */
export function Rating({ value = 0, count = 5, readOnly = false, className, style }: { value?: number; count?: number; readOnly?: boolean } & Look) {
  const [score, setScore] = useState(value);
  return (
    <div data-slot="rating" data-value={score} role="radiogroup" aria-label="Rating" className={cn("inline-flex items-center gap-0.5", className)} style={style}>
      {Array.from({ length: count }, (_, i) => {
        const on = i < score;
        return (
          <Tap
            key={i}
            role="radio"
            data-slot="rating-star"
            data-on={on || undefined}
            aria-checked={i + 1 === score}
            aria-label={`${i + 1}`}
            data-slot="rating-star"
            disabled={readOnly}
            className={`text-title-large size-7 leading-none ${on ? "text-primary" : "text-outline-variant"}`}
            onClick={() => setScore(i + 1)}
          >
            ★
          </Tap>
        );
      })}
    </div>
  );
}
