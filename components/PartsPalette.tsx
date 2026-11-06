import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Palette } from "@/lib/tokens";
import { kitGroups } from "@/lib/kits";
import { CATEGORY_ICON, CATEGORY_TEXT, PARTS, categoriesOf, partBySlug, type PartCategory, type PartTier } from "@/parts/registry";
import { KITS, kitBySlug, kitKey, kitOfKey, pickVariant, type KitDef, type KitLook } from "@/parts/kits";
import { fetchNow, modulesOfGroups, modulesOfPart, usePrefetchInView } from "@/parts/prefetch";
import { nameIn, nameOf } from "@/parts/labels";
import { searchTerms } from "@/parts/keywords";
import type { PartDef } from "@/parts/types";
import { Icon } from "./Icon";
import { LANGS, t, useLang, type Lang } from "@/lib/i18n";
import { Field, Section, Segmented, Tile, useDismiss } from "./ui";

/* The palette lists every part by what it is for, under the names it has in the docs where it has any.
 * Two tiers: the atoms everything is composed of, and the composites, ready-made. A kit stands among
 * the composites of its kind, marked as made of atoms; its variants open from that mark. A sealed composite
 * that can be split into atoms says so too. */

const TIER_KEY = "m3e:palette-tier";

/** the small mark at a tile's corner */
const MARK: React.CSSProperties = { position: "absolute", top: 6, left: 6, height: 16, padding: "0 5px", borderRadius: 6, fontSize: 9, fontWeight: 700, lineHeight: "16px", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 2 };

/** what a section is called in every language, so a search for "表单" or "Forms" finds what is in it */
const categoryWords = (c: string) => Object.values(CATEGORY_TEXT[c as PartCategory] ?? {});

/** every word a part or a kit is known by, in every language, with its slug's words and its section's names */
const wordsOfPart = (d: PartDef) => [d.slug, d.slug.replace(/-/g, " "), d.name, ...LANGS.map((l) => nameOf(d, l.key)), ...categoryWords(d.category)].join("\n").toLowerCase();
const wordsOfKit = (k: KitDef) => [k.slug, k.slug.replace(/-/g, " "), k.name, ...Object.values(k.labels), ...k.variants.flatMap((v) => [v.name, ...Object.values(v.labels)]), ...categoryWords(k.category)].join("\n").toLowerCase();
const WORDS = new Map<string, string>([...PARTS.map((d) => [d.slug, wordsOfPart(d)] as const), ...KITS.map((k) => [kitKey(k.slug), wordsOfKit(k)] as const)]);

/** the modules what a tile adds is drawn with: a part as it comes from the palette, a kit as the style composes it */
function modulesOfTile(el: Element, look: KitLook, lang: Lang): readonly string[] {
  const slug = el.getAttribute("data-tile");
  if (slug) return modulesOfPart(slug);
  const kit = kitBySlug(el.getAttribute("data-kit") ?? "");
  if (!kit) return [];
  try {
    return modulesOfGroups(kitGroups(kit, look, lang));
  } catch {
    return [];
  }
}

/** What the tiles in view add is fetched while the page is idle, and what a pointer rests on at once: a part carried out
 *  of the palette is then drawn as it lands, not held by a stand-in. Returns the handler for the pointer. */
function usePrefetchTiles(scroller: RefObject<HTMLDivElement | null>, look: KitLook, lang: Lang) {
  /* a kit is composed to find out: once per tile and look is enough. The look comes afresh with every render of the
   * editor, so it is told apart by what it says */
  const lookKey = JSON.stringify(look);
  const keysOf = useMemo(() => {
    const known = new Map<string, readonly string[]>();
    const fixed = JSON.parse(lookKey) as KitLook;
    return (el: Element) => {
      const id = `${el.getAttribute("data-tile") ?? ""}|${el.getAttribute("data-kit") ?? ""}`;
      let keys = known.get(id);
      if (!keys) known.set(id, (keys = modulesOfTile(el, fixed, lang)));
      return keys;
    };
  }, [lookKey, lang]);
  usePrefetchInView(scroller, "[data-tile], [data-kit]", keysOf);
  return (e: React.PointerEvent) => {
    const tile = (e.target as Element).closest?.("[data-tile], [data-kit]");
    if (tile) fetchNow(keysOf(tile));
  };
}

export function PartsPalette({
  palette: p,
  favorites,
  onToggleFavorite,
  onPartPointerDown,
  onPartActivate,
  onKitPointerDown,
  onKitActivate,
  kitLook,
}: {
  palette: Palette;
  /** the starred parts' slugs, and the starred kits' `kit:` keys */
  favorites: string[];
  onToggleFavorite: (key: string) => void;
  /** a part picked up to be carried onto the canvas; without it (the phone's sheet) a tap adds it */
  onPartPointerDown?: (e: React.PointerEvent, slug: string) => void;
  /** a tile chosen with the keyboard or a screen reader adds its part without a drag */
  onPartActivate: (slug: string) => void;
  /** a kit picked up: it is carried like a part and lands as its tree of atoms */
  onKitPointerDown?: (e: React.PointerEvent, slug: string, variant?: string) => void;
  onKitActivate: (slug: string, variant?: string) => void;
  /** what the document's style is like: it picks the variant a kit lands as */
  kitLook: KitLook;
}) {
  const lang = useLang();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<PartTier>("composite");
  const scroller = useRef<HTMLDivElement | null>(null);
  const onTilePointer = usePrefetchTiles(scroller, kitLook, lang);
  useEffect(() => {
    try {
      const v = localStorage.getItem(TIER_KEY);
      if (v === "atom" || v === "composite") setTier(v);
    } catch {}
  }, []);
  const pickTier = (next: PartTier) => {
    setTier(next);
    try {
      localStorage.setItem(TIER_KEY, next);
    } catch {}
  };

  const found = useMemo(() => {
    const terms = searchTerms(q);
    if (!terms.length) return null;
    /* what is called what was typed comes first, then what is called something it means */
    const rank = (key: string) => {
      const words = WORDS.get(key) ?? "";
      return words.includes(terms[0]) ? 0 : terms.some((w) => words.includes(w)) ? 1 : 2;
    };
    const keep = <T,>(list: T[], key: (x: T) => string) => list.map((x) => ({ x, r: rank(key(x)) })).filter((e) => e.r < 2).sort((a, b) => a.r - b.r).map((e) => e.x);
    return { parts: keep(PARTS, (d) => d.slug), kits: keep(KITS, (k) => kitKey(k.slug)) };
  }, [q]);

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))",
    gap: 6,
  };

  const partTile = (slug: string) => {
    const d = partBySlug(slug);
    if (!d) return null;
    const tile = (
      <Tile
        key={slug}
        part={slug}
        icon={d.icon}
        label={nameOf(d, lang)}
        p={p}
        onPointerDown={onPartPointerDown && ((e) => onPartPointerDown(e, slug))}
        onClick={() => onPartActivate(slug)}
        starred={favorites.includes(slug)}
        onStar={() => onToggleFavorite(slug)}
      />
    );
    /* a sealed composite that splits into atoms in the inspector says so at its corner */
    if (!d.atoms) return tile;
    return (
      <div key={slug} data-part-splits={slug} style={{ position: "relative" }}>
        {tile}
        <span title={t("splitMarkHint", lang)} style={{ ...MARK, background: p.surfaceContainerHighest, color: p.onSurfaceVariant, pointerEvents: "none" }}>
          <Icon name="call_split" size={10} />
          {t("splitMark", lang)}
        </span>
      </div>
    );
  };

  const kitTile = (k: KitDef) => (
    <KitTile
      key={kitKey(k.slug)}
      kit={k}
      lang={lang}
      p={p}
      look={kitLook}
      starred={favorites.includes(kitKey(k.slug))}
      onStar={() => onToggleFavorite(kitKey(k.slug))}
      onPointerDown={onKitPointerDown && ((e, variant) => onKitPointerDown(e, k.slug, variant))}
      onActivate={(variant) => onKitActivate(k.slug, variant)}
    />
  );

  const favorite = (key: string) => {
    const kit = kitOfKey(key);
    return kit ? kitTile(kit) : partTile(key);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "12px 12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
        <Field value={q} onChange={setQ} placeholder={t("search", lang)} p={p} icon="search" height={40} />
        {!q && (
          <Segmented<PartTier>
            options={[
              { key: "atom", icon: "category", label: t("tierAtoms", lang) },
              { key: "composite", icon: "dashboard_customize", label: t("tierComposites", lang) },
            ]}
            value={tier}
            onChange={pickTier}
            p={p}
            height={36}
            label={t("tierPick", lang)}
          />
        )}
      </div>

      <div ref={scroller} onPointerOver={onTilePointer} className="no-scrollbar" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 8px" }}>
        {!q && favorites.length > 0 && (
          <Section id="fav" icon="star" title={t("favorites", lang)} p={p}>
            <div style={grid}>{favorites.map(favorite)}</div>
          </Section>
        )}
        {found ? (
          <div style={{ ...grid, padding: "4px 4px 12px" }}>
            {found.parts.map((d) => partTile(d.slug))}
            {found.kits.map(kitTile)}
            {found.parts.length + found.kits.length === 0 && (
              <div role="status" style={{ gridColumn: "1 / -1", color: p.outline, fontSize: 13, padding: 12, textAlign: "center", display: "grid", placeItems: "center", gap: 6 }}>
                <Icon name="search_off" size={28} />
                <span>{t("noMatch", lang)}</span>
              </div>
            )}
          </div>
        ) : (
          categoriesOf(tier).map((c: PartCategory) => {
            const parts = PARTS.filter((d) => d.category === c);
            const kits = KITS.filter((k) => k.category === c);
            if (parts.length + kits.length === 0) return null;
            return (
              <Section key={c} id={`cat:${c}`} icon={CATEGORY_ICON[c]} title={CATEGORY_TEXT[c][lang]} p={p}>
                <div style={grid}>
                  {kits.map(kitTile)}
                  {parts.map((d) => partTile(d.slug))}
                </div>
              </Section>
            );
          })
        )}
      </div>
    </div>
  );
}

/** A kit's tile: a part's tile with a mark saying it lands as atoms, and a menu of its variants. The
 *  tile itself adds the variant that suits the style; a variant picked from the menu is added as that one. */
function KitTile({
  kit,
  lang,
  p,
  look,
  starred,
  onStar,
  onPointerDown,
  onActivate,
}: {
  kit: KitDef;
  lang: Lang;
  p: Palette;
  look: KitLook;
  starred: boolean;
  onStar: () => void;
  /** absent where a tap adds it (the phone's sheet) */
  onPointerDown?: (e: React.PointerEvent, variant?: string) => void;
  onActivate: (variant?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  /* the menu opens toward the side of the panel that has room for it */
  const [toLeft, setToLeft] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useDismiss(open, () => setOpen(false), [box]);
  const toggle = () => {
    const r = box.current?.getBoundingClientRect();
    const host = box.current?.closest(".no-scrollbar")?.getBoundingClientRect();
    if (r && host) setToLeft(r.left + 208 > host.right);
    setOpen((v) => !v);
  };
  const suited = pickVariant(kit, look);
  const many = kit.variants.length > 1;
  return (
    <div ref={box} data-kit={kit.slug} style={{ position: "relative" }}>
      <Tile icon={kit.icon} label={nameIn(kit, lang)} p={p} onPointerDown={onPointerDown && ((e) => onPointerDown(e))} onClick={() => onActivate()} starred={starred} onStar={onStar} />
      {/* the mark that it is made of atoms; with variants to choose from, it is also what opens them */}
      {many ? (
        <button
          type="button"
          className="m3-press"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${t("kitMarkHint", lang)}. ${t("kitOpenVariants", lang)}`}
          title={`${t("kitMarkHint", lang)}\n${t("kitOpenVariants", lang)}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          style={{ ...MARK, gap: 1, paddingRight: 2, border: "none", cursor: "pointer", outlineColor: p.primary, background: open ? p.primary : p.secondaryContainer, color: open ? p.onPrimary : p.onSecondaryContainer }}
        >
          <Icon name="stacks" size={10} />
          {t("kitMark", lang)}
          <Icon name="expand_more" size={12} />
        </button>
      ) : (
        <span aria-hidden title={t("kitMarkHint", lang)} style={{ ...MARK, background: p.secondaryContainer, color: p.onSecondaryContainer, pointerEvents: "none" }}>
          <Icon name="stacks" size={10} />
          {t("kitMark", lang)}
        </span>
      )}
      {open && (
        <div
          role="menu"
          aria-label={t("kitVariants", lang)}
          style={{ position: "absolute", zIndex: 20, top: "100%", ...(toLeft ? { right: 0 } : { left: 0 }), marginTop: 4, minWidth: 200, padding: 6, borderRadius: 14, background: p.surfaceContainerHigh, color: p.onSurface, boxShadow: "0 6px 20px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 2 }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: p.onSurfaceVariant, padding: "4px 8px 6px" }}>{t("kitVariants", lang)}</div>
          {kit.variants.map((v) => (
            <button
              key={v.key}
              type="button"
              role="menuitem"
              className="m3-press"
              data-kit-variant={v.key}
              onPointerDown={
                onPointerDown &&
                ((e) => {
                  setOpen(false);
                  onPointerDown(e, v.key);
                })
              }
              onClick={(e) => {
                /* a press has already been handled; only a click without a pointer adds it here */
                if (e.detail === 0 || !onPointerDown) {
                  setOpen(false);
                  onActivate(v.key);
                }
              }}
              style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "6px 8px", border: "none", borderRadius: 10, background: v.key === suited.key ? p.secondaryContainer : "transparent", color: v.key === suited.key ? p.onSecondaryContainer : p.onSurface, font: "inherit", fontSize: 13, textAlign: "left", cursor: onPointerDown ? "grab" : "pointer", touchAction: onPointerDown ? "none" : undefined }}
            >
              <span style={{ flex: 1 }}>{nameIn(v, lang)}</span>
              {v.key === suited.key && v.suits && <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{t("kitSuits", lang)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
