
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/m3e/button";
import { Switch } from "@/components/m3e/switch";
import { Checkbox } from "@/components/m3e/checkbox";
import { Chip } from "@/components/m3e/chip";
import { Input } from "@/components/m3e/input";
import { Slider as M3Slider } from "@/components/m3e/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/m3e/tabs";
import { themeCss } from "@/lib/m3e/color";
import { RECIPES, RECIPE_KEYS, RECIPE_LABELS, STYLE_GROUPS, STYLE_PACKS, isCustomKey, isStrict, recipesOf, resolveStyle, styleCss, styleOf, stylePatch, styleTextOf, uxOf, variantLabel, type CustomStyle, type RecipeKey, type Recipes, type StylePack, type StyleUX } from "@/lib/styles";
import { FONTS, ICON_FAMILIES, Palette, Theme, fontFamilyOf, langFaceOf, shapeScaleOf, type FontKey, type IconFamily } from "@/lib/tokens";
import { ensureFontLoaded } from "@/lib/theme";
import { Lang, t, useLang } from "@/lib/i18n";
import { shapeVars } from "@/parts/theme";
import { Icon } from "./Icon";
import { IconFamilyPicker } from "./IconFamilyPicker";
import { MyStyles } from "./CustomStyleEditor";
import { Select, Slider, Toggle } from "./ui";

/* The styles, each shown by real controls wearing it, and then how each kind of control is built, for an
 * author who wants one thing different from the style they picked. */

const MATERIAL = {
  name: { zh: "Android", en: "Android", ja: "Android", ko: "Android" },
  hint: { zh: "安卓和谷歌应用的 Material 3，组件原本的样子", en: "Material 3, as on Android and in Google's apps", ja: "Android と Google アプリの Material 3", ko: "Android와 Google 앱의 Material 3" },
};

const GROUP_TEXT = { app: "styleApps", desktop: "styleDesktop", mobileGame: "styleMobileGames", pcGame: "stylePcGames" } as const;

const ICON_LABELS: Record<IconFamily, { zh: string; en: string; ja: string; ko: string }> = {
  rounded: { zh: "圆润", en: "Rounded", ja: "丸み", ko: "둥근" },
  filled: { zh: "实心", en: "Solid", ja: "塗りつぶし", ko: "채움" },
  light: { zh: "细线", en: "Thin", ja: "細線", ko: "얇은" },
  sharp: { zh: "方正", en: "Sharp", ja: "角ばった", ko: "각진" },
  pixel: { zh: "像素", en: "Pixel", ja: "ピクセル", ko: "픽셀" },
  sf: { zh: "iOS 线条", en: "iOS line", ja: "iOS の線", ko: "iOS 선" },
  fluentui: { zh: "Fluent", en: "Fluent", ja: "Fluent", ko: "Fluent" },
  codicon: { zh: "VS Code", en: "VS Code", ja: "VS Code", ko: "VS Code" },
  phosphor: { zh: "Phosphor", en: "Phosphor", ja: "Phosphor", ko: "Phosphor" },
  lucide: { zh: "Lucide", en: "Lucide", ja: "Lucide", ko: "Lucide" },
  remix: { zh: "Remix", en: "Remix", ja: "Remix", ko: "Remix" },
  ant: { zh: "Ant Design", en: "Ant Design", ja: "Ant Design", ko: "Ant Design" },
  tabler: { zh: "Tabler", en: "Tabler", ja: "Tabler", ko: "Tabler" },
  mingcute: { zh: "MingCute", en: "MingCute", ja: "MingCute", ko: "MingCute" },
  game: { zh: "游戏图标", en: "Game icons", ja: "ゲームアイコン", ko: "게임 아이콘" },
  emoji: { zh: "彩色图标", en: "Color emoji", ja: "カラー絵文字", ko: "컬러 이모지" },
};

/** a style's faces, fetched the first time its card is seen, pointed at or picked: never all of them at once */
const loadFaces = (pack: StylePack, lang: Lang) => {
  ensureFontLoaded(pack.font, undefined, lang);
  if (pack.display) ensureFontLoaded(pack.display, undefined, lang);
};

/** the two controls that say the most about a style, drawn in it; its faces come once it scrolls into view. `rich`:
 *  more of them, for the editor of a style of the document's own, where each recipe picked shows at once */
function Sample({ pack, lang, rich }: { pack: StylePack; lang: Lang; rich?: boolean }) {
  const selector = `[data-style-sample="${pack.key}"]`;
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return loadFaces(pack, lang);
    const io = new IntersectionObserver(
      (seen) => {
        if (!seen.some((e) => e.isIntersecting)) return;
        loadFaces(pack, lang);
        io.disconnect();
      },
      /* a little before it shows, so the face is there by the time it does */
      { rootMargin: "160px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pack, lang]);
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
      ref={ref}
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
        {rich && (
          <>
            <div className="flex gap-2">
              <Button size="xs" variant="tonal" tabIndex={-1} className="flex-1">
                {t("styleButton", lang)}
              </Button>
              <Button size="xs" variant="outlined" tabIndex={-1} className="flex-1">
                {t("styleButton", lang)}
              </Button>
            </div>
            <Tabs defaultValue="a">
              <TabsList className="w-full">
                <TabsTrigger value="a">{t("styleModeLight", lang)}</TabsTrigger>
                <TabsTrigger value="b">{t("styleModeDark", lang)}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-3 rounded-lg bg-surface-container-low px-2 py-2 text-on-surface">
              <Checkbox defaultChecked tabIndex={-1} />
              <Chip tabIndex={-1}>{t("styleKind", lang)}</Chip>
              <M3Slider defaultValue={[60]} className="flex-1" />
            </div>
            <Input placeholder={t("styleName", lang)} tabIndex={-1} readOnly />
          </>
        )}
      </div>
    </div>
  );
}

function StyleCard({ on, name, refs, hint, onClick, onHover, p, children }: { on: boolean; name: string; refs?: string; hint: string; onClick: () => void; /** pointed at: what it would need is fetched */ onHover?: () => void; p: Palette; children: React.ReactNode }) {
  return (
    /* a card, not a button: what it shows are real controls, and a button cannot hold a button */
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onPointerEnter={onHover}
      onFocus={onHover}
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
        <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>{name}</span>
        {on && <Icon name="check" size={18} />}
      </span>
      {/* whose look it is, so that it can be recognized */}
      {refs && <span style={{ padding: "0 4px", fontSize: 11, lineHeight: 1.3, color: on ? p.onSecondaryContainer : p.onSurfaceVariant }}>{refs}</span>}
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

/** a face's name, and the name of what stands in for it in the language being written */
const faceName = (key: FontKey, lang: Lang) => {
  const face = FONTS.find((f) => f.key === key);
  const own = key === "system" ? null : langFaceOf(key, lang);
  return [face?.label, own?.family.replace(/'/g, "")].filter(Boolean).join(" + ");
};

function SpecRow({ label, p, children }: { label: string; p: Palette; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0, 1fr)", gap: 8, fontSize: 12, lineHeight: 1.5, padding: "0 4px", color: p.onSurface }}>
      <span style={{ color: p.onSurfaceVariant }}>{label}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

/** what a document is held to: the same values the rules hold it to, to read */
function StyleSpec({ theme, pack, p, lang }: { theme: Theme; pack: StylePack | undefined; p: Palette; lang: Lang }) {
  const recipes = recipesOf(theme);
  const ux = uxOf(theme);
  const built = RECIPE_KEYS.filter((k) => recipes[k] !== "m3");
  const nav = { keep: t("styleNavKeep", lang), bottom: t("styleNavBottom", lang), rail: t("styleNavRail", lang), top: t("styleNavTop", lang) }[ux.nav];
  return (
    <div data-style-spec style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 8px", borderRadius: 12, background: p.surfaceContainerLow }}>
      <SpecRow label={t("specFont", lang)} p={p}>
        {[faceName(theme.font, lang), theme.displayFont && theme.displayFont !== theme.font ? faceName(theme.displayFont, lang) : ""].filter(Boolean).join(" / ")}
      </SpecRow>
      <SpecRow label={t("specColors", lang)} p={p}>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {[p.primary, p.secondary, p.primaryContainer, p.surface, p.surfaceContainerHigh, p.onSurface, p.outline].map((c, i) => (
            <span key={i} aria-hidden style={{ width: 16, height: 16, borderRadius: 4, background: c, border: `1px solid ${p.outlineVariant}` }} />
          ))}
        </span>
      </SpecRow>
      <SpecRow label={t("specControls", lang)} p={p}>
        {built.length ? built.map((k) => `${styleTextOf(RECIPE_LABELS[k], lang)}：${styleTextOf(variantLabel(k, recipes[k]), lang)}`).join("；") : "Material 3"}
      </SpecRow>
      <SpecRow label={t("specLayout", lang)} p={p}>
        {t("styleNav", lang)}：{nav}；{t("styleMargin", lang)} {ux.margin}；{t("styleGap", lang)} {ux.gap}；{t("styleTight", lang)} {ux.tight}
        {pack && <div style={{ color: p.onSurfaceVariant, marginTop: 4 }}>{styleTextOf(pack.layout, lang)}</div>}
      </SpecRow>
    </div>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>{children}</div>;

export type StylePanelProps = {
  p: Palette;
  theme: Theme;
  onChange: (patch: Partial<Theme>) => void;
  /** a style is picked: colors, shapes and layout together */
  onPick: (key: string) => void;
  onUx: (patch: Partial<StyleUX>) => void;
  onRelayout: () => void;
  /** holds the document to its style's rules, or lets it go */
  onRules: (on: boolean) => void;
  /** the document's own styles (`Doc.styles`) */
  styles?: CustomStyle[];
  /** the document's own styles changed, and a style to put on it afterwards ("" for Android); left out, the panel offers none */
  onStyles?: (next: CustomStyle[] | undefined, pick?: string) => void;
};

/** The styles panel itself. It draws every style with real M3E controls, so it is fetched when the panel is first opened
 *  (StylePanel.tsx), not with the editor. */
export function StylePanel({ p, theme, onChange, onPick, onUx, onRelayout, onRules, styles, onStyles }: StylePanelProps) {
  const lang = useLang();
  const strict = isStrict(theme);
  const recipes = recipesOf(theme);
  const ux = uxOf(theme);
  const pack = styleOf(theme.style);
  /* picking the variant a style already has clears the author's change instead of keeping it */
  const setRecipe = (k: RecipeKey, v: string) => {
    const own = pack?.recipes[k] ?? "m3";
    const next = { ...theme.recipes, [k]: v } as Partial<Recipes>;
    if (v === own) delete next[k];
    onChange({ recipes: Object.keys(next).length ? next : undefined });
  };
  const card = (s: StylePack) => (
    <StyleCard key={s.key} on={theme.style === s.key} name={styleTextOf(s.name, lang)} refs={s.refs.length === 1 && s.refs[0] === s.name.en ? undefined : s.refs.slice(0, 2).join(" · ")} hint={styleTextOf(s.hint, lang)} onClick={() => (loadFaces(s, lang), onPick(s.key))} onHover={() => loadFaces(s, lang)} p={p}>
      <Sample pack={s} lang={lang} />
    </StyleCard>
  );
  return (
    <div className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "12px 12px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <Heading p={p}>{t(GROUP_TEXT.app, lang)}</Heading>
      <Grid>
        <StyleCard on={!theme.style} name={styleTextOf(MATERIAL.name, lang)} hint={styleTextOf(MATERIAL.hint, lang)} onClick={() => onPick("")} p={p}>
          <div style={{ width: "100%", display: "grid", placeItems: "center", height: 96, borderRadius: 12, background: p.surfaceContainerHigh, color: p.onSurfaceVariant }}>
            <Icon name="widgets" size={28} />
          </div>
        </StyleCard>
        {STYLE_PACKS.filter((s) => s.group === "app").map(card)}
      </Grid>
      {STYLE_GROUPS.filter((g) => g !== "app").map((g) => (
        <div key={g} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Heading p={p}>{t(GROUP_TEXT[g], lang)}</Heading>
          <Grid>{STYLE_PACKS.filter((s) => s.group === g).map(card)}</Grid>
        </div>
      ))}

      {onStyles && (
        <MyStyles
          p={p}
          lang={lang}
          styles={styles}
          current={theme.style}
          onStyles={onStyles}
          iconLabels={ICON_LABELS}
          card={(s: CustomStyle) => {
            const compiled = resolveStyle(s.key, styles);
            return compiled ? card(compiled) : null;
          }}
          preview={(s: CustomStyle) => {
            const compiled = resolveStyle(s.key, styles);
            return compiled ? <Sample pack={compiled} lang={lang} rich /> : null;
          }}
        />
      )}

      {theme.ownColors && pack && (
        <button onClick={() => onChange({ ownColors: undefined })} className="m3-press" style={{ height: 40, borderRadius: 12, border: "none", background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {t("styleUseColors", lang)}
        </button>
      )}

      <Heading p={p}>{t("styleSpec", lang)}</Heading>
      <Toggle on={strict} onChange={onRules} p={p} label={t("styleRules", lang)} grow />
      <div style={{ fontSize: 11, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px" }}>{t(strict ? "styleRulesOn" : "styleRulesOff", lang)}</div>
      {strict && <StyleSpec theme={theme} pack={pack} p={p} lang={lang} />}
      {/* every part wearing this style, on a page of its own: to see what the style makes of each */}
      <a
        href={`${import.meta.env.BASE_URL}gallery?${new URLSearchParams({ ...(theme.style ? { style: theme.style } : {}), dark: theme.dark ? "1" : "0", lang, ...(isCustomKey(theme.style) && styles?.some((s) => s.key === theme.style) ? { custom: JSON.stringify(styles.find((s) => s.key === theme.style)) } : {}) }).toString()}`}
        target="_blank"
        rel="noreferrer"
        className="m3-press"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 36, borderRadius: 12, background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 12, fontWeight: 600, textDecoration: "none" }}
      >
        <Icon name="grid_view" size={18} />
        {t("styleGallery", lang)}
      </a>
      {!strict && (
        <>
      <Heading p={p}>{t("styleLayout", lang)}</Heading>
      {pack && <div style={{ fontSize: 11, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px" }}>{styleTextOf(pack.layout, lang)}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Labeled label={t("styleNav", lang)} p={p}>
          <Select
            label={t("styleNav", lang)}
            p={p}
            value={ux.nav}
            options={[
              { key: "keep", label: t("styleNavKeep", lang) },
              { key: "bottom", label: t("styleNavBottom", lang) },
              { key: "rail", label: t("styleNavRail", lang) },
              { key: "top", label: t("styleNavTop", lang) },
            ]}
            onChange={(k) => onUx({ nav: k as StyleUX["nav"] })}
          />
        </Labeled>
        <Labeled label={t("stylePlace", lang)} p={p}>
          <Select
            label={t("stylePlace", lang)}
            p={p}
            value={ux.place ?? "top"}
            options={[
              { key: "top", label: t("stylePlaceTop", lang) },
              { key: "center", label: t("stylePlaceCenter", lang) },
              { key: "bottom", label: t("stylePlaceBottom", lang) },
              { key: "spread", label: t("stylePlaceSpread", lang) },
            ]}
            onChange={(k) => onUx({ place: k as StyleUX["place"] })}
          />
        </Labeled>
        <Labeled label={t("styleMargin", lang)} p={p}>
          <Slider icon="width" title={t("styleMargin", lang)} value={ux.margin} min={0} max={40} step={2} onChange={(margin) => onUx({ margin })} p={p} />
        </Labeled>
        <Labeled label={t("styleGap", lang)} p={p}>
          <Slider icon="height" title={t("styleGap", lang)} value={ux.gap} min={0} max={40} step={2} onChange={(gap) => onUx({ gap })} p={p} />
        </Labeled>
        <Labeled label={t("styleTight", lang)} p={p}>
          <Slider icon="density_small" title={t("styleTight", lang)} value={ux.tight} min={0} max={24} step={2} onChange={(tight) => onUx({ tight })} p={p} />
        </Labeled>
        <button onClick={onRelayout} className="m3-press" style={{ height: 40, borderRadius: 12, border: "none", background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {t("styleRelayout", lang)}
        </button>
      </div>

      <Heading p={p}>{t("styleControls", lang)}</Heading>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {RECIPE_KEYS.map((k) => (
          <Labeled key={k} label={styleTextOf(RECIPE_LABELS[k], lang)} p={p}>
            <Select
              label={styleTextOf(RECIPE_LABELS[k], lang)}
              p={p}
              value={recipes[k]}
              options={RECIPES[k].map((v) => ({ key: v, label: styleTextOf(variantLabel(k, v), lang) }))}
              onChange={(v) => setRecipe(k, v)}
            />
          </Labeled>
        ))}
        <Labeled label={t("styleIcons", lang)} p={p}>
          <IconFamilyPicker
            label={t("styleIcons", lang)}
            p={p}
            value={theme.icons ?? "rounded"}
            options={ICON_FAMILIES.map((v) => ({ key: v, label: styleTextOf(ICON_LABELS[v], lang) }))}
            onChange={(v) => onChange({ icons: v })}
          />
        </Labeled>
      </div>
      {theme.recipes && (
        <button onClick={() => onChange({ recipes: undefined })} className="m3-press" style={{ height: 40, borderRadius: 12, border: "none", background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {t("styleResetControls", lang)}
        </button>
      )}
        </>
      )}
    </div>
  );
}
