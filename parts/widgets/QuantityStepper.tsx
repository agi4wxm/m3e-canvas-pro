import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { WidgetIcon } from "./WidgetIcon";
import { useValue } from "./seed";
import { useHost, type HostProps } from "./host";

/* A quantity row, after 17722797729/m3e-canvas game-ui (MIT): a minus, the number, a plus, on a filled
 * field of 56dp. `stepper` usually names a row of numbered steps, which is why this part is not
 * simply called that. An input: while someone takes the number it shows `value` as given, and each step is handed
 * out; the minus and the plus are also places of their own (`dec`, `inc`) for an action that changes it elsewhere. */

export function QuantityStepper({ value = 1, min = 0, max = 99, width = 200, demo, onValueChange, onEvent, wired, className, style }: { value?: number; min?: number; max?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [given, setCount] = useValue(value, host);
  const count = Math.min(max, Math.max(min, given));
  const step = (by: number) => setCount(Math.min(max, Math.max(min, count + by)));
  return (
    <div data-slot="quantity-stepper" data-value={count} className={cn("bg-surface-container-highest flex items-center justify-between rounded-full px-1", className)} style={{ width, height: 56, ...style }}>
      <Button variant="text" size="icon-md" aria-label="Decrease" data-tap="dec" disabled={count <= min} onClick={() => step(-1)}>
        <WidgetIcon name="remove" />
      </Button>
      <span data-slot="quantity-stepper-value" role="status" className="text-title-medium text-on-surface">{count}</span>
      <Button variant="text" size="icon-md" aria-label="Increase" data-tap="inc" disabled={count >= max} onClick={() => step(1)}>
        <WidgetIcon name="add" />
      </Button>
    </div>
  );
}
