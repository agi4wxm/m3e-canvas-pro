import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Tap } from "./Tap";
import { useSeeded } from "./seed";
import { useHost, type HostProps } from "./host";

/* A row of stars. Marked up as radio buttons so a keyboard and a screen reader can use it. An input: the score shows
 * `value` whenever it changes, and a pick is handed out (`onValueChange`, or the host the preview gives). */
export function Rating({ value = 0, count = 5, readOnly = false, demo, onValueChange, onEvent, className, style }: { value?: number; count?: number; readOnly?: boolean } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent });
  const [score, setScore] = useSeeded(value);
  return (
    <div data-slot="rating" data-value={score} role="radiogroup" aria-label="Rating" className={cn("inline-flex items-center gap-0.5", className)} style={style}>
      {Array.from({ length: count }, (_, i) => {
        const on = i < score;
        return (
          <Tap
            key={i}
            role="radio"
            aria-checked={i + 1 === score}
            aria-label={`${i + 1}`}
            data-slot="rating-star"
            data-on={on || undefined}
            disabled={readOnly}
            className={`text-title-large size-7 leading-none ${on ? "text-primary" : "text-outline-variant"}`}
            onClick={() => {
              setScore(i + 1);
              host.input(i + 1);
            }}
          >
            ★
          </Tap>
        );
      })}
    </div>
  );
}
