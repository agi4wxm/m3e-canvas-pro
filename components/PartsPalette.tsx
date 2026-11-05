import { useEffect, useMemo, useRef, useState } from "react";
import { Palette } from "@/lib/tokens";
import { CATEGORY_ICON, CATEGORY_TEXT, PARTS, categoriesOf, partBySlug, type PartCategory, type PartTier } from "@/parts/registry";
import { KITS, kitKey, kitOfKey, pickVariant, type KitDef, type KitLook } from "@/parts/kits";
import { nameOf } from "@/parts/labels";
import type { PartDef } from "@/parts/types";
import { Icon } from "./Icon";
import { LANGS, t, useLang, type Lang } from "@/lib/i18n";
import { Field, Section, Segmented, Tile, useDismiss } from "./ui";

/* The palette lists every part by what it is for, under the names it has in the docs where it has any.
 * Two tiers: the atoms everything is composed of, and the composites, ready-made. A kit stands among
 * the composites of its kind, marked as one that lands as atoms; its variants open from the tile. */

const TIER_KEY = "m3e:palette-tier";

/** the small mark at a kit tile's corner */
const MARK: React.CSSProperties = { position: "absolute", top: 6, left: 6, height: 16, padding: "0 5px", borderRadius: 6, fontSize: 9, fontWeight: 700, lineHeight: "16px", fontFamily: "inherit" };

const kitName = (k: KitDef, lang: Lang) => (lang === "en" ? k.name : (k.labels[lang] ?? k.name));

/** every word a part or a kit is known by, in every language, to search them all at once */
const wordsOfPart = (d: PartDef) => [d.slug, d.name, ...LANGS.map((l) => nameOf(d, l.key))].join("\n").toLowerCase();
const wordsOfKit = (k: KitDef) => [k.slug, k.name, ...Object.values(k.labels), ...k.variants.flatMap((v) => [v.name, ...Object.values(v.labels)])].join("\n").toLowerCase();

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
  onPartPointerDown: (e: React.PointerEvent, slug: string) => void;
  /** a tile chosen with the keyboard or a screen reader adds its part without a drag */
  onPartActivate: (slug: string) => void;
  /** a kit picked up: it is carried like a part and lands as its tree of atoms */
  onKitPointerDown: (e: React.PointerEvent, slug: string, variant?: string) => void;
  onKitActivate: (slug: string, variant?: string) => void;
  /** what the document's style is like: it picks the variant a kit lands as */
  kitLook: KitLook;
}) {
  const lang = useLang();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<PartTier>("composite");
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
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return { parts: PARTS.filter((d) => wordsOfPart(d).includes(s)), kits: KITS.filter((k) => wordsOfKit(k).includes(s)) };
  }, [q]);

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))",
    gap: 6,
  };

  const partTile = (slug: string) => {
    const d = partBySlug(slug);
    if (!d) return null;
    return (
      <Tile
        key={slug}
        icon={d.icon}
        label={nameOf(d, lang)}
        p={p}
        onPointerDown={(e) => onPartPointerDown(e, slug)}
        onClick={() => onPartActivate(slug)}
        starred={favorites.includes(slug)}
        onStar={() => onToggleFavorite(slug)}
      />
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
      onPointerDown={(e, variant) => onKitPointerDown(e, k.slug, variant)}
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

      <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 8px" }}>
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
  onPointerDown: (e: React.PointerEvent, variant?: string) => void;
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
      <Tile icon={kit.icon} label={kitName(kit, lang)} p={p} onPointerDown={(e) => onPointerDown(e)} onClick={() => onActivate()} starred={starred} onStar={onStar} />
      {/* the mark that it lands as atoms; with variants to choose from, it is also what opens them */}
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
          style={{ ...MARK, display: "inline-flex", alignItems: "center", gap: 1, paddingRight: 2, border: "none", cursor: "pointer", outlineColor: p.primary, background: open ? p.primary : p.secondaryContainer, color: open ? p.onPrimary : p.onSecondaryContainer }}
        >
          {t("kitMark", lang)}
          <Icon name="expand_more" size={12} />
        </button>
      ) : (
        <span aria-hidden title={t("kitMarkHint", lang)} style={{ ...MARK, background: p.secondaryContainer, color: p.onSecondaryContainer, pointerEvents: "none" }}>
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
              onPointerDown={(e) => {
                setOpen(false);
                onPointerDown(e, v.key);
              }}
              onClick={(e) => {
                /* a press has already been handled; only a click without a pointer adds it here */
                if (e.detail === 0) {
                  setOpen(false);
                  onActivate(v.key);
                }
              }}
              style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "6px 8px", border: "none", borderRadius: 10, background: v.key === suited.key ? p.secondaryContainer : "transparent", color: v.key === suited.key ? p.onSecondaryContainer : p.onSurface, font: "inherit", fontSize: 13, textAlign: "left", cursor: "grab", touchAction: "none" }}
            >
              <span style={{ flex: 1 }}>{lang === "en" ? v.name : (v.labels[lang] ?? v.name)}</span>
              {v.key === suited.key && v.suits && <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{t("kitSuits", lang)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
