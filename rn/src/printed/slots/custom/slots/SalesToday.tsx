import type { ReactNode } from "react";

/* The part "stat-card" the design places on the screen "Slots", marked as the product's own: written
   once by the export, never overwritten. Draw it your own way here.

   It is handed its size. Its children are the design's drawing of it (the kit draws it as its parts), which is
   what it draws until you change it. */
type Props = { width: number; height: number; children?: ReactNode };

export default function SalesToday({ children }: Props) {
  return <>{children}</>;
}
