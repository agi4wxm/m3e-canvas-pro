import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { WidgetIcon } from "./WidgetIcon";
import { useSeeded } from "./seed";
import { useHost, type HostProps } from "./host";

/* A quantity row, after 17722797729/m3e-canvas game-ui (MIT): a minus, the number, a plus, on a filled
 * field of 56dp. `stepper` usually names a row of numbered steps, which is why this part is not
 * simply called that. An input: the number shows `value` whenever it changes, and each step is handed out. */

export function QuantityStepper({ value = 1, min = 0, max = 99, width = 200, demo, onValueChange, onEvent, className, style }: { value?: number; min?: number; max?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent });
  const [count, setCount] = useSeeded(value);
  const step = (by: number) => {
    const next = Math.min(max, Math.max(min, count + by));
    setCount(next);
    host.input(next);
  };
  return (
    <div data-slot="quantity-stepper" data-value={count} className={cn("bg-surface-container-highest flex items-center justify-between rounded-full px-1", className)} style={{ width, height: 56, ...style }}>
      <Button variant="text" size="icon-md" aria-label="Decrease" disabled={count <= min} onClick={() => step(-1)}>
        <WidgetIcon name="remove" />
      </Button>
      <span data-slot="quantity-stepper-value" className="text-title-medium text-on-surface">{count}</span>
      <Button variant="text" size="icon-md" aria-label="Increase" disabled={count >= max} onClick={() => step(1)}>
        <WidgetIcon name="add" />
      </Button>
    </div>
  );
}
