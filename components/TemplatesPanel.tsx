import { useMemo, useState } from "react";
import { Palette, frameLengthOf, frameSizeOf } from "@/lib/tokens";
import { partBySlug, reader } from "@/parts/registry";
import { roleOf } from "@/parts/role";
import { TEMPLATES, TEMPLATE_CATEGORIES, type Template, type TemplateCategory } from "@/parts/templates";
import { defaultMeasures, instantiate } from "@/parts/templates/kit";
import { Icon } from "./Icon";
import { Field, Section } from "./ui";
import { Lang, UIKey, t, useLang } from "@/lib/i18n";

/* The Templates tab: real screens to start from. A tile draws its screen as a plan of boxes worked out
 * from the same layout it will be added with, so that no tile has to mount a whole screen of parts. */

const CATEGORY: Record<TemplateCategory, { icon: string; title: UIKey }> = {
  flow: { icon: "account_tree", title: "tplFlow" },
  auth: { icon: "login", title: "tplAuth" },
  shop: { icon: "storefront", title: "tplShop" },
  social: { icon: "forum", title: "tplSocial" },
  content: { icon: "article", title: "tplContent" },
  tools: { icon: "tune", title: "tplTools" },
  desktop: { icon: "desktop_windows", title: "tplDesktop" },
};

type Box = { x: number; y: number; w: number; h: number; ink: keyof Pick<Palette, "primary" | "primaryContainer" | "secondaryContainer" | "surfaceContainerHigh" | "surfaceContainerHighest" | "outlineVariant"> };
type Plan = { w: number; h: number; boxes: Box[]; screens: number };

const INK_OF: Record<string, Box["ink"]> = { button: "primary", "brand-button": "primary", image: "primaryContainer", map: "primaryContainer", chart: "primaryContainer", "balance-card": "primaryContainer", onboarding: "primaryContainer", icon: "primary", text: "outlineVariant" };

const plans = new Map<string, Plan>();

function planOf(template: Template): Plan {
  const known = plans.get(template.slug);
  if (known) return known;
  const { frames, groups } = instantiate(template, "en");
  const first = frames[0];
  const { w, h } = frameSizeOf(first);
  const m = defaultMeasures(groups);
  const boxes: Box[] = [];
  for (const g of groups) {
    if (g.x < first.x || g.x >= first.x + w) continue;
    const it = g.items[0];
    const def = partBySlug(it.component);
    if (!def) continue;
    let ink: Box["ink"] = INK_OF[def.slug] ?? "surfaceContainerHighest";
    if (def.holds) {
      /* a bare layout draws nothing of its own */
      const fill = reader(def, it.props).s("fill");
      if (!fill || fill === "none") continue;
      ink = fill.includes("primary") ? "primaryContainer" : fill.includes("secondary") ? "secondaryContainer" : "surfaceContainerHigh";
    } else if (roleOf(it) === "top" || roleOf(it) === "bottom") ink = "surfaceContainerHigh";
    const tall = m[`${it.id}:h`];
    boxes.push({ x: g.x - first.x, y: g.y - first.y, w: m[it.id], h: def.slug === "text" ? Math.min(tall, 16) : tall, ink });
  }
  /* the top of a long screen is enough to tell it by */
  const plan = { w, h: Math.min(frameLengthOf(first), h), boxes, screens: frames.length };
  plans.set(template.slug, plan);
  return plan;
}

function Tile({ template, p, lang, onAdd }: { template: Template; p: Palette; lang: Lang; onAdd: (slug: string) => void }) {
  const plan = planOf(template);
  const name = lang === "en" ? template.name : template.labels[lang];
  const flow = plan.screens > 1;
  const how = flow ? t("tplAddFlow", lang).replace("{n}", `${plan.screens}`) : t("tplAddOne", lang);
  return (
    <button
      type="button"
      className="m3-tile-face"
      data-template={template.slug}
      onClick={() => onAdd(template.slug)}
      title={`${how}: ${name}`}
      aria-label={`${how}: ${name}`}
      style={{ margin: 0, border: "none", font: "inherit", outlineColor: p.primary, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 16, background: p.surfaceContainerLow, color: p.onSurface, cursor: "pointer", textAlign: "left", boxSizing: "border-box" }}
    >
      <svg viewBox={`0 0 ${plan.w} ${plan.h}`} preserveAspectRatio="xMidYMin meet" aria-hidden style={{ width: "100%", height: 120, display: "block", borderRadius: 10, background: p.surfaceContainer }}>
        <rect width={plan.w} height={plan.h} rx={plan.w / 14} fill={p.surface} />
        {plan.boxes.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={Math.max(0, b.w)} height={Math.max(0, b.h)} rx={Math.min(b.h / 2, plan.w / 40)} fill={p[b.ink]} />
        ))}
      </svg>
      <span style={{ fontSize: 12, fontWeight: 600, lineHeight: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      {flow && <span style={{ fontSize: 11, lineHeight: "14px", color: p.onSurfaceVariant }}>{t("tplLinked", lang).replace("{n}", `${plan.screens}`)}</span>}
    </button>
  );
}

export function TemplatesPanel({ p, onAdd }: { p: Palette; onAdd: (slug: string) => void }) {
  const lang = useLang();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return TEMPLATES;
    return TEMPLATES.filter((d) => [d.name, d.slug, ...Object.values(d.labels), t(CATEGORY[d.category].title, lang)].some((x) => x.toLowerCase().includes(s)));
  }, [q, lang]);
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 6 };
  const tile = (d: Template) => <Tile key={d.slug} template={d} p={p} lang={lang} onAdd={onAdd} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "12px 12px 8px" }}>
        <Field value={q} onChange={setQ} placeholder={t("search", lang)} p={p} icon="search" height={40} />
      </div>
      <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 8px" }}>
        {q ? (
          <div style={{ ...grid, padding: "4px 4px 12px" }}>
            {filtered.map(tile)}
            {filtered.length === 0 && (
              <div role="status" style={{ gridColumn: "1 / -1", color: p.outline, fontSize: 13, padding: 12, textAlign: "center", display: "grid", placeItems: "center", gap: 6 }}>
                <Icon name="search_off" size={28} />
                <span>{t("tplNoMatch", lang)}</span>
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, lineHeight: "16px", color: p.onSurfaceVariant, padding: "0 6px 8px" }}>{t("tplHint", lang)}</div>
            {TEMPLATE_CATEGORIES.map((c) => (
              <Section key={c} id={`tpl:${c}`} icon={CATEGORY[c].icon} title={t(CATEGORY[c].title, lang)} p={p}>
                <div style={grid}>{TEMPLATES.filter((d) => d.category === c).map(tile)}</div>
              </Section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
