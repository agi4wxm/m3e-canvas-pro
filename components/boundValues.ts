import { createContext } from "react";
import type { VarValue } from "@/lib/tokens";

/** The variables' values where parts are drawn (a screen on the canvas, in the preview, in a saved picture): a design
 *  field a part binds to one (`@fill`, `@opacity`…) is drawn with it (lib/variables.ts `boundItem`). Outside any,
 *  parts are drawn as they are. */
export const BoundValues = createContext<Record<string, VarValue> | null>(null);
