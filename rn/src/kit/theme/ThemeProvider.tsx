import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Platform, useColorScheme, type TextStyle } from "react-native";

import { MATERIAL } from "./default.generated";
import type { Mutable } from "../styles";
import type { KitTheme, TypeRole } from "./types";

/* The theme every part reads: the document's colors in the mode the app is in, its type ramp, corners and recipes.
 * A fill or a text color on a part repaints the roles its words read in for everything inside it (`Ink`), the way
 * the web redefines `--md-sys-color-on-surface` on the painted node (parts/appearance.ts). */

export type Kit = {
  theme: KitTheme;
  dark: boolean;
  /** every color role in this mode, with what an `Ink` above has repainted */
  colors: Record<string, string>;
  /** the style's own colors in this mode */
  st: Record<string, string>;
};

const KitContext = createContext<Kit>({ theme: MATERIAL, dark: false, colors: MATERIAL.light.colors, st: MATERIAL.light.st });

/** The theme for everything inside. `dark` follows the device unless it is given; the style's own mode is not forced. */
export function ThemeProvider({ theme, dark, children }: { theme: KitTheme; dark?: boolean; children: ReactNode }) {
  const system = useColorScheme();
  const isDark = dark ?? system === "dark";
  const value = useMemo<Kit>(() => {
    const mode = isDark ? theme.dark : theme.light;
    return { theme, dark: isDark, colors: mode.colors, st: mode.st };
  }, [theme, isDark]);
  return <KitContext.Provider value={value}>{children}</KitContext.Provider>;
}

export const useKit = () => useContext(KitContext);

/** Repaint some roles for everything inside: a filled surface makes its words read in its on-color. */
export function Ink({ roles, children }: { roles: Record<string, string> | undefined; children: ReactNode }) {
  const kit = useKit();
  const value = useMemo<Kit>(() => (roles && Object.keys(roles).length ? { ...kit, colors: { ...kit.colors, ...roles } } : kit), [kit, roles]);
  return <KitContext.Provider value={value}>{children}</KitContext.Provider>;
}

/** a color role in the current mode, or `fallback` (a role or a color) when the theme has none by that name */
export const roleColor = (kit: Kit, role: string, fallback = "on-surface"): string => kit.colors[role] ?? kit.colors[fallback] ?? fallback;

/** a recipe's variant, "m3" when the style says nothing */
export const recipeOf = (kit: Kit, key: string): string => kit.theme.recipes[key] ?? "m3";

/** one of M3's corner steps at the theme's scale */
export const corner = (kit: Kit, step: "xs" | "sm" | "md" | "lg" | "lgi" | "xl" | "xli" | "xxl"): number => kit.theme.shape.corners[step] ?? 0;

/** the corner of a control (a button, a chip) under the style: half its height when it keeps M3's round ends */
export const controlRadius = (kit: Kit, height: number): number => (kit.theme.control.radius >= 999 ? height / 2 : kit.theme.control.radius);

/** what `rounded-full` means under the style: round, or the control's corner when the style squares everything */
export const pillRadius = (kit: Kit, height: number): number => (kit.theme.control.follow ? Math.min(height / 2, kit.theme.control.radius) : height / 2);

/** the face words are set in: the style's on the web, the system's on a phone (a face has to be bundled to be drawn there) */
export const fontOf = (kit: Kit, display = false): string | undefined => (Platform.OS === "web" ? (display && kit.theme.font.webDisplay) || kit.theme.font.web : undefined);

const HEADINGS = new Set(["display-large", "display-medium", "display-small", "headline-large", "headline-medium", "headline-small", "title-large"]);

/** a type role as a text style; `bold` sets it in bold as the text part's switch does */
export function typeStyle(kit: Kit, role: TypeRole, bold = false): TextStyle {
  const step = kit.theme.type[role] ?? kit.theme.type["body-medium"];
  const heading = HEADINGS.has(role);
  const out: Mutable<TextStyle> = {
    fontSize: step.size,
    lineHeight: step.line,
    fontWeight: String(bold ? 700 : step.weight) as TextStyle["fontWeight"],
    letterSpacing: step.track,
  };
  const family = fontOf(kit, heading);
  if (family) out.fontFamily = family;
  if (heading && kit.theme.italicDisplay) Object.assign(out, { fontStyle: "italic", fontWeight: "800", textTransform: "uppercase" });
  return out;
}
