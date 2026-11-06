import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LangContext, setGlobalLang, type Lang } from "@/lib/i18n";
import { ensureFontLoaded, ensureLangFontLoaded } from "@/lib/theme";
import { STYLE_GROUPS, STYLE_PACKS, cleanStyles, screenBackground, setDocStyles, styleOf, styleTextOf, type CustomStyle } from "@/lib/styles";
import { DEFAULT_THEME, PHONE_H, PHONE_W, fontFamilyOf, makeItem, normalizeTheme, paletteOf, seedOf, shapeScaleOf, type Group, type Item, type Palette, type Theme } from "@/lib/tokens";
import { useIconFamily } from "@/parts/icons";
import { CATEGORIES, PARTS, categoryName, reader, type PartCategory } from "@/parts/registry";
import { nameIn, nameOf } from "@/parts/labels";
import { FIT_OVERLAY, REMEASURE } from "@/parts/contained";
import { PartStyleSheet, PartThemeContext, PartThemeStyle, type PartTheme } from "@/parts/theme";
import { defaultMeasures, type Node } from "@/parts/templates/kit";
import { KITS, pickVariant, type KitDef, type KitLook, type KitVariant } from "@/parts/kits";
import { kitGroups, kitLookOf, treeGroups } from "@/lib/kits";
import { arrangeFlows } from "@/lib/flow";
import type { PartDef } from "@/parts/types";
import { PartView } from "./PartView";

/* Every part, drawn the way the canvas draws it (PartView, inside the style's scope, on the style's screen), each in a
 * labelled cell at the size it takes when dropped. It is for looking at one style at a time and finding what is not
 * yet that product's: /gallery?style=ios&dark=0&category=Navigation&lang=zh. scripts/style-shots.ts photographs it.
 *
 * It reads the registry, so a part added later is in it without a word here; a part whose look depends on a prop
 * (a back arrow, a large title) gets a few more cells from SAMPLES. Kits, the composites that exist only as trees of
 * atoms, are drawn in every variant as the editor adds and lays them out, the one the style picks marked with a star;
 * `kits=1` shows the kits alone (`chosen=1`: only the variant the style picks); `splits=1` each composite that splits
 * beside the atoms it splits into. */

export type GallerySearch = { style?: string; dark?: string; category?: string; lang?: string; part?: string; kits?: string; splits?: string; chosen?: string; /** custom styles as JSON: one style, a list, or a style file */ custom?: string };

/** where an earlier version of the editor kept the document it had open (lib/core/persist.ts `DOC_KEY`) */
const EDITOR_DOC_KEY = "m3e:doc";

/** Custom styles given as JSON: one style, a list, a style file, or a document with styles of its own. Each is
 *  validated as any style from outside is. */
function readStyles(text: string | null): CustomStyle[] | undefined {
  if (!text) return undefined;
  try {
    const v: unknown = JSON.parse(text);
    if (Array.isArray(v)) return cleanStyles(v);
    if (v && typeof v === "object" && Array.isArray((v as { styles?: unknown }).styles)) return cleanStyles((v as { styles: unknown[] }).styles);
    return cleanStyles([v]);
  } catch {
    return undefined;
  }
}

/** The custom styles of the project the editor last opened in this browser (lib/projects), else of the document an
 *  earlier version kept: what the gallery shows when the address carries none (`custom`). */
async function keptStyles(): Promise<CustomStyle[] | undefined> {
  try {
    const { lastProjectDoc } = await import("@/lib/projects/persist");
    const doc = await lastProjectDoc();
    if (doc) return readStyles(JSON.stringify(doc));
  } catch {}
  try {
    return readStyles(localStorage.getItem(EDITOR_DOC_KEY));
  } catch {
    return undefined;
  }
}

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

/* Kits, the composites that exist only as trees of atoms, come from the kit registry and are added the way the editor
 * adds them (lib/kits.ts `kitGroups`), for the look the style gives: the variant a style would pick is marked. */
/** the order the sections run in: the registry's categories, then any a part or kit names that the registry does not */
function sectionsOf(parts: PartDef[], kits: KitDef[]): string[] {
  const named = [...parts.map((d) => d.category), ...kits.map((k) => k.category)];
  return [...CATEGORIES.filter((c) => named.includes(c)), ...[...new Set(named)].filter((c) => !(CATEGORIES as readonly string[]).includes(c))];
}

/** what a section is called in the language the page is in; a section the registry does not know keeps its key */
const sectionName = (c: string, lang: Lang) => ((CATEGORIES as readonly string[]).includes(c) ? categoryName(c as PartCategory, lang) : c);

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

/** The page stays where the reader has it while it is being drawn. Parts drawn open bring their own scrolling with them
 *  (a command list scrolls its first row into view as it mounts, wherever on the page it stands), and that must not
 *  carry the page off to them: until the page has settled, or the reader scrolls, a scroll they did not make is undone. */
function useHeldScroll(settled: boolean) {
  useEffect(() => {
    if (settled) return;
    let mine = window.scrollY;
    let reading = false;
    const read = () => {
      reading = true;
    };
    const onScroll = () => {
      if (reading) mine = window.scrollY;
      else if (window.scrollY !== mine) window.scrollTo(window.scrollX, mine);
    };
    const kinds = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const k of kinds) window.addEventListener(k, read, { passive: true, capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      for (const k of kinds) window.removeEventListener(k, read, { capture: true });
      window.removeEventListener("scroll", onScroll);
    };
  }, [settled]);
}

/** one part, as an item fresh from the palette with these props */
function PartCell({ def, props, label, p, theme, lang, settled }: { def: PartDef; props?: Record<string, unknown>; label?: string; p: Palette; theme: Theme; lang: Lang; settled: boolean }) {
  const item = useMemo<Item>(() => ({ ...makeItem(def.slug), id: `gallery-${def.slug}-${label ?? "default"}`, props: { ...props } }), [def.slug, props, label]);
  const [ref, fit] = useFitSize(!!def.open?.fit);
  /* a menu or a popover places itself once, against where its trigger stands then: it waits for the page to settle */
  const floats = !!def.open && !def.open.fit;
  return (
    <Cell label={nameOf(def, lang)} sub={label ? `${def.slug} · ${label}` : def.slug} p={p} theme={theme}>
      <div ref={ref} data-gallery-part={def.slug} data-gallery-sample={label} style={{ position: "relative", minWidth: Math.min(def.w, 420), minHeight: Math.min(def.h, 40), ...(fit ? { width: fit.w, height: fit.h, overflow: "hidden" } : {}) }}>
        {floats && !settled ? <div style={{ width: def.open!.box(reader(def, item.props)).w, height: def.open!.box(reader(def, item.props)).h }} /> : <PartView item={item} screen={{ w: PHONE_W, h: PHONE_H }} />}
      </div>
    </Cell>
  );
}

/** A tree of atoms as the editor adds it, then laid out again by what its atoms measure once drawn, as the canvas
 *  does, until nothing moves. Faces and icons that arrive later have it measured once more. */
function TreeCell({ added, label, sub, attrs, p, theme, settled }: { added: Group[]; label: string; sub: string; attrs: Record<string, string | undefined>; p: Palette; theme: Theme; settled: boolean }) {
  const [laid, setLaid] = useState<{ from: Group[]; groups: Group[]; m: Record<string, number>; rounds: number }>({ from: added, groups: added, m: defaultMeasures(added), rounds: 0 });
  const state = laid.from === added ? laid : { from: added, groups: added, m: defaultMeasures(added), rounds: 0 };
  const els = useRef(new Map<string, HTMLElement>());
  const [again, setAgain] = useState(0);
  useEffect(() => {
    const more = () => setAgain((n) => n + 1);
    window.addEventListener(REMEASURE, more);
    return () => window.removeEventListener(REMEASURE, more);
  }, []);
  useLayoutEffect(() => {
    const m: Record<string, number> = {};
    for (const g of state.groups)
      for (const it of g.items) {
        const r = els.current.get(it.id)?.getBoundingClientRect();
        if (r) {
          m[it.id] = Math.ceil(r.width);
          m[`${it.id}:h`] = Math.ceil(r.height);
        }
      }
    const next = arrangeFlows(state.groups, m);
    const same = Object.keys(m).every((k) => m[k] === state.m[k]);
    if (next === state.groups && same && laid.from === added) return;
    if (state.rounds > 12) return;
    setLaid({ from: added, groups: next, m, rounds: state.rounds + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, settled, again]);
  /* a later measure (a face that arrived) may start the rounds afresh */
  useEffect(() => setLaid((l) => ({ ...l, rounds: 0 })), [settled, again]);
  const root = state.groups[0];
  const x0 = root?.x ?? 0;
  const y0 = root?.y ?? 0;
  const own = (it: Item, axis: "w" | "h") => {
    const v = it.component === "box" ? Number(it.props?.[axis === "w" ? "width" : "height"]) : NaN;
    return Number.isFinite(v) ? v : (state.m[axis === "w" ? it.id : `${it.id}:h`] ?? 0);
  };
  const w = Math.max(40, ...state.groups.flatMap((g) => g.items.map((it) => g.x - x0 + own(it, "w"))));
  const h = Math.max(40, ...state.groups.flatMap((g) => g.items.map((it) => g.y - y0 + own(it, "h"))));
  return (
    <Cell label={label} sub={sub} p={p} theme={theme}>
      <div {...attrs} style={{ position: "relative", width: w, height: h }}>
        {state.groups.map((g) =>
          g.items.map((it) => (
            <div
              key={it.id}
              ref={(el) => {
                if (el) els.current.set(it.id, el);
                else els.current.delete(it.id);
              }}
              style={{ position: "absolute", left: g.x - x0, top: g.y - y0, display: "inline-flex", boxSizing: "border-box" }}
            >
              <PartView item={it} screen={{ w: PHONE_W, h: PHONE_H }} />
            </div>
          )),
        )}
      </div>
    </Cell>
  );
}

/** one variant of a kit, added for the style's look; the one the style picks is starred */
function KitCell({ kit, variant, look, chosen, p, theme, lang, settled }: { kit: KitDef; variant: KitVariant; look: KitLook; chosen: boolean; p: Palette; theme: Theme; lang: Lang; settled: boolean }) {
  const added = useMemo<Group[]>(() => {
    try {
      return kitGroups(kit, look, lang, { variant: variant.key });
    } catch {
      return [];
    }
  }, [kit, variant.key, look, lang]);
  return <TreeCell added={added} label={`${nameIn(kit, lang)} · ${nameIn(variant, lang)}${chosen ? " ★" : ""}`} sub={`kit ${kit.slug}/${variant.key}`} attrs={{ "data-gallery-kit": `${kit.slug}/${variant.key}`, "data-gallery-kit-chosen": chosen ? "" : undefined }} p={p} theme={theme} settled={settled} />;
}

/** what a composite splits into, at its default props: drawn beside the part (`splits=1`) to see that it is the same */
function SplitCell({ def, p, theme, lang, settled }: { def: PartDef; p: Palette; theme: Theme; lang: Lang; settled: boolean }) {
  const added = useMemo<Group[]>(() => {
    try {
      /* split as the style composes the part, so the two can be compared under it */
      return treeGroups(def.atoms!(reader(def, makeItem(def.slug).props), kitLookOf(theme)) as Node, lang);
    } catch {
      return [];
    }
  }, [def, lang, theme]);
  return <TreeCell added={added} label={`${nameOf(def, lang)} · atoms`} sub={`split ${def.slug}`} attrs={{ "data-gallery-split": def.slug }} p={p} theme={theme} settled={settled} />;
}

const CHROME = { font: "13px/18px Roboto, system-ui, sans-serif", color: "#202124" } as const;
const link = (search: GallerySearch, patch: Partial<GallerySearch>) => {
  const next = { ...search, ...patch };
  const q = Object.entries(next).filter(([, v]) => v !== undefined && v !== "");
  return `?${q.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`;
};

/** the bar along the top: which style, which mode, which section. Plain links, so a screenshot script can go anywhere by its address. */
function Chrome({ search, sections, lang, customs }: { search: GallerySearch; sections: string[]; lang: Lang; /** the custom styles in reach */ customs?: CustomStyle[] }) {
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
        {!!customs?.length && (
          <>
            <span style={{ color: "#9aa0a6", margin: "0 4px" }}>·</span>
            {customs.map((s) => (
              <a key={s.key} data-gallery-custom={s.key} href={link(search, { style: s.key })} style={pill(search.style === s.key)} title={styleTextOf(s.hint, lang)}>
                {styleTextOf(s.name, lang)}
              </a>
            ))}
          </>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        <a href={link(search, { dark: search.dark === "1" ? "0" : "1" })} style={pill(false)}>
          {search.dark === "1" ? "dark" : search.dark === "0" ? "light" : "style's own mode"}
        </a>
        <a href={link(search, { category: undefined })} style={pill(!search.category)}>
          all
        </a>
        {sections.map((c) => (
          <a key={c} href={link(search, { category: c })} style={pill(search.category === c)} title={c}>
            {sectionName(c, lang)}
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
  /* a custom style is put in reach before anything reads the style by its key: the address's, or those of the
     project last opened, once they have been read */
  const [kept, setKept] = useState<CustomStyle[] | undefined>(undefined);
  useEffect(() => {
    if (search.custom) return;
    let live = true;
    void keptStyles().then((s) => live && setKept(s));
    return () => {
      live = false;
    };
  }, [search.custom]);
  const customs = useMemo(() => (search.custom ? readStyles(search.custom) : kept), [search.custom, kept]);
  setDocStyles(customs);
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
  useHeldScroll(settled);
  const only = search.part ? new Set(search.part.split(",")) : null;
  /* `splits=1`: each composite that splits beside the atoms it splits into, and nothing else */
  const splits = search.splits === "1";
  const parts = search.kits === "1" ? [] : PARTS.filter((d) => (!only || only.has(d.slug)) && (!splits || !!d.atoms));
  const look = useMemo(() => kitLookOf(theme), [theme]);
  const kits = splits ? [] : only ? KITS.filter((k) => only.has(k.slug)) : KITS;
  const sections = sectionsOf(PARTS, KITS);
  const shown = sectionsOf(parts, kits).filter((c) => !search.category || c === search.category);

  return (
    <LangContext.Provider value={lang}>
      <PartThemeContext.Provider value={partTheme}>
        <PartThemeStyle seed={partTheme.seed} contrast={partTheme.contrast} />
        <PartStyleSheet theme={theme} />
        <div data-gallery data-gallery-settled={settled ? "" : undefined} data-gallery-style={search.style || "android"} data-gallery-dark={theme.dark ? "1" : "0"} style={{ minHeight: "100vh", background: "#f8f9fa" }}>
          <Chrome search={search} sections={sections} lang={lang} customs={customs} />
          <main style={{ padding: 16, display: "flex", flexDirection: "column", gap: 28, fontFamily: fontFamilyOf(theme.font, lang) }}>
            {shown.map((c) => (
              <section key={c} data-gallery-category={c} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h2 style={{ ...CHROME, margin: 0, fontSize: 16, fontWeight: 600 }}>
                  {sectionName(c, lang)} <span style={{ color: "#5f6368", fontWeight: 400 }}>· {pack ? styleTextOf(pack.name, lang) : "Android"}{theme.dark ? " · dark" : ""}</span>
                </h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                  {parts
                    .filter((d) => d.category === c)
                    .flatMap((d) => [
                      <PartCell key={d.slug} def={d} p={p} theme={theme} lang={lang} settled={settled} />,
                      ...(splits && d.atoms ? [<SplitCell key={`${d.slug}-atoms`} def={d} p={p} theme={theme} lang={lang} settled={settled} />] : []),
                      ...(splits ? [] : (SAMPLES[d.slug] ?? [])).map((s) => <PartCell key={`${d.slug}-${s.label}`} def={d} props={s.props} label={s.label} p={p} theme={theme} lang={lang} settled={settled} />),
                    ])}
                  {kits
                    .filter((k) => k.category === c)
                    .flatMap((k) => {
                      const chosen = pickVariant(k, look).key;
                      return k.variants.filter((v) => search.chosen !== "1" || v.key === chosen).map((v) => <KitCell key={`${k.slug}-${v.key}`} kit={k} variant={v} look={look} chosen={v.key === chosen} p={p} theme={theme} lang={lang} settled={settled} />);
                    })}
                </div>
              </section>
            ))}
          </main>
        </div>
      </PartThemeContext.Provider>
    </LangContext.Provider>
  );
}
