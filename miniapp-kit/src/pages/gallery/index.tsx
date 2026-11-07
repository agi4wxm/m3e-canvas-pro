import { View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import type { ComponentType } from "react";

import { THEMES, type GalleryStyle } from "../../gallery/themes.generated";
import { ICONS } from "../../gallery/icons.generated";
import { COMPONENTS, NATIVE, PARTS, ThemeProvider, ThemeRoot, Words, registerIcons, type KitTheme } from "../../kit";
import { PRINTED_PAGES } from "../../printed/pages";

registerIcons(ICONS);

/* The kit's gallery: every part it draws with a component of its own, with the editor's defaults, under one of the
 * styles it is checked with (?style=ios, ?dark=1, ?part=button,switch), and links to the printed documents' pages. The
 * editor's /gallery draws the same parts beside it (scripts/shots.cjs). */

const STYLES = Object.keys(THEMES) as GalleryStyle[];

export default function Gallery() {
  const q = useRouter().params as Record<string, string | undefined>;
  const style = (STYLES.includes(q.style as GalleryStyle) ? q.style : "material") as GalleryStyle;
  /* a style at its best in the dark (Spotify) is drawn dark, as the editor draws it, unless ?dark= says otherwise */
  const dark = q.dark !== undefined ? q.dark === "1" : THEMES[style].mode === "dark";
  const only = q.part ? q.part.split(",") : undefined;
  const theme: KitTheme = { ...THEMES[style], scope: `m3e-gallery-${style}` };
  const slugs = (Object.keys(NATIVE) as (keyof typeof NATIVE)[]).filter((s) => !only || only.includes(s));
  return (
    <ThemeProvider theme={theme} dark={dark}>
      <ThemeRoot style={{ minHeight: "100vh", backgroundColor: "var(--md-sys-color-surface)", padding: 16, boxSizing: "border-box" }}>
        {only ? null : (
          <View style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {STYLES.map((s) => (
              <View key={s} onClick={() => void Taro.redirectTo({ url: `/pages/gallery/index?style=${s}` })} style={{ padding: "4px 10px", borderRadius: 12, border: "1px solid var(--md-sys-color-outline-variant)" }}>
                <Words text={s} style={{ color: "var(--md-sys-color-on-surface)", fontSize: 13 }} />
              </View>
            ))}
            {PRINTED_PAGES.map((p) => (
              <View key={p} onClick={() => void Taro.navigateTo({ url: `/${p}` })} style={{ padding: "4px 10px", borderRadius: 12, backgroundColor: "var(--md-sys-color-secondary-container)" }}>
                <Words text={p.replace(/^printed\//, "").replace(/\/index$/, "").replace("/pages/", ": ")} style={{ color: "var(--md-sys-color-on-secondary-container)", fontSize: 12 }} />
              </View>
            ))}
          </View>
        )}
        <View style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {slugs.map((slug) => {
            const Part = COMPONENTS[slug] as ComponentType<Record<string, unknown>>;
            return (
              <View key={slug} data-cell={slug} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Words text={`${PARTS[slug]?.name ?? slug} · ${slug}`} style={{ color: "var(--md-sys-color-on-surface-variant)", fontSize: 11, fontFamily: "monospace" }} />
                <View style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
                  <Part testID={slug} />
                </View>
              </View>
            );
          })}
        </View>
      </ThemeRoot>
    </ThemeProvider>
  );
}
