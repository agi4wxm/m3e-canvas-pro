import type { CSSProperties } from "react";

/* What every widget's root takes, so the fill, text color and corners set on a part (parts/appearance.ts)
 * land on the widget as they do on any other component. */
export type Look = { className?: string; style?: CSSProperties };
