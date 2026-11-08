import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Tap } from "./Tap";
import { useValue } from "./seed";
import { useHost, type HostProps } from "./host";

/* A row of stars. Marked up as radio buttons so a keyboard and a screen reader can use it: the arrow keys move the
 * score. An input (docs/组件规范.md "受控值和草稿"): while someone takes the score it shows `value` as given, and a
 * pick is only handed out, so a score the other side turns down shows turned down. */
export function Rating({ value = 0, count = 5, readOnly = false, demo, onValueChange, onEvent, wired, className, style }: { value?: number; count?: number; readOnly?: boolean } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [score, setScore] = useValue(value, host);
  return (
    <div
      data-slot="rating"
      data-value={score}
      role="radiogroup"
      aria-label="Rating"
      aria-readonly={readOnly || undefined}
      className={cn("inline-flex items-center gap-0.5", className)}
      style={style}
      onKeyDown={(e) => {
        if (readOnly) return;
        const to = e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(count, score + 1) : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(1, score - 1) : e.key === "Home" ? 1 : e.key === "End" ? count : 0;
        if (!to) return;
        e.preventDefault();
        if (to !== score) setScore(to);
        (e.currentTarget.children[to - 1] as HTMLElement | undefined)?.focus();
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const on = i < score;
        return (
          <Tap
            key={i}
            role="radio"
            aria-checked={i + 1 === score}
            aria-label={`${i + 1}`}
            tabIndex={i + 1 === Math.max(1, score) ? 0 : -1}
            data-slot="rating-star"
            data-on={on || undefined}
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
