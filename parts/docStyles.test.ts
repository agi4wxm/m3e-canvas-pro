import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Icon, setIconFamily } from "@/components/m3e/icon";
import { loadIcons } from "@/components/m3e/icon-sets/load";
import { copyOfStyle, setDocStyles, styleOf, type CustomStyle } from "@/lib/styles";
import { DEFAULT_THEME, normalizeTheme, type Theme } from "@/lib/tokens";
import { DocStylesProvider, PartStyleSheet, useDocStyles } from "./theme";

/* Each root draws its own document's styles: two roots on one page that wear styles of the same key, each different,
 * draw each their own, whatever document's styles are in reach. */

afterEach(() => {
  setDocStyles(undefined);
  setIconFamily("rounded");
});

const base = copyOfStyle(styleOf("ios")!);
const brand = (primary: string): CustomStyle => ({ ...base, key: "custom:brand", light: { ...base.light, primary } });
const A = brand("#C2185B");
const B = brand("#2E7D32");
const theme: Theme = { ...DEFAULT_THEME, style: "custom:brand" };

/** what a root draws: the style's sheet, and the theme as it reads there */
function Probe() {
  const styles = useDocStyles();
  return createElement("i", { "data-font": normalizeTheme(theme, styles).font }, createElement(PartStyleSheet, { theme: normalizeTheme(theme, styles) }));
}
const root = (styles: CustomStyle[] | undefined, children: ReactNode, icons?: "sf" | "lucide") => createElement("section", null, createElement(DocStylesProvider, { styles, icons, children }));

describe("two roots on one page", () => {
  it("wear their own document's styles of the same key", () => {
    /* a third document's style of that key is in reach, as the editor's would be */
    setDocStyles([brand("#000000")]);
    const html = renderToStaticMarkup(createElement("main", null, root([A], createElement(Probe)), root([B], createElement(Probe))));
    const [first, second] = html.split("</section>");
    expect(first).toContain("--md-sys-color-primary:#C2185B");
    expect(first).not.toContain("#2E7D32");
    expect(second).toContain("--md-sys-color-primary:#2E7D32");
    expect(second).not.toContain("#C2185B");
    expect(html).not.toContain("--md-sys-color-primary:#000000");
    expect(first).toContain(`data-font="${A.font}"`);
    /* outside any root, what is in reach */
    expect(renderToStaticMarkup(createElement(Probe))).toContain("--md-sys-color-primary:#000000");
  });

  it("draw their icons in their own family", async () => {
    await loadIcons("sf", ["home"]);
    await loadIcons("lucide", ["home"]);
    setIconFamily("rounded");
    const icon = createElement(Icon, { name: "home" });
    const html = renderToStaticMarkup(createElement("main", null, root([A], icon, "sf"), root([B], icon, "lucide")));
    const [first, second] = html.split("</section>");
    expect(first).toContain('data-family="sf"');
    expect(second).toContain('data-family="lucide"');
    /* outside any root, the app's family */
    expect(renderToStaticMarkup(icon)).not.toContain("data-family");
    setIconFamily("sf");
    expect(renderToStaticMarkup(icon)).toContain('data-family="sf"');
  });
});
