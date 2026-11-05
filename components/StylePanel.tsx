
import { useEffect, useMemo } from "react";
import { Button } from "@/components/m3e/button";
import { Switch } from "@/components/m3e/switch";
import { themeCss } from "@/lib/m3e/color";
import { RECIPES, RECIPE_KEYS, RECIPE_LABELS, STYLE_PACKS, VARIANT_LABELS, recipesOf, styleCss, styleOf, stylePatch, styleTextOf, type RecipeKey, type Recipes, type StylePack } from "@/lib/styles";
import { ICON_FAMILIES, Palette, Theme, fontFamilyOf, shapeScaleOf, type IconFamily } from "@/lib/tokens";
import { ensureFontLoaded } from "@/lib/theme";
import { Lang, t, useLang } from "@/lib/i18n";
import { shapeVars } from "@/parts/theme";
import { Icon } from "./Icon";
import { Select } from "./ui";

/* The styles, each shown by real controls wearing it, and then how each kind of control is built, for an
 * author who wants one thing different from the style they picked. */

const MATERIAL = {
  name: { zh: "Material", en: "Material", ja: "Material", ko: "Material" },
  hint: { zh: "Google 的 Material 3，组件原本的样子", en: "Material 3, as the components come", ja: "Material 3 の標準", ko: "Material 3 기본" },
};

const ICON_LABELS: Record<IconFamily, { zh: string; en: string; ja: string; ko: string }> = {
  rounded: { zh: "圆润", en: "Rounded", ja: "丸み", ko: "둥근" },
  light: { zh: "细线", en: "Thin", ja: "細線", ko: "얇은" },
  sharp: { zh: "方正", en: "Sharp", ja: "角ばった", ko: "각진" },
  pixel: { zh: "像素", en: "Pixel", ja: "ピクセル", ko: "픽셀" },
};

/** the two controls that say the most about a style, drawn in it */
function Sample({ pack, lang }: { pack: StylePack; lang: Lang }) {
  const selector = `[data-style-sample="${pack.key}"]`;
  const css = useMemo(() => {
    const dark = pack.mode === "dark";
    const at = { scope: `${selector}${selector}`, dark: `.dark${selector}${selector}` };
    return [
      themeCss({ source: { primary: pack.seed }, variant: "tonalSpot", contrast: "standard" }, { light: selector, dark: `.dark${selector}` }),
      styleCss({ ...stylePatch(pack.key), dark, contrast: "standard", displayFamily: pack.display ? fontFamilyOf(pack.display, lang) : undefined }, at),
    ].join("\n");
  }, [pack, selector, lang]);
  return (
    <div
      inert
      aria-hidden
      data-style-sample={pack.key}
      className={pack.mode === "dark" ? "dark" : undefined}
      style={{ ...shapeVars(shapeScaleOf(pack.shape)), fontFamily: fontFamilyOf(pack.font, lang), width: "100%", overflow: "hidden", borderRadius: 12, pointerEvents: "none" }}
    >
      <style>{css}</style>
      <div data-backdrop className="bg-surface" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="flex items-center justify-between gap-1 rounded-lg bg-surface-container-low px-2 py-2 text-on-surface">
          <span className="text-title-large shrink-0" style={{ fontSize: 15, lineHeight: "20px" }}>
            Aa
          </span>
          <Switch defaultChecked size="sm" tabIndex={-1} />
        </div>
        <Button size="xs" tabIndex={-1} className="w-full">
          {t("styleButton", lang)}
        </Button>
      </div>
    </div>
  );
}

function StyleCard({ on, name, hint, onClick, p, children }: { on: boolean; name: string; hint: string; onClick: () => void; p: Palette; children: React.ReactNode }) {
  return (
    /* a card, not a button: what it shows are real controls, and a button cannot hold a button */
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onClick();
      }}
      aria-pressed={on}
      aria-label={name}
      className="m3-press"
      title={hint}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 8,
        minWidth: 0,
        borderRadius: 16,
        border: "none",
        background: on ? p.secondaryContainer : p.surfaceContainerLow,
        color: on ? p.onSecondaryContainer : p.onSurface,
        outline: on ? `2px solid ${p.primary}` : "2px solid transparent",
        outlineOffset: 1,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {children}
      <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 4px", fontSize: 13, fontWeight: 600, minHeight: 20 }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        {on && <Icon name="check" size={18} />}
      </span>
    </div>
  );
}

function Heading({ p, children }: { p: Palette; children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: p.onSurfaceVariant, padding: "0 4px" }}>{children}</div>;
}

function Labeled({ label, p, children }: { label: string; p: Palette; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 12, color: p.onSurfaceVariant, padding: "0 4px" }}>{label}</div>
      {children}
    </div>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>{children}</div>;

export function StylePanel({ p, theme, onChange }: { p: Palette; theme: Theme; onChange: (patch: Partial<Theme>) => void }) {
  const lang = useLang();
  useEffect(() => {
    for (const s of STYLE_PACKS) {
      ensureFontLoaded(s.font);
      if (s.display) ensureFontLoaded(s.display);
    }
  }, []);
  const recipes = recipesOf(theme);
  const pack = styleOf(theme.style);
  /* picking the variant a style already has clears the author's change instead of keeping it */
  const setRecipe = (k: RecipeKey, v: string) => {
    const own = pack?.recipes[k] ?? "m3";
    const next = { ...theme.recipes, [k]: v } as Partial<Recipes>;
    if (v === own) delete next[k];
    onChange({ recipes: Object.keys(next).length ? next : undefined });
  };
  const card = (s: StylePack) => (
    <StyleCard key={s.key} on={theme.style === s.key} name={styleTextOf(s.name, lang)} hint={styleTextOf(s.hint, lang)} onClick={() => onChange(stylePatch(s.key))} p={p}>
      <Sample pack={s} lang={lang} />
    </StyleCard>
  );
  return (
    <div className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "12px 12px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <Heading p={p}>{t("styleApps", lang)}</Heading>
      <Grid>
        <StyleCard on={!theme.style} name={styleTextOf(MATERIAL.name, lang)} hint={styleTextOf(MATERIAL.hint, lang)} onClick={() => onChange(stylePatch(""))} p={p}>
          <div style={{ width: "100%", display: "grid", placeItems: "center", height: 96, borderRadius: 12, background: p.surfaceContainerHigh, color: p.onSurfaceVariant }}>
            <Icon name="widgets" size={28} />
          </div>
        </StyleCard>
        {STYLE_PACKS.filter((s) => s.group === "app").map(card)}
      </Grid>
      <Heading p={p}>{t("styleGames", lang)}</Heading>
      <Grid>{STYLE_PACKS.filter((s) => s.group === "game").map(card)}</Grid>

      {theme.ownColors && pack && (
        <button onClick={() => onChange({ ownColors: undefined })} className="m3-press" style={{ height: 40, borderRadius: 12, border: "none", background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {t("styleUseColors", lang)}
        </button>
      )}

      <Heading p={p}>{t("styleControls", lang)}</Heading>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {RECIPE_KEYS.map((k) => (
          <Labeled key={k} label={styleTextOf(RECIPE_LABELS[k], lang)} p={p}>
            <Select
              label={styleTextOf(RECIPE_LABELS[k], lang)}
              p={p}
              value={recipes[k]}
              options={RECIPES[k].map((v) => ({ key: v, label: styleTextOf(VARIANT_LABELS[v], lang) }))}
              onChange={(v) => setRecipe(k, v)}
            />
          </Labeled>
        ))}
        <Labeled label={t("styleIcons", lang)} p={p}>
          <Select
            label={t("styleIcons", lang)}
            p={p}
            value={theme.icons ?? "rounded"}
            options={ICON_FAMILIES.map((v) => ({ key: v, label: styleTextOf(ICON_LABELS[v], lang) }))}
            onChange={(v) => onChange({ icons: v as IconFamily })}
          />
        </Labeled>
      </div>
      {theme.recipes && (
        <button onClick={() => onChange({ recipes: undefined })} className="m3-press" style={{ height: 40, borderRadius: 12, border: "none", background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {t("styleResetControls", lang)}
        </button>
      )}
    </div>
  );
}
