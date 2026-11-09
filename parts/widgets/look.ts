import type { CSSProperties } from "react";

/* What every widget's root takes, so the fill, text color and corners set on a part (parts/appearance.ts)
 * land on the widget as they do on any other component. */
export type Look = { className?: string; style?: CSSProperties };

/** A color a part worked out for a widget to paint (parts/color.ts `cssColor`): a hex, a role of the scheme, or a role
 *  at a share of itself. Anything else (a file's own CSS) is not painted. */
export const PAINTABLE = /^(#[0-9a-f]{3,8}|var\(--md-sys-color-[a-z]+(-[a-z]+)*\)|color-mix\(in srgb, var\(--md-sys-color-[a-z]+(-[a-z]+)*\) \d{1,3}%, transparent\))$/i;
