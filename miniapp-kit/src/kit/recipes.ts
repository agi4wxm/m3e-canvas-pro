import { c, ca, css, st } from "./color";
import { elevation } from "./look";
import type { CSS } from "./styles";
import { controlRadius, corner, extra, recipeOf, type Kit } from "./theme";

/* The recipes a style builds its surfaces and fields with (lib/styles/recipes), as CSS over the theme's variables.
 * Each recipe the kit knows is drawn its own way; one it does not know is drawn as Material's. The values come from
 * the recipes' CSS, as the React Native kit has them (rn/src/kit/recipes.ts). */

/** an extra that names a color, as CSS */
export const extraColor = (kit: Kit, key: string): string | undefined => {
  const v = extra(kit, key);
  return typeof v === "string" ? css(v) : undefined;
};

const border = (width: number, color: string): CSS => ({ borderWidth: width, borderStyle: "solid", borderColor: color });

/** what the surface recipe adds to every panel: a card, a panel, a sheet, an overlay */
function panelRecipe(kit: Kit): CSS {
  switch (recipeOf(kit, "surface")) {
    case "soft":
      return { boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.06), 0px 6px 20px 0px rgba(0,0,0,0.06)" };
    case "line":
      return { ...border(1, c("outline-variant")), boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.05)" };
    case "hard":
      return { ...border(kit.theme.edge, c("outline")), boxShadow: `4px 4px 0px 0px ${c("outline")}` };
    case "glow":
      return { ...border(1, ca("primary", 0.55)), boxShadow: `0px 0px 16px 0px ${ca("primary", 0.2)}` };
    case "glass":
      return { backgroundColor: ca("surface-container-high", 0.42), ...border(1, "rgba(255,255,255,0.22)"), boxShadow: "0px 8px 32px 0px rgba(0,0,0,0.2)" };
    case "ornate":
    case "gilt":
    case "hairline":
      return border(1, st("rim"));
    case "chunk":
    case "wood":
    case "steel":
      return { ...border(3, st("rim")), boxShadow: `0px 3px 0px 0px ${st("rimDark")}` };
    case "plain":
    case "tile":
      return { borderWidth: 0, boxShadow: "none" };
    default:
      return {};
  }
}

/** what the card recipe adds over the panels for a card */
function cardRecipe(kit: Kit): CSS {
  switch (recipeOf(kit, "card")) {
    case "flat":
      return { borderWidth: 0, boxShadow: "none", backgroundColor: c("surface-container-low") };
    case "outlined":
    case "headed":
      return { ...border(1, c("outline-variant")), boxShadow: "none", backgroundColor: c("surface-container-low") };
    case "raised":
      return { borderWidth: 0, boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.05), 0px 8px 24px 0px rgba(0,0,0,0.07)", backgroundColor: c("surface-container-low"), borderRadius: corner(kit, "lg") };
    case "paper":
      return { ...border(1, c("outline-variant")), boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.04)", backgroundColor: c("surface-container-low") };
    case "framed":
      return border(2, st("rim"));
    case "glass":
      return { backgroundColor: ca("surface-container-high", 0.5), ...border(1, "rgba(255,255,255,0.24)") };
    default:
      return {};
  }
}

/** a card: Material's low container lifted one level, then the style's panel and card recipes */
export function cardStyle(kit: Kit, variant: "filled" | "elevated" | "outlined" = "elevated"): CSS {
  const m3: CSS =
    variant === "filled"
      ? { backgroundColor: c("surface-container-highest"), borderRadius: corner(kit, "md") }
      : variant === "outlined"
        ? { backgroundColor: c("surface"), borderRadius: corner(kit, "md"), ...border(1, c("outline-variant")) }
        : { backgroundColor: c("surface-container-low"), borderRadius: corner(kit, "md"), boxShadow: elevation(1) };
  return { ...m3, ...panelRecipe(kit), ...cardRecipe(kit) };
}

/** a panel: a dialog, a menu, a sheet's ground */
export const panelStyle = (kit: Kit, base: CSS): CSS => ({ ...base, ...panelRecipe(kit) });

/** A field's chrome: the box around the words of an input, a select, a search. `variant` is the part's own (Material's
 *  outlined or filled); the style's field and input recipes come over it. */
export function fieldStyle(kit: Kit, variant: string = "outlined", multiline = false): { box: CSS; focus: CSS } {
  const xs = corner(kit, "xs");
  let box: CSS =
    variant === "filled"
      ? { backgroundColor: c("surface-container-highest"), borderTopLeftRadius: xs, borderTopRightRadius: xs, borderBottom: `1px solid ${c("on-surface-variant")}` }
      : variant === "plain"
        ? {}
        : { ...border(1, c("outline")), borderRadius: xs };
  let focus: CSS = variant === "filled" ? { borderBottom: `2px solid ${c("primary")}` } : { boxShadow: `inset 0 0 0 1px ${c("primary")}`, borderColor: c("primary") };
  if (variant === "plain") return { box, focus: {} };
  const r = controlRadius(kit, 40);
  const radius = multiline ? Math.min(r, 20) : r;
  const reset: CSS = { border: "none", borderRadius: radius };
  switch (recipeOf(kit, "field")) {
    case "soft":
      box = { ...reset, backgroundColor: c("surface-container-highest") };
      focus = { boxShadow: `0px 0px 0px 2px ${c("primary")}` };
      break;
    case "boxed":
      box = { ...reset, backgroundColor: c("surface-container-low"), ...border(1, c("outline-variant")), borderBottomColor: c("outline") };
      focus = { borderBottom: `2px solid ${c("primary")}` };
      break;
    case "hard":
      box = { ...reset, backgroundColor: c("surface-container-low"), ...border(kit.theme.edge, c("outline")) };
      break;
    case "glow":
      box = { ...reset, backgroundColor: ca("primary", 0.06), ...border(1, ca("primary", 0.55)) };
      break;
    case "ring":
      box = { ...reset, backgroundColor: c("surface-container-low"), ...border(1, c("outline-variant")) };
      focus = { borderColor: c("primary"), boxShadow: `0px 0px 0px 2px ${ca("primary", 0.2)}` };
      break;
    case "pill":
      box = { ...reset, borderRadius: 26, backgroundColor: c("surface-container-high"), ...border(1, c("outline-variant")) };
      break;
    case "line":
      box = { ...reset, borderRadius: 0, borderBottom: `1px solid ${st("rim")}` };
      break;
  }
  switch (recipeOf(kit, "input")) {
    case "boxed":
      box = { ...reset, borderRadius: corner(kit, "xs"), ...border(1, c("outline-variant")), backgroundColor: c("surface-container-low") };
      break;
    case "filled":
      box = { ...reset, backgroundColor: c("surface-container-highest") };
      focus = { boxShadow: `0px 0px 0px 2px ${ca("primary", 0.6)}` };
      break;
    case "underline":
      box = { ...reset, borderRadius: 0, borderBottom: `1px solid ${c("outline")}` };
      break;
    case "pill":
      box = { ...reset, borderRadius: multiline ? 20 : 999, ...border(1, c("outline-variant")), backgroundColor: c("surface-container-low") };
      break;
  }
  /* a style's own fields (iOS's system grey) */
  const fill = extraColor(kit, "fieldFill");
  if (fill) box = { ...box, backgroundColor: fill, border: "none" };
  const fr = extra(kit, "fieldRadius");
  if (typeof fr === "number") box = { ...box, borderRadius: fr };
  return { box, focus };
}

/** whether the style has fields of its own (the label then stays inside the box) */
export const ownFields = (kit: Kit) => recipeOf(kit, "field") !== "m3" || recipeOf(kit, "input") !== "m3" || !!extra(kit, "fieldFill");

/** a bar across the top or the foot: the style's bar ground */
export function barStyle(kit: Kit): CSS {
  switch (recipeOf(kit, "bar")) {
    case "line":
      return { backgroundColor: c("surface"), borderBottom: `1px solid ${c("outline-variant")}` };
    case "plain":
      return { backgroundColor: "transparent" };
    case "center":
      return { backgroundColor: c("surface") };
    case "glow":
      return { backgroundColor: c("surface-container-low"), borderBottom: `1px solid ${ca("primary", 0.55)}` };
    default:
      return { backgroundColor: st("barBg") };
  }
}

/** The look of each surface role a box plays (parts/defs/atoms.ts SURFACES), then the style's recipe for it. */
export function surfaceStyle(kit: Kit, surface: string | undefined): CSS {
  switch (surface) {
    case "card":
      return cardStyle(kit, "elevated");
    case "panel":
      return panelStyle(kit, { backgroundColor: c("surface-container"), borderRadius: corner(kit, "lg") });
    case "field":
      return { backgroundColor: c("surface-container-high"), borderRadius: corner(kit, "lg"), ...(ownFields(kit) ? fieldStyle(kit, "outlined").box : {}) };
    case "bar":
      return barStyle(kit);
    case "chip":
      return { ...border(1, c("outline-variant")), borderRadius: Math.min(corner(kit, "sm"), controlRadius(kit, 32)) };
    case "button":
      return { backgroundColor: c("primary"), borderRadius: controlRadius(kit, 40) };
    case "sheet": {
      const r = recipeOf(kit, "sheet");
      const top = r === "grabber" || r === "weui" ? 12 : r === "panel" ? 0 : corner(kit, "xl");
      return panelStyle(kit, { backgroundColor: c("surface-container-low"), borderTopLeftRadius: top, borderTopRightRadius: top });
    }
    case "overlay":
      return panelStyle(kit, { backgroundColor: c("surface-container-high"), borderRadius: corner(kit, "xl"), boxShadow: elevation(3) });
    case "well":
      return { backgroundColor: c("surface-container-highest"), borderRadius: corner(kit, "md"), boxShadow: "inset 0px 1px 2px 0px rgba(0,0,0,0.08)" };
    default:
      return {};
  }
}

/** the words of the style's accent where its fill would not read (WeChat's links are blue-grey, not green) */
export const accentText = () => st("primaryText");

/** a label set in capitals, where the style sets its buttons and tabs so */
export const capsOf = (kit: Kit): CSS => (kit.theme.capsLabels ? { textTransform: "uppercase", letterSpacing: 0.8 } : {});
