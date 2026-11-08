import { useEffect, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { WidgetIcon } from "./WidgetIcon";
import { useHost, type HostProps } from "./host";
import { useValue } from "./seed";

/* The browser's own color input beside its label and value. An input: the color is `value`, and the well and the
 * eyedropper only hand a new one out, so while someone takes it the color shown is the one given. An author's color
 * is data, not a theme role, so this one value is written as it is. */

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorField({ label = "", value = "#6750A4", demo, onValueChange, onEvent, wired, className, style }: { label?: string; value?: string } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [given, setColor] = useValue(value, host);
  const color = HEX.test(given) ? given : "#6750A4";
  const [canPick, setCanPick] = useState(false);
  useEffect(() => setCanPick("EyeDropper" in window), []);
  const pick = async () => {
    const Dropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!Dropper) return;
    try {
      setColor((await new Dropper().open()).sRGBHex);
    } catch {
      /* the author pressed Escape */
    }
  };
  return (
    <label data-slot="color-field" data-color={color} className={cn("bg-surface-container-highest inline-flex h-14 w-full min-w-48 items-center gap-3 rounded-xl px-3", className)} style={style}>
      <input type="color" aria-label={label || "Color"} value={color} onChange={(e) => setColor(e.target.value)} className="size-8 shrink-0 cursor-pointer rounded-full" />
      <span className="flex min-w-0 flex-1 flex-col">
        {label && <span className="text-label-medium text-on-surface-variant truncate">{label}</span>}
        <span className="text-body-medium text-on-surface">{color.toUpperCase()}</span>
      </span>
      {canPick && (
        <Button variant="text" size="icon-sm" aria-label="Pick from the screen" onClick={pick}>
          <WidgetIcon name="colorize" />
        </Button>
      )}
    </label>
  );
}
