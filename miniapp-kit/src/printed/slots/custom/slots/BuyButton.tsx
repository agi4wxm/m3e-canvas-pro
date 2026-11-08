import type { ComponentProps, ReactNode } from "react";
import type { Button } from "../../../../kit";

/* The part "button" the design places on the screen "Slots", marked as the product's own: written
   once by the export, never overwritten. Draw it your own way here.

   It is handed what the kit's Button is handed: its props as the design sets them, its taps, events and input
   wired to the design's actions and data. Its children are the kit's drawing of it, which is what it draws until
   you change it. */
type Props = ComponentProps<typeof Button> & { children?: ReactNode };

export default function BuyButton({ children }: Props) {
  return <>{children}</>;
}
