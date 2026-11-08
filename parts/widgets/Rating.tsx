import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Tap } from "./Tap";
import { useValue } from "./seed";
import { useHost, type HostProps } from "./host";
import { rove } from "./roving";
import { useSay } from "@/components/m3e/say";

/* A row of stars. Marked up as radio buttons so a keyboard and a screen reader can use it: one stop in the Tab order,
 * the arrow keys move the score. An input (docs/组件规范.md "受控值和草稿"): while someone takes the score it shows
 * `value` as given, and a pick is only handed out, so a score the other side turns down shows turned down. Its name is
 * the author's, else "Rating" in the page's language. */
export function Rating({ value = 0, count = 5, readOnly = false, label, demo, onValueChange, onEvent, wired, className, style }: { value?: number; count?: number; readOnly?: boolean; label?: string } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const say = useSay();
  const [score, setScore] = useValue(value, host);
  /* a radio group: the arrows choose the star they land on */
  const keys = rove(count, score - 1, { orientation: "horizontal", onMove: readOnly ? undefined : (i) => setScore(i + 1) });
  return (
    <div data-slot="rating" data-value={score} role="radiogroup" aria-label={label || say("Rating")} aria-readonly={readOnly || undefined} className={cn("inline-flex items-center gap-0.5", className)} style={style}>
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
            aria-disabled={readOnly || undefined}
            {...keys(i)}
            className={`text-title-large size-7 leading-none ${on ? "text-primary" : "text-outline-variant"}`}
            onClick={readOnly ? undefined : () => setScore(i + 1)}
          >
            ★
          </Tap>
        );
      })}
    </div>
  );
}
