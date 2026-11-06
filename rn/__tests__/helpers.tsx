import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { registerIcons, ThemeProvider, type KitTheme } from "../src/kit";
import { ICONS } from "../src/gallery/icons.generated";
import { THEMES } from "../src/gallery/themes.generated";

/* What every test draws in: the glyphs of the gallery, and one of its styles' themes. */
registerIcons(ICONS);

export const MATERIAL_THEME: KitTheme = THEMES.material;

/** a part drawn under a style (Material unless said), as an app draws it */
export function draw(ui: ReactElement, theme: KitTheme = MATERIAL_THEME, dark = false) {
  return render(
    <ThemeProvider theme={theme} dark={dark}>
      {ui}
    </ThemeProvider>,
  );
}

/** the flattened style of a host element */
export const styleOf = (node: { props: { style?: unknown } }): Record<string, unknown> => {
  const flat = (s: unknown): Record<string, unknown> => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s && typeof s === "object" ? (s as Record<string, unknown>) : {});
  return flat(node.props.style);
};
