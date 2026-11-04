import { useState } from "react";

/* The browser's own color input beside its label and value. An author's color is data, not a theme
 * role, so this one value is written as it is. */

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorField({ label = "", value = "#6750A4" }: { label?: string; value?: string }) {
  const [color, setColor] = useState(HEX.test(value) ? value : "#6750A4");
  return (
    <label data-slot="color-field" className="bg-surface-container-highest inline-flex h-14 w-full min-w-48 items-center gap-3 rounded-xl px-3">
      <input type="color" aria-label={label || "Color"} value={color} onChange={(e) => setColor(e.target.value)} className="size-8 shrink-0 cursor-pointer rounded-full" />
      <span className="flex min-w-0 flex-col">
        {label && <span className="text-label-medium text-on-surface-variant truncate">{label}</span>}
        <span className="text-body-medium text-on-surface">{color.toUpperCase()}</span>
      </span>
    </label>
  );
}
