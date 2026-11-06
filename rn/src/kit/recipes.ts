import type { TextStyle, ViewStyle } from "react-native";

import { colorOf, elevation, withAlpha } from "./look";
import { controlRadius, corner, recipeOf, type Kit } from "./theme/ThemeProvider";

/* The recipes a style builds its surfaces and fields with (lib/styles/recipes), as native styles. Each recipe the
 * kit knows is drawn its own way; one it does not know is drawn as Material's (docs/手机端.md lists which). The values
 * come from the recipes' CSS. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";
/** an extra a style's own CSS gives (see `KitTheme.extras`) */
export const extra = (kit: Kit, key: string): string | number | undefined => kit.theme.extras?.[key];
/** an extra that names a color: a role, a role with an opacity (`outline/20`) or a hex */
export const extraColor = (kit: Kit, key: string): string | undefined => {
  const v = extra(kit, key);
  return typeof v === "string" ? colorOf(kit, v) : undefined;
};

/** what the surface recipe adds to every panel: a card, a panel, a sheet, an overlay */
function panelRecipe(kit: Kit): ViewStyle {
  switch (recipeOf(kit, "surface")) {
    case "soft":
      return { boxShadow: "0px 1px 2px 0px #0000000F, 0px 6px 20px 0px #0000000F" };
    case "line":
      return { borderWidth: 1, borderColor: c(kit, "outline-variant"), boxShadow: "0px 1px 2px 0px #0000000D" };
    case "hard":
      return { borderWidth: kit.theme.edge, borderColor: c(kit, "outline"), boxShadow: `4px 4px 0px 0px ${c(kit, "outline")}` };
    case "glow":
      return { borderWidth: 1, borderColor: withAlpha(c(kit, "primary"), 0.55), boxShadow: `0px 0px 16px 0px ${withAlpha(c(kit, "primary"), 0.2)}` };
    case "glass":
      return { backgroundColor: withAlpha(c(kit, "surface-container-high"), 0.42), borderWidth: 1, borderColor: "#FFFFFF38", boxShadow: "0px 8px 32px 0px #00000033" };
    case "ornate":
    case "gilt":
    case "hairline":
      return { borderWidth: 1, borderColor: kit.st.rim ?? c(kit, "primary") };
    case "chunk":
    case "wood":
    case "steel":
      return { borderWidth: 3, borderColor: kit.st.rim ?? c(kit, "outline"), boxShadow: `0px 3px 0px 0px ${kit.st.rimDark ?? "#00000040"}` };
    case "plain":
    case "tile":
      return { borderWidth: 0, boxShadow: undefined };
    default:
      return {};
  }
}

/** what the card recipe adds over the panels for a card */
function cardRecipe(kit: Kit): ViewStyle {
  switch (recipeOf(kit, "card")) {
    case "flat":
      return { borderWidth: 0, boxShadow: undefined, backgroundColor: c(kit, "surface-container-low") };
    case "outlined":
    case "headed":
      return { borderWidth: 1, borderColor: c(kit, "outline-variant"), boxShadow: undefined, backgroundColor: c(kit, "surface-container-low") };
    case "raised":
      return { borderWidth: 0, boxShadow: "0px 1px 2px 0px #0000000D, 0px 8px 24px 0px #00000012", backgroundColor: c(kit, "surface-container-low"), borderRadius: corner(kit, "lg") };
    case "paper":
      return { borderWidth: 1, borderColor: c(kit, "outline-variant"), boxShadow: "0px 1px 2px 0px #0000000A", backgroundColor: c(kit, "surface-container-low") };
    case "framed":
      return { borderWidth: 2, borderColor: kit.st.rim ?? c(kit, "outline") };
    case "glass":
      return { backgroundColor: withAlpha(c(kit, "surface-container-high"), 0.5), borderWidth: 1, borderColor: "#FFFFFF3D" };
    default:
      return {};
  }
}

/** a card: Material's low container lifted one level, then the style's panel and card recipes */
export function cardStyle(kit: Kit, variant: "filled" | "elevated" | "outlined" = "elevated"): ViewStyle {
  const m3: ViewStyle =
    variant === "filled"
      ? { backgroundColor: c(kit, "surface-container-highest"), borderRadius: corner(kit, "md") }
      : variant === "outlined"
        ? { backgroundColor: c(kit, "surface"), borderRadius: corner(kit, "md"), borderWidth: 1, borderColor: c(kit, "outline-variant") }
        : { backgroundColor: c(kit, "surface-container-low"), borderRadius: corner(kit, "md"), boxShadow: elevation(1) };
  return { ...m3, ...panelRecipe(kit), ...cardRecipe(kit) };
}

/** a panel: a dialog, a menu, a sheet's ground */
export function panelStyle(kit: Kit, base: ViewStyle): ViewStyle {
  return { ...base, ...panelRecipe(kit) };
}

/** A field's chrome: the box around the words of an input, a select, a search, or a box playing a field. `variant` is
 *  the part's own (Material's outlined or filled); the style's field and input recipes come over it. */
export function fieldStyle(kit: Kit, variant: string = "outlined", multiline = false): { box: ViewStyle; focus: ViewStyle } {
  const xs = corner(kit, "xs");
  let box: ViewStyle =
    variant === "filled"
      ? { backgroundColor: c(kit, "surface-container-highest"), borderTopLeftRadius: xs, borderTopRightRadius: xs, borderBottomWidth: 1, borderBottomColor: c(kit, "on-surface-variant") }
      : variant === "plain"
        ? {}
        : { borderWidth: 1, borderColor: c(kit, "outline"), borderRadius: xs };
  let focus: ViewStyle = variant === "filled" ? { borderBottomWidth: 2, borderBottomColor: c(kit, "primary") } : { borderWidth: 2, borderColor: c(kit, "primary") };
  if (variant === "plain") return { box, focus: {} };
  const r = controlRadius(kit, 40);
  const radius = multiline ? Math.min(r, 20) : r;
  const reset: ViewStyle = { borderWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: undefined, borderTopRightRadius: undefined, borderRadius: radius };
  switch (recipeOf(kit, "field")) {
    case "soft":
      box = { ...reset, backgroundColor: c(kit, "surface-container-highest") };
      focus = { boxShadow: `0px 0px 0px 2px ${c(kit, "primary")}` };
      break;
    case "boxed":
      box = { ...reset, backgroundColor: c(kit, "surface-container-low"), borderWidth: 1, borderColor: c(kit, "outline-variant"), borderBottomColor: c(kit, "outline") };
      focus = { borderBottomWidth: 2, borderBottomColor: c(kit, "primary") };
      break;
    case "hard":
      box = { ...reset, backgroundColor: c(kit, "surface-container-low"), borderWidth: kit.theme.edge, borderColor: c(kit, "outline") };
      break;
    case "glow":
      box = { ...reset, backgroundColor: withAlpha(c(kit, "primary"), 0.06), borderWidth: 1, borderColor: withAlpha(c(kit, "primary"), 0.55) };
      break;
    case "ring":
      box = { ...reset, backgroundColor: c(kit, "surface-container-low"), borderWidth: 1, borderColor: c(kit, "outline-variant") };
      focus = { borderColor: c(kit, "primary"), boxShadow: `0px 0px 0px 2px ${withAlpha(c(kit, "primary"), 0.2)}` };
      break;
    case "pill":
      box = { ...reset, borderRadius: 26, backgroundColor: c(kit, "surface-container-high"), borderWidth: 1, borderColor: c(kit, "outline-variant") };
      break;
    case "line":
      box = { ...reset, borderRadius: 0, borderBottomWidth: 1, borderBottomColor: kit.st.rim ?? c(kit, "outline") };
      break;
  }
  switch (recipeOf(kit, "input")) {
    case "boxed":
      box = { ...reset, borderRadius: corner(kit, "xs"), borderWidth: 1, borderColor: c(kit, "outline-variant"), backgroundColor: c(kit, "surface-container-low") };
      break;
    case "filled":
      box = { ...reset, backgroundColor: c(kit, "surface-container-highest") };
      focus = { boxShadow: `0px 0px 0px 2px ${withAlpha(c(kit, "primary"), 0.6)}` };
      break;
    case "underline":
      box = { ...reset, borderRadius: 0, borderBottomWidth: 1, borderBottomColor: c(kit, "outline") };
      break;
    case "pill":
      box = { ...reset, borderRadius: multiline ? 20 : 999, borderWidth: 1, borderColor: c(kit, "outline-variant"), backgroundColor: c(kit, "surface-container-low") };
      break;
  }
  /* a style's own fields (iOS's system grey) */
  const fill = extraColor(kit, "fieldFill");
  if (fill) box = { ...box, backgroundColor: fill, borderWidth: 0, borderBottomWidth: 0 };
  const fr = extra(kit, "fieldRadius");
  if (typeof fr === "number") box = { ...box, borderRadius: fr };
  return { box, focus };
}

/** The look of each surface role a box plays (parts/defs/atoms.ts SURFACES), then the style's recipe for it. */
export function surfaceStyle(kit: Kit, surface: string | undefined): ViewStyle {
  switch (surface) {
    case "card":
      return cardStyle(kit, "elevated");
    case "panel":
      return panelStyle(kit, { backgroundColor: c(kit, "surface-container"), borderRadius: corner(kit, "lg") });
    case "field":
      return { backgroundColor: c(kit, "surface-container-high"), borderRadius: corner(kit, "lg"), ...(recipeOf(kit, "field") !== "m3" || recipeOf(kit, "input") !== "m3" || extra(kit, "fieldFill") ? fieldStyle(kit, "outlined").box : {}) };
    case "bar":
      return barStyle(kit);
    case "chip":
      return { borderWidth: 1, borderColor: c(kit, "outline-variant"), borderRadius: Math.min(corner(kit, "sm"), controlRadius(kit, 32)) };
    case "button":
      return { backgroundColor: c(kit, "primary"), borderRadius: controlRadius(kit, 40) };
    case "sheet": {
      const r = recipeOf(kit, "sheet");
      const top = r === "grabber" || r === "weui" ? 12 : r === "panel" ? 0 : corner(kit, "xl");
      return panelStyle(kit, { backgroundColor: c(kit, "surface-container-low"), borderTopLeftRadius: top, borderTopRightRadius: top });
    }
    case "overlay":
      return panelStyle(kit, { backgroundColor: c(kit, "surface-container-high"), borderRadius: corner(kit, "xl"), boxShadow: elevation(3) });
    case "well":
      return { backgroundColor: c(kit, "surface-container-highest"), borderRadius: corner(kit, "md"), boxShadow: "inset 0px 1px 2px 0px #00000014" };
    default:
      return {};
  }
}

/** the words on a surface a box plays: its on-color, when the surface is filled with an accent */
export function surfaceInk(kit: Kit, surface: string | undefined): Record<string, string> | undefined {
  if (surface !== "button") return undefined;
  const on = c(kit, "on-primary");
  return { "on-surface": on, "on-surface-variant": on };
}

/** a bar across the top or the foot: the style's bar ground */
export function barStyle(kit: Kit): ViewStyle {
  const bg = kit.st.barBg ?? c(kit, "surface-container");
  switch (recipeOf(kit, "bar")) {
    case "line":
      return { backgroundColor: c(kit, "surface"), borderBottomWidth: 1, borderColor: c(kit, "outline-variant") };
    case "plain":
      return { backgroundColor: "transparent" };
    case "center":
      return { backgroundColor: c(kit, "surface") };
    case "glow":
      return { backgroundColor: c(kit, "surface-container-low"), borderBottomWidth: 1, borderColor: withAlpha(c(kit, "primary"), 0.55) };
    default:
      return { backgroundColor: bg };
  }
}

/** the words of the style's accent where its fill would not read (WeChat's links are blue-grey, not green) */
export const accentText = (kit: Kit): string => kit.st.primaryText ?? c(kit, "primary");

/** a label set in capitals, where the style sets its buttons and tabs so */
export const capsOf = (kit: Kit): TextStyle => (kit.theme.capsLabels ? { textTransform: "uppercase", letterSpacing: 0.8 } : {});
