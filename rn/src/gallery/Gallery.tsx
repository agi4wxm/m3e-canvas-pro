import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, Text as RNText, View } from "react-native";

import { COMPONENTS, PARTS, Placeholder, ThemeProvider, TreeView, isNative, useKit, type KitTheme } from "../kit";
import { CATEGORIES } from "../kit/parts.generated";
import { THEMES, type GalleryStyle } from "./themes.generated";
import { TREES } from "./trees.generated";

/* Every part drawn by the kit under one style, as the editor's gallery draws it (/gallery?style=…): a labelled cell per
 * part on the style's screen, with the samples that show how a style composes a part, and every kit in the variant the
 * style picks. A part is drawn by its own component, by the tree of atoms it splits into, or by a placeholder: each cell
 * says which. On the web the address picks: ?style=ios&dark=1&part=button,switch. */

/** more cells for the parts whose composition a style changes with a prop (components/Gallery.tsx SAMPLES) */
const SAMPLES: Record<string, { label: string; props: Record<string, unknown> }[]> = {
  "app-bar": [
    { label: "back", props: { leading: "arrow_back", title: "Details", trailing: "more_horiz" } },
    { label: "large", props: { leading: "", size: "large", title: "Settings", trailing: "search" } },
  ],
  item: [
    {
      label: "settings",
      props: {
        items: [
          { label: "Wi-Fi", icon: "wifi" },
          { label: "Bluetooth", icon: "bluetooth" },
          { label: "Notifications", icon: "notifications" },
        ],
        description: "",
        trailing: "text",
        trailingText: "On",
      },
    },
    { label: "switch", props: { items: [{ label: "Airplane mode", icon: "flight" }], description: "", trailing: "switch", checked: true } },
  ],
  button: [
    { label: "tonal", props: { variant: "tonal" } },
    { label: "outlined", props: { variant: "outlined" } },
    { label: "text", props: { variant: "text" } },
  ],
  search: [{ label: "bar", props: { kind: "bar" } }],
  sheet: [{ label: "bottom", props: { side: "bottom" } }],
};

export type GalleryQuery = { style: GalleryStyle; dark?: boolean; parts?: Set<string>; kits: boolean };

/** what the address asks for, on the web */
export function queryOf(search: string): GalleryQuery {
  const q = new URLSearchParams(search);
  const style = (q.get("style") ?? "material") as GalleryStyle;
  const dark = q.get("dark");
  const parts = q.get("part");
  return { style: style in THEMES ? style : "material", dark: dark === "1" ? true : dark === "0" ? false : undefined, parts: parts ? new Set(parts.split(",")) : undefined, kits: q.get("kits") !== "0" };
}

/** how a part is drawn under the kit */
export type Coverage = "native" | "atoms" | "placeholder";
export const coverageOf = (slug: string, style: GalleryStyle): Coverage => (isNative(slug) ? "native" : TREES[style]?.splits[slug] ? "atoms" : "placeholder");

function Cell({ label, sub, tag, testID, children }: { label: string; sub: string; tag: Coverage | "kit"; testID: string; children: ReactNode }) {
  const kit = useKit();
  return (
    <View testID={testID} style={{ rowGap: 6, maxWidth: "100%" }}>
      <View style={{ flexDirection: "row", columnGap: 6, alignItems: "baseline" }}>
        <RNText style={{ fontSize: 12, lineHeight: 16, fontWeight: "500", color: "#202124" }}>{label}</RNText>
        <RNText style={{ fontSize: 11, lineHeight: 16, color: "#5f6368", fontFamily: Platform.OS === "web" ? "ui-monospace, monospace" : "monospace" }}>{sub}</RNText>
        <RNText style={{ fontSize: 10, lineHeight: 16, color: tag === "native" ? "#188038" : tag === "placeholder" ? "#c5221f" : "#1a73e8" }}>{tag}</RNText>
      </View>
      <View style={{ padding: 16, borderRadius: 12, backgroundColor: kit.colors.surface, outlineWidth: 1, outlineColor: "#00000014", outlineStyle: "solid", alignSelf: "flex-start", maxWidth: "100%", overflow: "hidden" }}>{children}</View>
    </View>
  );
}

/** one part with these props, drawn as the kit draws it */
function PartCell({ slug, style, props, sample }: { slug: string; style: GalleryStyle; props?: Record<string, unknown>; sample?: string }) {
  const info = PARTS[slug];
  const tag = coverageOf(slug, style);
  const Part = (COMPONENTS as Record<string, React.ComponentType<Record<string, unknown>>>)[slug];
  const tree = TREES[style]?.splits[slug];
  return (
    <Cell label={info?.name ?? slug} sub={sample ? `${slug} · ${sample}` : slug} tag={tag} testID={`cell-${slug}${sample ? `-${sample}` : ""}`}>
      {Part ? <Part {...props} testID={`part-${slug}${sample ? `-${sample}` : ""}`} /> : tree ? <TreeView node={tree} testID={`part-${slug}`} /> : <Placeholder part={slug} name={info?.name} />}
    </Cell>
  );
}

function Chrome({ query, onStyle }: { query: GalleryQuery; onStyle: (s: GalleryStyle) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 6, rowGap: 6, alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#dadce0", backgroundColor: "#FFFFFF" }}>
      <RNText style={{ fontSize: 13, fontWeight: "700", marginRight: 8, color: "#202124" }}>RN gallery</RNText>
      {(Object.keys(THEMES) as GalleryStyle[]).map((s) => (
        <Pressable key={s} accessibilityRole="button" onPress={() => onStyle(s)} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: s === query.style ? "#1a73e8" : "#f1f3f4" }}>
          <RNText style={{ fontSize: 13, color: s === query.style ? "#FFFFFF" : "#202124" }}>{s}</RNText>
        </Pressable>
      ))}
    </View>
  );
}

/** the count of parts drawn each way under a style, for the head of the page and the docs */
export function coverageCounts(style: GalleryStyle) {
  const out = { native: 0, atoms: 0, placeholder: 0 };
  for (const slug of Object.keys(PARTS)) out[coverageOf(slug, style)]++;
  return out;
}

function Sections({ query }: { query: GalleryQuery }) {
  const style = query.style;
  const counts = useMemo(() => coverageCounts(style), [style]);
  const slugs = Object.keys(PARTS).filter((s) => !query.parts || query.parts.has(s));
  const kits = query.kits ? Object.entries(TREES[style]?.kits ?? {}).filter(([s]) => !query.parts || query.parts.has(s)) : [];
  return (
    <View style={{ padding: 16, rowGap: 28 }}>
      <RNText testID="coverage" style={{ fontSize: 12, color: "#5f6368" }}>{`${counts.native} native · ${counts.atoms} via atoms · ${counts.placeholder} placeholders · ${kits.length} kits`}</RNText>
      {CATEGORIES.map((cat) => {
        const parts = slugs.filter((s) => PARTS[s].category === cat);
        const own = kits.filter(([, k]) => k.category === cat);
        if (!parts.length && !own.length) return null;
        return (
          <View key={cat} testID={`section-${cat}`} style={{ rowGap: 12 }}>
            <RNText style={{ fontSize: 16, fontWeight: "600", color: "#202124" }}>{`${cat} · ${style}${query.dark ? " · dark" : ""}`}</RNText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
              {parts.flatMap((s) => [<PartCell key={s} slug={s} style={style} />, ...(SAMPLES[s] ?? []).map((x) => <PartCell key={`${s}-${x.label}`} slug={s} style={style} props={x.props} sample={x.label} />)])}
              {own.map(([s, k]) => (
                <Cell key={s} label={s} sub={`kit ${s}/${k.variant}`} tag="kit" testID={`kit-${s}`}>
                  <TreeView node={k.tree} />
                </Cell>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** the faces a style's words are set in, fetched on the web as the editor fetches them */
function useWebFonts(theme: KitTheme) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !theme.font.google.length) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${theme.font.google.map((g) => `family=${g}`).join("&")}&display=swap`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [theme]);
}

/** on the web the page itself scrolls, so a screenshot of the whole page has every part in it */
function usePageScroll() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    for (const el of [document.documentElement, document.body, document.getElementById("root")]) if (el) Object.assign(el.style, { height: "auto", overflow: "visible" });
  }, []);
}

export function Gallery({ initial }: { initial: GalleryQuery }) {
  const [query, setQuery] = useState(initial);
  const theme = THEMES[query.style];
  useWebFonts(theme);
  usePageScroll();
  const dark = query.dark ?? theme.mode === "dark";
  const Page = Platform.OS === "web" ? View : ScrollView;
  return (
    <ThemeProvider theme={theme} dark={dark}>
      <Page testID="gallery" style={{ flex: 1, backgroundColor: "#f8f9fa" }}>
        <Chrome query={query} onStyle={(s) => setQuery((q) => ({ ...q, style: s, dark: undefined }))} />
        <Sections query={query} />
      </Page>
    </ThemeProvider>
  );
}
