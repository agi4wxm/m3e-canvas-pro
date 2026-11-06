/* What a theme is to the kit: everything the editor's style resolves to, as plain numbers and colors (the editor writes it,
 * lib/export/rn/theme.ts). On the web the same theme is CSS variables and a stylesheet of recipes; a phone has neither,
 * so the colors come resolved for each mode and each control reads the recipe its style builds it with. */

/** one step of a type ramp: size and line height in dp, weight, letter spacing in dp */
export type TypeStep = { size: number; line: number; weight: number; track: number };

export type TypeRole =
  | "display-large"
  | "display-medium"
  | "display-small"
  | "headline-large"
  | "headline-medium"
  | "headline-small"
  | "title-large"
  | "title-medium"
  | "title-small"
  | "body-large"
  | "body-medium"
  | "body-small"
  | "label-large"
  | "label-medium"
  | "label-small";

/** One mode: every M3 color role by its kebab-case name (`on-primary-container`), and the style's own colors (`st`):
 *  the on-color of a switch, the chosen tab, the bars' ground. */
export type ThemeMode = { colors: Record<string, string>; st: Record<string, string> };

export type KitTheme = {
  /** the style's key, or "material" */
  key: string;
  /** app, desktop, mobileGame or pcGame */
  group: string;
  /** the mode the style is at its best in */
  mode: "light" | "dark";
  light: ThemeMode;
  dark: ThemeMode;
  type: Record<string, TypeStep>;
  /** the corner scale and M3's steps at it: xs, sm, md, lg, lgi, xl, xli, xxl */
  shape: { scale: number; corners: Record<string, number> };
  /** a button's or a chip's corner: 999 keeps the round ends; `follow` turns every round corner into it */
  control: { radius: number; follow: boolean };
  /** the faces on the web (a CSS family list) and the Google Fonts sheets they come from; a phone draws the system face */
  font: { web: string; webDisplay?: string; google: string[] };
  /** the icon family glyphs are drawn from */
  icons: string;
  /** the recipe each kind of control is built with (lib/styles/recipes): "m3" is Material's own */
  recipes: Record<string, string>;
  /** the width of a hard edge */
  edge: number;
  /** desktop software: smaller words, shorter controls */
  compact: boolean;
  capsLabels: boolean;
  italicDisplay: boolean;
  /** margins and gaps of a screen */
  ux: { margin: number; gap: number; tight: number };
  /** What a style's own CSS says that no recipe does, as values (the grey of iOS's fields, its frosted bars): see
   *  lib/export/rn/theme.ts for each style's. */
  extras: Record<string, string | number>;
};
