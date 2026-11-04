import type { ComponentProps } from "react";
import { cn } from "@/lib/m3e/cn";
import { Ripple } from "@/components/m3e/ripple";

/* A press target that is not a button to look at: a slot, a star, a cell of a grid. It answers a press
 * the way every shadcn M3E control does. A widget uses this or Button, never a bare <button>. */
export function Tap({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button type="button" {...props} className={cn("relative isolate cursor-pointer overflow-hidden disabled:cursor-default", className)}>
      <Ripple disabled={props.disabled} />
      {children}
    </button>
  );
}
