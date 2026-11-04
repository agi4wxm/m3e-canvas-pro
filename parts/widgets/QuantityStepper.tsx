import { useState } from "react";

/* The quantity row of 17722797729/m3e-canvas game-ui (MIT): a minus, the number, a plus, on a filled
 * field of 56dp (ValueRow and the stepper's look in its M3Node.tsx). Other forks use the name
 * `stepper` for a row of numbered steps, which is why this part is not simply called that. */

export function QuantityStepper({ value = 1, min = 0, max = 99, width = 200 }: { value?: number; min?: number; max?: number; width?: number }) {
  const [count, setCount] = useState(value);
  const button = "text-title-large text-on-surface hover:bg-on-surface/8 disabled:text-on-surface/38 size-12 rounded-full";
  return (
    <div data-slot="quantity-stepper" data-value={count} className="bg-surface-container-highest flex items-center justify-between rounded-full px-1" style={{ width, height: 56 }}>
      <button type="button" aria-label="Decrease" className={button} disabled={count <= min} onClick={() => setCount((n) => Math.max(min, n - 1))}>
        −
      </button>
      <span className="text-title-medium text-on-surface">{count}</span>
      <button type="button" aria-label="Increase" className={button} disabled={count >= max} onClick={() => setCount((n) => Math.min(max, n + 1))}>
        +
      </button>
    </div>
  );
}
