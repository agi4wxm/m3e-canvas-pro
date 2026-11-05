import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LangContext, setGlobalLang, type Lang } from "@/lib/i18n";
import { ensureFontLoaded, ensureLangFontLoaded } from "@/lib/theme";
import { kitLookOf } from "@/lib/kits";
import { STYLE_GROUPS, STYLE_PACKS, screenBackground, styleOf, styleTextOf } from "@/lib/styles";
import { DEFAULT_THEME, PHONE_H, PHONE_W, fontFamilyOf, makeItem, normalizeTheme, paletteOf, seedOf, shapeScaleOf, type Group, type Item, type Palette, type Theme } from "@/lib/tokens";
import { useIconFamily } from "@/parts/icons";
import { CATEGORIES, PARTS, reader } from "@/parts/registry";
import { FIT_OVERLAY, REMEASURE } from "@/parts/contained";
import { PartStyleSheet, PartThemeContext, PartThemeStyle, type PartTheme } from "@/parts/theme";
import { arranged, defaultMeasures, inLang, seedGroups, type Node } from "@/parts/templates/kit";
import type { PartDef } from "@/parts/types";
import { PartView } from "./PartView";

/* Every part, drawn the way the canvas draws it (PartView, inside the style's scope, on the style's screen), each in a
 * labelled cell at the size it takes when dropped. It is for looking at one style at a time and finding what is not
 * yet that product's: /gallery?style=ios&dark=0&category=Navigation&lang=zh. scripts/style-shots.ts photographs it.
 *
 * It reads the registry, so a part added later is in it without a word here; a part whose look depends on a prop
 * (a back arrow, a large title) gets a few more cells from SAMPLES. Kits, the composites that exist only as trees of
 * atoms, are found by their files (parts/kits/*.ts) and drawn as the canvas would lay them out. */

export type GallerySearch = { style?: string; dark?: string; category?: string; lang?: string; part?: string };

/** more cells for the parts whose composition a style changes with a prop: what the default alone would not show */
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

/** a kit as its file exports it: only what drawing it needs (parts/kits defines the rest) */
type KitLike = { slug: string; name: string; labels?: Partial<Record<Lang, string>>; category: string; variants: { key: string; name: string; labels?: Partial<Record<Lang, string>>; build: (look?: ReturnType<typeof kitLookOf>) => Node }[] };
const isKit = (v: unknown): v is KitLike => typeof v === "object" && v !== null && typeof (v as KitLike).slug === "string" && Array.isArray((v as KitLike).variants) && (v as KitLike).variants.every((x) => typeof x?.build === "function");

/* The hook for kits: any file under parts/kits that exports a kit, or a list of them, is drawn here. Nothing to
 * register; with no such files the gallery is the parts alone. */
/* a test file is left out of the glob itself: importing one runs its hooks, which need the test runner */
const KIT_MODULES = import.meta.glob(["/parts/kits/*.ts", "!/parts/kits/*.test.ts"], { eager: true }) as Record<string, Record<string, unknown>>;
const KITS: KitLike[] = Object.entries(KIT_MODULES)
  .filter(([path]) => !/\.test\.ts$/.test(path))
  .flatMap(([, mod]) => Object.values(mod).flatMap((v) => (Array.isArray(v) ? v.filter(isKit) : isKit(v) ? [v] : [])))
  .filter((k, i, all) => all.findIndex((x) => x.slug === k.slug) === i);

/** the order the sections run in: the registry's categories, then any a part or kit names that the registry does not */
function sectionsOf(parts: PartDef[], kits: KitLike[]): string[] {
  const named = [...parts.map((d) => d.category), ...kits.map((k) => k.category)];
  return [...CATEGORIES.filter((c) => named.includes(c)), ...[...new Set(named)].filter((c) => !(CATEGORIES as readonly string[]).includes(c))];
}

const nameIn = (d: { name: string; labels?: Partial<Record<Lang, string>> }, lang: Lang) => (lang === "en" ? d.name : (d.labels?.[lang] ?? d.name));

function Cell({ label, sub, p, theme, children }: { label: string; sub?: string; p: Palette; theme: Theme; children: ReactNode }) {
  return (
    <figure data-gallery-cell style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <figcaption style={{ font: "500 12px/16px Roboto, system-ui, sans-serif", color: "#5f6368", display: "flex", gap: 6, alignItems: "baseline" }}>
        <span style={{ color: "#202124" }}>{label}</span>
        {sub && <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{sub}</span>}
      </figcaption>
      {/* the part stands on its style's screen, as it would on the canvas, in the words' color the editor gives the page */}
      <div style={{ background: screenBackground(p.surface, theme), color: p.onSurface, padding: 16, borderRadius: 12, outline: "1px solid rgb(0 0 0 / 0.08)", width: "fit-content", maxWidth: "100%", overflow: "hidden" }}>{children}</div>
    </figure>
  );
}

/** The size of the overlay a `fit` part floats in its box, as the canvas measures it: the part is the dialog, not the
 *  screen-sized box it opens in. Undefined for every other part, which is as large as it draws. */
function useFitSize(fit: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!fit) return;
    const measure = () => {
      const r = ref.current?.querySelector(FIT_OVERLAY)?.getBoundingClientRect();
      if (r && r.width && r.height) setSize((s) => (s && s.w === Math.round(r.width) && s.h === Math.round(r.height) ? s : { w: Math.round(r.width), h: Math.round(r.height) }));
    };
    measure();
    window.addEventListener(REMEASURE, measure);
    const late = setTimeout(measure, 800);
    return () => {
      window.removeEventListener(REMEASURE, measure);
      clearTimeout(late);
    };
  }, [fit]);
  return [ref, size] as const;
}

/** whether the page has stopped moving: faces and icons have arrived, and every cell stands where it will stay */
function useSettled() {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let gone = false;
    void document.fonts.ready.then(() => setTimeout(() => !gone && setSettled(true), 900));
    return () => {
      gone = true;
    };
  }, []);
  return settled;
}

/** one part, as an item fresh from the palette with these props */
function PartCell({ def, props, label, p, theme, lang, settled }: { def: PartDef; props?: Record<string, unknown>; label?: string; p: Palette; theme: Theme; lang: Lang; settled: boolean }) {
  const item = useMemo<Item>(() => ({ ...makeItem(def.slug), id: `gallery-${def.slug}-${label ?? "default"}`, props: { ...props } }), [def.slug, props, label]);
  const [ref, fit] = useFitSize(!!def.open?.fit);
  /* a menu or a popover places itself once, against where its trigger stands then: it waits for the page to settle */
  const floats = !!def.open && !def.open.fit;
  return (
    <Cell label={nameIn(def, lang)} sub={label ? `${def.slug} · ${label}` : def.slug} p={p} theme={theme}>
      <div ref={ref} data-gallery-part={def.slug} data-gallery-sample={label} style={{ position: "relative", minWidth: Math.min(def.w, 420), minHeight: Math.min(def.h, 40), ...(fit ? { width: fit.w, height: fit.h, overflow: "hidden" } : {}) }}>
        {floats && !settled ? <div style={{ width: def.open!.box(reader(def, item.props)).w, height: def.open!.box(reader(def, item.props)).h }} /> : <PartView item={item} screen={{ w: PHONE_W, h: PHONE_H }} />}
      </div>
    </Cell>
  );
}

/** one variant of a kit: its tree laid out as a dropped kit is, before anything has been measured */
function KitCell({ kit, variant, p, theme, lang }: { kit: KitLike; variant: KitLike["variants"][number]; p: Palette; theme: Theme; lang: Lang }) {
  const groups = useMemo<Group[]>(() => {
    try {
      const seeded = seedGroups({ id: `kit-${kit.slug}-${variant.key}`, name: { en: "", zh: "", ja: "", ko: "" }, frame: "phone", roots: [variant.build(kitLookOf(theme))] });
      const local = seeded.map((g) => ({ ...g, name: undefined, items: g.items.map((it) => ({ ...it, props: inLang(it.props, lang), note: undefined })) })) as unknown as Group[];
      return arranged(local);
    } catch {
      return [];
    }
  }, [kit.slug, variant, lang, theme]);
  const m = defaultMeasures(groups);
  const x0 = Math.min(0, ...groups.map((g) => g.x));
  const y0 = Math.min(0, ...groups.map((g) => g.y));
  const w = Math.max(40, ...groups.flatMap((g) => g.items.map((it) => g.x - x0 + (m[it.id] ?? 0))));
  const h = Math.max(40, ...groups.flatMap((g) => g.items.map((it) => g.y - y0 + (m[`${it.id}:h`] ?? 0))));
  return (
    <Cell label={`${nameIn(kit, lang)} · ${nameIn(variant, lang)}`} sub={`kit ${kit.slug}/${variant.key}`} p={p} theme={theme}>
      <div data-gallery-kit={`${kit.slug}/${variant.key}`} style={{ position: "relative", width: w, height: h }}>
        {groups.map((g) =>
          g.items.map((it) => (
            <div key={it.id} style={{ position: "absolute", left: g.x - x0, top: g.y - y0, width: m[it.id], height: m[`${it.id}:h`] }}>
              <PartView item={it} screen={{ w: PHONE_W, h: PHONE_H }} />
            </div>
          )),
        )}
      </div>
    </Cell>
  );
}

const CHROME = { font: "13px/18px Roboto, system-ui, sans-serif", color: "#202124" } as const;
const link = (search: GallerySearch, patch: Partial<GallerySearch>) => {
  const next = { ...search, ...patch };
  const q = Object.entries(next).filter(([, v]) => v !== undefined && v !== "");
  return `?${q.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`;
};

/** the bar along the top: which style, which mode, which section. Plain links, so a screenshot script can go anywhere by its address. */
function Chrome({ search, sections, lang }: { search: GallerySearch; sections: string[]; lang: Lang }) {
  const pill = (on: boolean) => ({ padding: "2px 8px", borderRadius: 999, textDecoration: "none", color: on ? "#fff" : "#202124", background: on ? "#1a73e8" : "#f1f3f4", whiteSpace: "nowrap" as const });
  return (
    <header data-gallery-chrome style={{ ...CHROME, display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", borderBottom: "1px solid #dadce0", background: "#fff" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        <strong style={{ marginRight: 8 }}>Style gallery</strong>
        <a href={link(search, { style: undefined })} style={pill(!search.style)}>
          Android
        </a>
        {STYLE_GROUPS.map((g) => (
          <Fragment key={g}>
            <span style={{ color: "#9aa0a6", margin: "0 4px" }}>·</span>
            {STYLE_PACKS.filter((s) => s.group === g).map((s) => (
              <a key={s.key} href={link(search, { style: s.key })} style={pill(search.style === s.key)} title={styleTextOf(s.hint, lang)}>
                {s.key}
              </a>
            ))}
          </Fragment>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        <a href={link(search, { dark: search.dark === "1" ? "0" : "1" })} style={pill(false)}>
          {search.dark === "1" ? "dark" : search.dark === "0" ? "light" : "style's own mode"}
        </a>
        <a href={link(search, { category: undefined })} style={pill(!search.category)}>
          all
        </a>
        {sections.map((c) => (
          <a key={c} href={link(search, { category: c })} style={pill(search.category === c)}>
            {c}
          </a>
        ))}
      </div>
    </header>
  );
}

export function Gallery({ search }: { search: GallerySearch }) {
  const lang: Lang = search.lang === "en" || search.lang === "ja" || search.lang === "ko" ? search.lang : "zh";
  /* the words a part says by itself are read from the global language; set it before anything is drawn */
  setGlobalLang(lang);
  const pack = styleOf(search.style);
  /* a style opens in its own mode unless the address says which */
  const theme = useMemo<Theme>(() => {
    const t = normalizeTheme(pack ? { style: pack.key } : DEFAULT_THEME);
    return search.dark === "1" ? { ...t, dark: true } : search.dark === "0" ? { ...t, dark: false } : t;
  }, [pack, search.dark]);
  const p = useMemo(() => paletteOf("purple", null, theme), [theme]);
  const partTheme = useMemo<PartTheme>(() => ({ seed: seedOf("purple", null, theme), dark: theme.dark, contrast: theme.contrast, shape: shapeScaleOf(theme.shape) }), [theme]);
  useIconFamily(theme.icons ?? "rounded");
  const [, faces] = useState(0);
  useEffect(() => {
    const redraw = () => faces((n) => n + 1);
    ensureLangFontLoaded(lang, redraw);
    ensureFontLoaded(theme.font, redraw, lang);
    if (theme.displayFont) ensureFontLoaded(theme.displayFont, redraw, lang);
    document.documentElement.lang = lang;
    document.title = `Gallery · ${search.style || "android"}${theme.dark ? " · dark" : ""}`;
    /* menus and popovers place themselves once, against where their trigger stood then; the cells around them move
       as faces and icons arrive, so they are asked to place themselves again once the page has settled */
    const settle = [600, 1500].map((ms) => setTimeout(() => window.dispatchEvent(new Event("resize")), ms));
    return () => settle.forEach(clearTimeout);
  }, [theme.font, theme.displayFont, lang, search.style, theme.dark]);

  const settled = useSettled();
  const only = search.part ? new Set(search.part.split(",")) : null;
  const parts = PARTS.filter((d) => !only || only.has(d.slug));
  const kits = only ? KITS.filter((k) => only.has(k.slug)) : KITS;
  const sections = sectionsOf(PARTS, KITS);
  const shown = sectionsOf(parts, kits).filter((c) => !search.category || c === search.category);

  return (
    <LangContext.Provider value={lang}>
      <PartThemeContext.Provider value={partTheme}>
        <PartThemeStyle seed={partTheme.seed} contrast={partTheme.contrast} />
        <PartStyleSheet theme={theme} />
        <div data-gallery data-gallery-settled={settled ? "" : undefined} data-gallery-style={search.style || "android"} data-gallery-dark={theme.dark ? "1" : "0"} style={{ minHeight: "100vh", background: "#f8f9fa" }}>
          <Chrome search={search} sections={sections} lang={lang} />
          <main style={{ padding: 16, display: "flex", flexDirection: "column", gap: 28, fontFamily: fontFamilyOf(theme.font, lang) }}>
            {shown.map((c) => (
              <section key={c} data-gallery-category={c} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h2 style={{ ...CHROME, margin: 0, fontSize: 16, fontWeight: 600 }}>
                  {c} <span style={{ color: "#5f6368", fontWeight: 400 }}>· {pack ? styleTextOf(pack.name, lang) : "Android"}{theme.dark ? " · dark" : ""}</span>
                </h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                  {parts
                    .filter((d) => d.category === c)
                    .flatMap((d) => [
                      <PartCell key={d.slug} def={d} p={p} theme={theme} lang={lang} settled={settled} />,
                      ...(SAMPLES[d.slug] ?? []).map((s) => <PartCell key={`${d.slug}-${s.label}`} def={d} props={s.props} label={s.label} p={p} theme={theme} lang={lang} settled={settled} />),
                    ])}
                  {kits
                    .filter((k) => k.category === c)
                    .flatMap((k) => k.variants.map((v) => <KitCell key={`${k.slug}-${v.key}`} kit={k} variant={v} p={p} theme={theme} lang={lang} />))}
                </div>
              </section>
            ))}
          </main>
        </div>
      </PartThemeContext.Provider>
    </LangContext.Provider>
  );
}
