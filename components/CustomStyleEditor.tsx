import { useMemo, useRef, useState, type ReactNode } from "react";
import { t, type Lang } from "@/lib/i18n";
import {
  READS,
  RECIPES,
  RECIPE_KEYS,
  RECIPE_LABELS,
  STYLE_GROUPS,
  STYLE_PACKS,
  builtInStyleOf,
  contrastRatio,
  copyOfStyle,
  readStyleFile,
  rolesFromSeed,
  styleFile,
  styleFileName,
  styleTextOf,
  validateCustomStyle,
  variantLabel,
  withStyle,
  type CssRule,
  type CustomStyle,
  type RecipeKey,
  type StylePack,
  type StyleProblem,
  type StyleRoles,
  type StyleUX,
} from "@/lib/styles";
import { FONTS, ICON_FAMILIES, SHAPES, type FontKey, type IconFamily, type MotionScheme, type Palette, type ShapeScale } from "@/lib/tokens";
import { Icon } from "./Icon";
import { IconFamilyPicker } from "./IconFamilyPicker";
import { Segmented, Select, Slider } from "./ui";

/* The styles a document makes its own (lib/styles/custom.ts), in the style panel: the cards to pick one by, making one
 * from a built-in style or a file, and a compact editor for the one the document wears. Every change goes through
 * validation before it reaches the document, so what the editor writes is always a style the rest of the system can
 * wear; what validation has to say is listed under it. */

type Text = { zh: string; en: string; ja: string; ko: string };
const GROUP_TEXT = { app: "styleApps", desktop: "styleDesktop", mobileGame: "styleMobileGames", pcGame: "stylePcGames" } as const;
const CONTROLS: StylePack["control"][] = ["pill", "extra-small", "small", "medium", "large"];

const button = (p: Palette, primary = false) =>
  ({ height: 36, padding: "0 12px", borderRadius: 10, border: "none", background: primary ? p.primary : p.surfaceContainerHigh, color: primary ? p.onPrimary : p.onSurface, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }) as const;

function Labeled({ label, p, children }: { label: string; p: Palette; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: p.onSurfaceVariant, padding: "0 4px" }}>{label}</div>
      {children}
    </div>
  );
}

function Heading({ p, children }: { p: Palette; children: ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: p.onSurfaceVariant, padding: "0 4px" }}>{children}</div>;
}

/** hands a style to the browser as its file */
function download(style: CustomStyle) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(styleFile(style), null, 2)}\n`], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = styleFileName(style);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** what validation said, as a list to read */
function Problems({ problems, p, lang }: { problems: StyleProblem[]; p: Palette; lang: Lang }) {
  const say = (x: StyleProblem) => (lang === "zh" ? x.zh : x.en);
  return (
    <div data-style-problems style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", borderRadius: 12, background: problems.length ? p.errorContainer : p.surfaceContainerLow, color: problems.length ? p.onErrorContainer : p.onSurfaceVariant, fontSize: 11, lineHeight: 1.45 }}>
      <div style={{ fontWeight: 700 }}>{problems.length ? t("styleProblems", lang) : t("styleNoProblems", lang)}</div>
      {problems.slice(0, 24).map((x, i) => (
        <div key={i} data-style-problem={x.code}>
          {x.fix === "kept" ? "•" : "✕"} {say(x)}
        </div>
      ))}
      {problems.length > 24 && <div>… +{problems.length - 24}</div>}
    </div>
  );
}

/** The roles in the pairs they are read in: a fill and the words on it, shown together, with how well the words read
 *  (every pair of READS, flagged where the accessibility check finds the words too faint). Every role is in one row. */
const ROWS: [keyof StyleRoles, (keyof StyleRoles)?][] = [
  ["primary", "onPrimary"],
  ["primaryContainer", "onPrimaryContainer"],
  ["secondary", "onSecondary"],
  ["secondaryContainer", "onSecondaryContainer"],
  ["tertiary", "onTertiary"],
  ["tertiaryContainer", "onTertiaryContainer"],
  ["surface", "onSurface"],
  ["surfaceContainerHighest", "onSurfaceVariant"],
  ["surfaceContainerLow"],
  ["surfaceContainer"],
  ["surfaceContainerHigh"],
  ["outline", "outlineVariant"],
  ["inverseSurface", "inverseOnSurface"],
  ["inversePrimary"],
];

const swatch = (p: Palette) => ({ width: 22, height: 22, padding: 0, border: `1px solid ${p.outlineVariant}`, borderRadius: 6, background: "none", flexShrink: 0, cursor: "pointer" }) as const;

/** a fill, the words on it, a sample of the two, and the least they read at where they are words; `low` when the
 *  accessibility check finds these words too faint anywhere they are read (loud or not) */
function PairRow({ bg, fg, roles, low, p, lang, onChange }: { bg: keyof StyleRoles; fg?: keyof StyleRoles; roles: StyleRoles; low: boolean; p: Palette; lang: Lang; onChange: (role: keyof StyleRoles, hex: string) => void }) {
  const fill = roles[bg] as string;
  const words = fg ? (roles[fg] as string) : undefined;
  const pairs = fg ? READS.filter(([, f]) => f === fg) : [];
  const ratio = pairs.length ? Math.min(...pairs.map(([b]) => contrastRatio(roles[b] as string, words!))) : null;
  return (
    <div data-style-role={bg} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 11, color: p.onSurface }}>
      <input type="color" value={fill.toLowerCase()} onChange={(e) => onChange(bg, e.target.value.toUpperCase())} aria-label={bg} title={bg} style={swatch(p)} />
      {fg ? <input type="color" data-style-role={fg} value={words!.toLowerCase()} onChange={(e) => onChange(fg, e.target.value.toUpperCase())} aria-label={fg} title={fg} style={swatch(p)} /> : <span style={{ width: 22, flexShrink: 0 }} />}
      <span aria-hidden style={{ width: 30, height: 22, flexShrink: 0, borderRadius: 6, display: "grid", placeItems: "center", background: fill, color: words ?? "transparent", fontWeight: 600, fontSize: 12, border: `1px solid ${p.outlineVariant}` }}>
        Aa
      </span>
      <span title={fg ? `${bg} / ${fg}` : bg} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace", fontSize: 10.5 }}>
        {bg}
        {fg && <span style={{ color: p.onSurfaceVariant }}> / {fg}</span>}
      </span>
      {ratio !== null && (
        <span data-contrast={low ? "low" : "ok"} title={low ? t("styleContrastLow", lang) : undefined} style={{ flexShrink: 0, padding: "0 4px", borderRadius: 4, fontVariantNumeric: "tabular-nums", background: low ? p.errorContainer : "transparent", color: low ? p.onErrorContainer : p.onSurfaceVariant }}>
          {ratio.toFixed(1)}
        </span>
      )}
    </div>
  );
}

/** the editor of the style the document wears, when it is one of its own */
function StyleEditor({ style, styles, p, lang, preview, iconLabels, onStyles, notes }: { style: CustomStyle; styles: CustomStyle[]; p: Palette; lang: Lang; preview: ReactNode; iconLabels: Record<IconFamily, Text>; onStyles: (next: CustomStyle[] | undefined, pick?: string) => void; notes: StyleProblem[] }) {
  const [mode, setMode] = useState<"light" | "dark">(style.mode);
  const [rulesText, setRulesText] = useState<string | null>(null);
  const [ruleNotes, setRuleNotes] = useState<StyleProblem[]>([]);
  const problems = useMemo(() => validateCustomStyle(style).problems, [style]);
  /* where words (or marks) read too faintly, in any state: the colors the accessibility check takes them from */
  const faint = useMemo(() => new Set(problems.flatMap((x) => (x.check ? [x.check.path] : []))), [problems]);
  /* every change is validated before it reaches the document */
  const update = (patch: Partial<CustomStyle>) => {
    const { style: next, problems: said } = validateCustomStyle({ ...style, ...patch });
    if (!next) return;
    onStyles(withStyle(styles, next));
    return said;
  };
  const roles = style[mode];
  const setRole = (role: keyof StyleRoles, hex: string) => update({ [mode]: { ...roles, [role]: hex } } as Partial<CustomStyle>);
  const name = styleTextOf(style.name, lang);
  const base = builtInStyleOf(style.extends);
  const shownRules = rulesText ?? JSON.stringify(style.rules, null, 1);
  const applyRules = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(shownRules);
    } catch {
      setRuleNotes([{ path: "rules", code: "rule", fix: "dropped", zh: t("styleRulesBad", "zh"), en: t("styleRulesBad", "en") }]);
      return;
    }
    const said = update({ rules: parsed as CssRule[] }) ?? [];
    setRuleNotes(said.filter((x) => x.code === "rule"));
    setRulesText(null);
  };
  const ux = style.ux;
  const setUx = (patch: Partial<StyleUX>) => update({ ux: { ...ux, ...patch } });

  return (
    <div data-custom-style-editor={style.key} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10, borderRadius: 16, background: p.surfaceContainerLow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="palette" size={18} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: p.onSurface }}>{t("styleEditing", lang)}</span>
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.5, color: p.onSurfaceVariant }}>{t("styleEditHint", lang)}</div>
      {preview}

      <Labeled label={t("styleName", lang)} p={p}>
        <input
          data-style-name
          value={name}
          maxLength={60}
          onChange={(e) => update({ name: { zh: e.target.value, en: e.target.value, ja: e.target.value, ko: e.target.value } })}
          style={{ height: 36, padding: "0 10px", borderRadius: 10, border: `1px solid ${p.outlineVariant}`, background: p.surface, color: p.onSurface, fontSize: 13 }}
        />
      </Labeled>
      {base && (
        <div style={{ fontSize: 11, color: p.onSurfaceVariant, padding: "0 4px" }}>
          {t("styleExtends", lang)}：{styleTextOf(base.name, lang)}
        </div>
      )}

      <Heading p={p}>{t("specColors", lang)}</Heading>
      <Segmented<"light" | "dark"> p={p} height={32} value={mode} onChange={setMode} label={t("specColors", lang)} options={[{ key: "light", label: t("styleModeLight", lang) }, { key: "dark", label: t("styleModeDark", lang) }]} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: p.onSurface }}>
          <input type="color" data-style-seed value={style.seed.toLowerCase()} onChange={(e) => update({ seed: e.target.value.toUpperCase() })} aria-label={t("styleSeed", lang)} style={{ width: 28, height: 28, padding: 0, border: `1px solid ${p.outlineVariant}`, borderRadius: 8, cursor: "pointer" }} />
          {t("styleSeed", lang)}
        </label>
        <button className="m3-press" style={{ ...button(p), flex: 1, height: 32 }} onClick={() => update({ ...rolesFromSeed(style.seed), loud: null })}>
          {t("styleFromSeed", lang)}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ROWS.map(([bg, fg]) => (
          <PairRow key={`${mode}-${bg}`} bg={bg} fg={fg} roles={roles} low={!!fg && faint.has(`${mode}.${fg}`)} p={p} lang={lang} onChange={setRole} />
        ))}
      </div>

      <Heading p={p}>{t("specFont", lang)}</Heading>
      <Labeled label={t("styleFont", lang)} p={p}>
        <Select label={t("styleFont", lang)} p={p} value={style.font} options={FONTS.map((f) => ({ key: f.key, label: f.label }))} onChange={(k) => update({ font: k as FontKey })} />
      </Labeled>
      <Labeled label={t("styleDisplay", lang)} p={p}>
        <Select label={t("styleDisplay", lang)} p={p} value={style.display ?? ""} options={[{ key: "", label: t("styleSameFace", lang) }, ...FONTS.map((f) => ({ key: f.key, label: f.label }))]} onChange={(k) => update({ display: k ? (k as FontKey) : null })} />
      </Labeled>
      <Labeled label={t("styleIcons", lang)} p={p}>
        <IconFamilyPicker label={t("styleIcons", lang)} p={p} value={style.icons} options={ICON_FAMILIES.map((v) => ({ key: v, label: styleTextOf(iconLabels[v], lang) }))} onChange={(v) => update({ icons: v })} />
      </Labeled>

      <Heading p={p}>{t("specControls", lang)}</Heading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <Labeled label={t("styleShape", lang)} p={p}>
          <Select label={t("styleShape", lang)} p={p} value={style.shape} options={SHAPES.map((s) => ({ key: s.key, label: s.label }))} onChange={(k) => update({ shape: k as ShapeScale })} />
        </Labeled>
        <Labeled label={t("styleControlCorner", lang)} p={p}>
          <Select label={t("styleControlCorner", lang)} p={p} value={style.control} options={CONTROLS.map((c) => ({ key: c, label: c }))} onChange={(k) => update({ control: k as StylePack["control"] })} />
        </Labeled>
        <Labeled label={t("styleMotion", lang)} p={p}>
          <Select label={t("styleMotion", lang)} p={p} value={style.motion} options={[{ key: "standard", label: t("styleMotionStandard", lang) }, { key: "expressive", label: t("styleMotionExpressive", lang) }]} onChange={(k) => update({ motion: k as MotionScheme })} />
        </Labeled>
        <Labeled label={t("styleOpensIn", lang)} p={p}>
          <Select label={t("styleOpensIn", lang)} p={p} value={style.mode} options={[{ key: "light", label: t("styleModeLight", lang) }, { key: "dark", label: t("styleModeDark", lang) }]} onChange={(k) => update({ mode: k as "light" | "dark" })} />
        </Labeled>
      </div>
      <Labeled label={t("styleKind", lang)} p={p}>
        <Select label={t("styleKind", lang)} p={p} value={style.group} options={STYLE_GROUPS.map((g) => ({ key: g, label: t(GROUP_TEXT[g], lang) }))} onChange={(k) => update({ group: k as StylePack["group"] })} />
      </Labeled>

      <Heading p={p}>{t("styleControls", lang)}</Heading>
      <div data-style-recipes style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {RECIPE_KEYS.map((k: RecipeKey) => (
          <Labeled key={k} label={styleTextOf(RECIPE_LABELS[k], lang)} p={p}>
            <Select label={styleTextOf(RECIPE_LABELS[k], lang)} p={p} value={style.recipes[k] ?? "m3"} options={RECIPES[k].map((v) => ({ key: v, label: styleTextOf(variantLabel(k, v), lang) }))} onChange={(v) => update({ recipes: { ...style.recipes, [k]: v } })} />
          </Labeled>
        ))}
      </div>

      <Heading p={p}>{t("styleLayout", lang)}</Heading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
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
            onChange={(k) => setUx({ nav: k as StyleUX["nav"] })}
          />
        </Labeled>
        <Labeled label={t("stylePlace", lang)} p={p}>
          <Select
            label={t("stylePlace", lang)}
            p={p}
            value={ux.place}
            options={[
              { key: "top", label: t("stylePlaceTop", lang) },
              { key: "center", label: t("stylePlaceCenter", lang) },
              { key: "bottom", label: t("stylePlaceBottom", lang) },
              { key: "spread", label: t("stylePlaceSpread", lang) },
            ]}
            onChange={(k) => setUx({ place: k as StyleUX["place"] })}
          />
        </Labeled>
      </div>
      <Labeled label={t("styleMargin", lang)} p={p}>
        <Slider icon="width" title={t("styleMargin", lang)} value={ux.margin} min={0} max={40} step={2} onChange={(margin) => setUx({ margin })} p={p} />
      </Labeled>
      <Labeled label={t("styleGap", lang)} p={p}>
        <Slider icon="height" title={t("styleGap", lang)} value={ux.gap} min={0} max={40} step={2} onChange={(gap) => setUx({ gap })} p={p} />
      </Labeled>
      <Labeled label={t("styleTight", lang)} p={p}>
        <Slider icon="density_small" title={t("styleTight", lang)} value={ux.tight} min={0} max={24} step={2} onChange={(tight) => setUx({ tight })} p={p} />
      </Labeled>

      {/* whether the colors can be read, apart from whether the style can be used: a style that falls short is kept */}
      <div data-style-access={faint.size ? "issues" : "pass"} style={{ fontSize: 11, lineHeight: 1.45, padding: "0 4px", color: p.onSurfaceVariant }}>
        {faint.size ? t("styleAccessIssues", lang).replace("{n}", String(problems.filter((x) => x.check).length)) : t("styleAccessPass", lang)}
      </div>
      <Problems problems={[...notes, ...ruleNotes, ...problems]} p={p} lang={lang} />

      <details data-style-rules style={{ fontSize: 12, color: p.onSurface }}>
        <summary style={{ cursor: "pointer", padding: "4px", fontWeight: 600 }}>
          {t("styleRulesCss", lang)} · {style.rules.length}
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: p.onSurfaceVariant }}>{t("styleRulesHint", lang)}</div>
          <textarea
            data-style-rules-text
            value={shownRules}
            onChange={(e) => setRulesText(e.target.value)}
            spellCheck={false}
            rows={10}
            style={{ width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 10, border: `1px solid ${p.outlineVariant}`, background: p.surface, color: p.onSurface, fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.4, resize: "vertical" }}
          />
          <button className="m3-press" style={button(p, true)} onClick={applyRules} disabled={rulesText === null}>
            {t("styleRulesApply", lang)}
          </button>
        </div>
      </details>

      <div style={{ display: "flex", gap: 8 }}>
        <button data-style-export className="m3-press" style={{ ...button(p), flex: 1 }} onClick={() => download(style)}>
          <Icon name="download" size={16} />
          {t("styleExport", lang)}
        </button>
        <button
          data-style-delete
          className="m3-press"
          style={{ ...button(p), flex: 1 }}
          onClick={() => {
            const rest = styles.filter((s) => s.key !== style.key);
            onStyles(rest.length ? rest : undefined, "");
          }}
        >
          <Icon name="delete" size={16} />
          {t("styleDelete", lang)}
        </button>
      </div>
    </div>
  );
}

/** The document's own styles: their cards, the ways to make one, and the editor of the one worn. `card` draws a style's
 *  card as the style panel draws a built-in one; `preview` is the larger sample the editor shows on top. */
export function MyStyles({
  p,
  lang,
  styles,
  current,
  onStyles,
  card,
  preview,
  iconLabels,
}: {
  p: Palette;
  lang: Lang;
  styles: CustomStyle[] | undefined;
  /** the style the document wears */
  current: string | undefined;
  onStyles: (next: CustomStyle[] | undefined, pick?: string) => void;
  card: (style: CustomStyle) => ReactNode;
  preview: (style: CustomStyle) => ReactNode;
  iconLabels: Record<IconFamily, Text>;
}) {
  const file = useRef<HTMLInputElement | null>(null);
  const [notes, setNotes] = useState<StyleProblem[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const list = styles ?? [];
  const taken = list.map((s) => s.key);
  const worn = list.find((s) => s.key === current);
  const source: StylePack | CustomStyle | undefined = worn ?? builtInStyleOf(current);
  const duplicate = (from: StylePack | CustomStyle) => {
    const copy = copyOfStyle(from, taken);
    setNotes([]);
    setSaid(null);
    onStyles(withStyle(styles, copy), copy.key);
  };
  const importFile = async (f: File) => {
    const { style, problems } = readStyleFile(await f.text());
    if (!style) {
      setSaid(t("styleImportFailed", lang).replace("{why}", problems.map((x) => (lang === "zh" ? x.zh : x.en)).join("; ")));
      return;
    }
    setNotes(problems.filter((x) => x.fix !== "kept"));
    setSaid(t("styleImported", lang).replace("{name}", styleTextOf(style.name, lang)));
    onStyles(withStyle(styles, style), style.key);
  };
  return (
    <div data-my-styles style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Heading p={p}>{t("myStyles", lang)}</Heading>
      {list.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>{list.map(card)}</div> : <div style={{ fontSize: 11, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("myStylesNone", lang)}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button data-style-duplicate className="m3-press" style={{ ...button(p, true), flex: 1, opacity: source ? 1 : 0.5 }} disabled={!source} onClick={() => source && duplicate(source)}>
          <Icon name="content_copy" size={16} />
          {t("styleDuplicate", lang)}
        </button>
        <button data-style-import className="m3-press" style={{ ...button(p), flex: 1 }} onClick={() => file.current?.click()}>
          <Icon name="upload" size={16} />
          {t("styleImport", lang)}
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          data-style-import-file
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importFile(f);
          }}
        />
      </div>
      <Select label={t("styleDuplicateFrom", lang)} p={p} value="" options={[{ key: "", label: t("styleDuplicateFrom", lang) }, ...STYLE_PACKS.map((s) => ({ key: s.key, label: styleTextOf(s.name, lang) }))]} onChange={(k) => {
        const pack = builtInStyleOf(k);
        if (pack) duplicate(pack);
      }} />
      {said && <div data-style-said style={{ fontSize: 11, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px" }}>{said}</div>}
      {worn && <StyleEditor key={worn.key} style={worn} styles={list} p={p} lang={lang} preview={preview(worn)} iconLabels={iconLabels} onStyles={onStyles} notes={notes} />}
    </div>
  );
}
