import { useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { WidgetIcon } from "./WidgetIcon";

/* The quantity row of 17722797729/m3e-canvas game-ui (MIT): a minus, the number, a plus, on a filled
 * field of 56dp (ValueRow and the stepper's look in its M3Node.tsx). Other forks use the name
 * `stepper` for a row of numbered steps, which is why this part is not simply called that. */

export function QuantityStepper({ value = 1, min = 0, max = 99, width = 200, className, style }: { value?: number; min?: number; max?: number; width?: number } & Look) {
  const [count, setCount] = useState(value);
  return (
    <div data-slot="quantity-stepper" data-value={count} className={cn("bg-surface-container-highest flex items-center justify-between rounded-full px-1", className)} style={{ width, height: 56, ...style }}>
      <Button variant="text" size="icon-md" aria-label="Decrease" disabled={count <= min} onClick={() => setCount((n) => Math.max(min, n - 1))}>
        <WidgetIcon name="remove" />
      </Button>
      <span className="text-title-medium text-on-surface">{count}</span>
      <Button variant="text" size="icon-md" aria-label="Increase" disabled={count >= max} onClick={() => setCount((n) => Math.min(max, n + 1))}>
        <WidgetIcon name="add" />
      </Button>
    </div>
  );
}
