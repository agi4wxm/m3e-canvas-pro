
import { useContext, useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import {
  Action,
  BACK_TARGET,
  COLOR_TOKENS,
  ColorToken,
  Frame,
  Item,
  LINK_TARGET,
  NavTab,
  Palette,
  Radii,
  STAY_TARGET,
  TEXT_TOKENS,
  TextToken,
  uniformRadii,
  contentWidth,
  halfWidth,
  isPhoneFrame,
  sizeOf,
  onToken,
} from "@/lib/tokens";
import { Lang } from "@/lib/i18n";
import { Icon } from "./Icon";
import { IconPicker } from "./IconPicker";
import { segmentedFits } from "@/lib/choices";
import { decimalsOf, inputStep, typedNumber, type Step } from "@/lib/numbers";
import { Field, IconBtn, ImageRow, RUN_CELL, Section, Segmented, Select, SelectOption, Slider, Toggle, useDismiss } from "./ui";
import { AiHooks } from "./Inspector";
import { LinkStage, TapStage } from "./TapStage";
import { ActionExtras, BehaviorContext, tidiedAction } from "./EffectsPanel";
import { InteractionFields, SCROLL_TO } from "./Interaction";
import { partBySlug } from "@/parts/registry";
import { outletsOf, type Outlet } from "@/lib/partContract";
import { COLOR_TOKEN_TEXT, TEXT_TOKEN_TEXT, t, useLang } from "@/lib/i18n";
import type { AlignHow } from "@/lib/align";

/** past this a corner reads as fully round on any part */
const CORNER_MAX = 64;

/* The chrome every part's panel wears: the title row with its menu, the two tabs, the grid that
 * lines a part up, the field the model writes into, and the tap action with its stage. A part
 * takes the pieces it has a use for -- a part nothing can be done to has no trigger tab at all. */

export type Tab = "design" | "behavior";
type Col = 0 | 1 | 2;
type Row3 = 0 | 1 | 2;
const COL_KIND = ["left", "centerH", "right"] as const;
const ROW_KIND = ["top", "centerV", "bottom"] as const;
export type PlaceFn = (col: (typeof COL_KIND)[number], row: (typeof ROW_KIND)[number]) => void;

/** the glyph a cell turns into once picked: three short bars sitting where the part now sits */
function AlignGlyph({ c, r, color }: { c: Col; r: Row3; color: string }) {
  const place = ["flex-start", "center", "flex-end"];
  return (
    <span aria-hidden style={{ width: 22, height: 22, display: "flex", flexDirection: "column", justifyContent: place[r], alignItems: place[c] }}>
      {[14, 8, 11].map((w, i) => (
        <span key={i} style={{ width: w, height: 3, borderRadius: 2, background: color, marginTop: i ? 2 : 0 }} />
      ))}
    </span>
  );
}

/** how tall the row of tabs is; the panel keeps that much room for it above what scrolls */
const TABS_H = 40;

/** Two M3 primary tabs with the underline indicator. The panel under them is one of two, named
 *  by the tab that opens it, and the arrow keys move between the two. */
export function PartTabs({ value, onChange, p, idPrefix = "part" }: { value: Tab; onChange: (t: Tab) => void; p: Palette; /** the ids the tabs and their panels are known by, so two tabbed panels never share one */ idPrefix?: string }) {
  const lang = useLang();
  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: "design", icon: "palette", label: t("design", lang) },
    { key: "behavior", icon: "bolt", label: t("dzPrototype", lang) },
  ];
  const walk = (e: React.KeyboardEvent, d: 1 | -1) => {
    e.preventDefault();
    const at = tabs.findIndex((tab) => tab.key === value);
    const next = tabs[(at + d + tabs.length) % tabs.length].key;
    onChange(next);
    (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`#${idPrefix}-tab-${next}`)?.focus();
  };
  return (
    /* the hairline under the row is the panel's (PanelShell); the chosen tab keeps the line under its own label */
    <div role="tablist" aria-label={t("edit", lang)} style={{ display: "flex", height: TABS_H }}>
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <button
            key={tab.key}
            id={`${idPrefix}-tab-${tab.key}`}
            role="tab"
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${tab.key}`}
            tabIndex={on ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") walk(e, 1);
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp") walk(e, -1);
            }}
            onClick={() => onChange(tab.key)}
            className="m3-press"
            style={{
              flex: 1,
              height: TABS_H,
              border: "none",
              background: "transparent",
              color: on ? p.primary : p.onSurfaceVariant,
              cursor: "pointer",
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Icon name={tab.icon} size={16} fill={on} />
            {tab.label}
            {on && <span aria-hidden style={{ position: "absolute", left: 20, right: 20, bottom: 0, height: 2, borderRadius: "2px 2px 0 0", background: p.primary }} />}
          </button>
        );
      })}
    </div>
  );
}

/** a wide 3x3 grid of dots: one tap lines the part up on both axes, and the dot becomes a glyph for that spot */
export function AlignBox({ onPlace, p, compact }: { onPlace: PlaceFn; p: Palette; /** the small square the design panel puts beside the position */ compact?: boolean }) {
  const lang = useLang();
  const [pick, setPick] = useState<[Col, Row3] | null>(null);
  const colTitle = [t("alignLeft", lang), t("alignCenterH", lang), t("alignRight", lang)];
  const rowTitle = [t("alignTop", lang), t("alignCenterV", lang), t("alignBottom", lang)];
  return (
    <div
      role="group"
      aria-label={t("align", lang)}
      style={{
        width: compact ? 68 : "100%",
        height: compact ? 68 : 108,
        flex: compact ? "0 0 auto" : undefined,
        borderRadius: compact ? 6 : 16,
        background: p.surfaceContainerHigh,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        padding: 4,
        boxSizing: "border-box",
      }}
    >
      {([0, 1, 2] as Row3[]).flatMap((r) =>
        ([0, 1, 2] as Col[]).map((c) => {
          const on = pick?.[0] === c && pick?.[1] === r;
          const title = `${colTitle[c]} / ${rowTitle[r]}`;
          return (
            <button
              key={`${c}${r}`}
              onClick={() => {
                setPick([c, r]);
                onPlace(COL_KIND[c], ROW_KIND[r]);
              }}
              title={title}
              aria-label={title}
              aria-pressed={on}
              className="m3-press"
              style={{
                border: "none",
                borderRadius: compact ? 4 : 12,
                background: on ? p.primary : "transparent",
                color: on ? p.onPrimary : p.outline,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                padding: 0,
                transition: "background 120ms",
              }}
            >
              {on && !compact ? <AlignGlyph c={c} r={r} color={p.onPrimary} /> : <span aria-hidden style={{ width: compact ? 4 : 8, height: compact ? 4 : 8, borderRadius: 4, background: on ? p.onPrimary : p.outline }} />}
            </button>
          );
        }),
      )}
    </div>
  );
}

/** everything that can be done to the part itself, behind one button: the header stays a title */
export function PartMenu({
  p,
  locked,
  onDuplicate,
  onToggleLock,
  onDelete,
  deleteLabel,
}: {
  p: Palette;
  locked: boolean;
  /** left out where there is nothing whole to copy, such as a loose selection */
  onDuplicate?: () => void;
  onToggleLock?: () => void;
  onDelete: () => void;
  deleteLabel?: string;
}) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  /* the menu closes back onto the button that opened it, so focus has somewhere to land */
  const close = () => {
    setOpen(false);
    box.current?.querySelector<HTMLElement>("button")?.focus();
  };
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  useDismiss(open, (by) => (by === "escape" ? close() : setOpen(false)), [box]);
  /* the arrow keys walk the entries, Home and End jump to either end */
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    items[next]?.focus();
  };
  const rows: { key: string; icon: string; label: string; danger?: boolean; onClick: () => void }[] = [
    ...(onDuplicate ? [{ key: "duplicate", icon: "content_copy", label: t("duplicate", lang), onClick: onDuplicate }] : []),
    ...(onToggleLock ? [{ key: "lock", icon: locked ? "lock_open" : "lock", label: t(locked ? "unlock" : "lock", lang), onClick: onToggleLock }] : []),
    { key: "delete", icon: "delete", label: deleteLabel ?? t("delete", lang), danger: true, onClick: onDelete },
  ];
  return (
    <div ref={box} style={{ position: "relative", flex: "0 0 auto" }}>
      <IconBtn icon="more_vert" p={p} on={open} onClick={() => setOpen((o) => !o)} title={t("more", lang)} size={32} hasPopup="menu" expanded={open} />
      {open && (
        <div
          ref={menu}
          role="menu"
          onKeyDown={onMenuKey}
          style={{
            position: "absolute",
            right: 0,
            top: 38,
            zIndex: 40,
            minWidth: 168,
            padding: 4,
            borderRadius: 12,
            background: p.surfaceContainerHigh,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)",
          }}
        >
          {rows.map((r) => (
            <button
              key={r.key}
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close();
                r.onClick();
              }}
              className="m3-press"
              style={{
                width: "100%",
                height: 40,
                padding: "0 10px",
                border: "none",
                borderRadius: 8,
                background: "transparent",
                color: r.danger ? p.error : p.onSurface,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 14,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              <Icon name={r.icon} size={20} />
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** the AI writer inside the description field: drawn as quietly as the clear button beside it */
export function AiIconBtn({ ai, p }: { ai: AiHooks; p: Palette }) {
  const lang = useLang();
  const live = ai.ready || ai.busy;
  const title = ai.busy ? t("cancel", lang) : ai.ready ? t("aiWrite", lang) : (ai.reason ?? t("aiNoKey", lang));
  return (
    <button
      onClick={ai.busy ? ai.onCancel : ai.onRun}
      disabled={!live}
      title={title}
      aria-label={title}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        border: "none",
        background: "transparent",
        color: live ? p.onSurfaceVariant : p.outline,
        cursor: live ? "pointer" : "default",
        display: "grid",
        placeItems: "center",
      }}
    >
      <span className={ai.busy ? "m3-spin" : undefined} style={{ display: "inline-flex" }}>
        <Icon name={ai.busy ? "progress_activity" : "auto_awesome"} size={16} />
      </span>
    </button>
  );
}


/** the title row: what the part is, and everything that can be done to it behind one button */
export function PartHeader({
  title,
  icon,
  p,
  locked,
  onDuplicate,
  onToggleLock,
  onDelete,
}: {
  title: string;
  icon: string;
  p: Palette;
  locked: boolean;
  onDuplicate: () => void;
  onToggleLock?: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "0 2px 0 6px", color: p.onSurfaceVariant }}>
      <Icon name={icon} size={20} />
      <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, color: p.onSurface }}>{title}</span>
      <PartMenu p={p} locked={locked} onDuplicate={onDuplicate} onToggleLock={onToggleLock} onDelete={onDelete} />
    </div>
  );
}

/** what a tap can be sent to: nothing, the screen it came from, a web page, or another screen */
function actionOptionsOf(item: Item, frame: Frame | null, frames: Frame[], lang: Lang): SelectOption[] {
  return [
    { key: "none", label: t("none", lang), icon: "block" },
    /* a part that can flip (its def carries the `toggle` prop) swaps looks rather than going anywhere */
    ...(partBySlug(item.component)?.props.some((d) => d.key === "toggle") ? [{ key: "toggle", label: t("toggleTitle", lang), icon: "swap_horiz" }] : []),
    { key: BACK_TARGET, label: t("back", lang), icon: "arrow_back" },
    { key: LINK_TARGET, label: t("openLink", lang), icon: "open_in_new" },
    { key: SCROLL_TO, label: t("prScrollTo", lang), icon: "swap_vert" },
    ...[...frames]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .filter((f) => f.id !== frame?.id)
      .map((f) => ({ key: f.id, label: f.name || t("screen", lang), icon: isPhoneFrame(f) ? "smartphone" : "desktop_windows" })),
  ];
}

/** What the behaviour tab offers an action for: the part's places, its families of places and the events it sends
 *  (lib/partContract.ts), and "the whole part" (key ""): a tap anywhere else on it, or on a place with no action of
 *  its own. A part with no places of its own gets the whole part first, one with places after them. None when it has
 *  nothing but the whole part. */
export function actionOutletsOf(item: Item, lang: Lang): Outlet[] {
  const all = outletsOf(item, lang).map((o) => (o.kind === "slot" ? o : { ...o, icon: o.kind === "event" ? "bolt" : "select_all" }));
  if (!all.length) return all;
  const whole: Outlet = { key: "", kind: "slot", label: t("dzWholePart", lang), icon: "touch_app" };
  return all.some((o) => o.kind === "slot") ? [...all, whole] : [whole, ...all];
}

/** the places a bar can be tapped, as one connected run: the icons at its ends, or the entries
 *  along it, each cell the icon the place shows and a mark when a tap has been sent from it */
export function SlotStrip({ item, selected, onSelect, p }: { item: Item; selected: string; onSelect: (k: string) => void; p: Palette }) {
  const lang = useLang();
  const slots = actionOutletsOf(item, lang);
  /* a tab's words are too long for a cell: the cell carries its number and the words are the hover text */
  const numbered = item.component === "tabs";
  return (
    <Segmented<string>
      options={slots.map((s, i) => ({ key: s.key, icon: s.icon ?? undefined, label: s.icon ? undefined : numbered ? `${i + 1}` : s.label, title: s.label, dot: s.key ? !!item.actions?.[s.key] : !!item.action }))}
      value={selected}
      onChange={onSelect}
      p={p}
      height={40}
      tight={slots.length > 4}
      label={t("tapTo", lang)}
    />
  );
}

/** where a tap goes, with the map or the browser window under it. Parts that cannot be tapped
 *  never see this; the toggle a button can be is handled by the button's own panel. A part made
 *  of several places to tap -- the cards of a carousel -- gives the slot the section is about,
 *  and the whole row of them is drawn above it by the panel. */
export function TriggerSection({
  item,
  frame,
  allFrames,
  selfRect,
  onChange,
  p,
  slot,
  head,
}: {
  item: Item;
  frame: Frame | null;
  allFrames: Frame[];
  selfRect: { x: number; y: number; w: number; h: number } | null;
  onChange: (patch: Partial<Item>) => void;
  p: Palette;
  /** the one place inside the part this is about; the part itself when left out */
  slot?: string;
  /** shown above the controls: which of those places is being set */
  head?: React.ReactNode;
}) {
  const lang = useLang();
  /* a part whose def has a `toggle` prop flips instead of going anywhere: the "toggle" choice is
   *  that prop, shown where the destination would be */
  const toggleable = !slot && partBySlug(item.component)?.props.some((d) => d.key === "toggle");
  const toggles = toggleable && item.props?.toggle === true;
  const action = slot ? item.actions?.[slot] : item.action;
  const set = (next: Action | undefined) => {
    if (!slot) {
      onChange({ action: next });
      return;
    }
    const actions = { ...item.actions };
    if (next) actions[slot] = next;
    else delete actions[slot];
    onChange({ actions: Object.keys(actions).length ? actions : undefined });
  };
  const isLink = action?.to === LINK_TARGET;
  const behavior = useContext(BehaviorContext);
  const scrolls = action?.to === STAY_TARGET && action.scrollTo !== undefined;
  /* where a tap goes is one choice among what it does: changing it leaves its effects and condition be */
  const pick = (k: string) => {
    const { scrollTo: _scroll, overlay: _overlay, ...was } = action ?? { to: STAY_TARGET, transition: "none" as const };
    const stays = action ? tidiedAction({ ...was, to: STAY_TARGET, transition: "none" }) : undefined;
    if (k === SCROLL_TO) {
      /* the first part of the screen that is not this one is where it scrolls to first */
      const first = behavior.groups.flatMap((g) => g.items).find((it) => it.id !== item.id) ?? item;
      set({ ...was, to: STAY_TARGET, transition: "none", scrollTo: first.id });
      return;
    }
    if (toggleable && k === "toggle") {
      onChange({ props: { ...item.props, toggle: true }, action: stays });
      return;
    }
    /* choosing a destination leaves a flip part's toggle off */
    if (toggleable && item.props?.toggle) onChange({ props: { ...item.props, toggle: false } });
    if (k === LINK_TARGET) {
      set({ ...was, to: LINK_TARGET, transition: "none", url: action?.url });
      return;
    }
    if (k === "none") {
      set(stays);
      return;
    }
    const transition = action && action.to !== LINK_TARGET && action.to !== STAY_TARGET ? action.transition : "slide";
    set({ ...was, ...(action?.overlay && k !== BACK_TARGET ? { overlay: true } : {}), to: k, transition });
  };
  const options = actionOptionsOf(item, frame, allFrames, lang);
  return (
    <Section id="part-action" icon="ads_click" title={t("tapTo", lang)} p={p}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {head}
        <Select options={options} value={toggles ? "toggle" : scrolls ? SCROLL_TO : (action?.to ?? "none")} onChange={pick} p={p} label={t("tapTo", lang)} />
        {isLink ? (
          <LinkStage self={frame} selfRect={selfRect} action={action} onChange={set} p={p} />
        ) : scrolls ? null : (
          <TapStage frames={allFrames} self={frame} selfRect={selfRect} action={action} onChange={set} p={p} />
        )}
        <InteractionFields action={action} onChange={set} frames={allFrames} p={p} />
        <ActionExtras action={action} onChange={set} navOptions={options.filter((o) => o.key !== "toggle")} p={p} />
      </div>
    </Section>
  );
}

/** what the part is for, in the author's words, with the model's pen in the corner */
export function NoteSection({ item, ai, onChange, p }: { item: Item; ai: AiHooks; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  return (
    <Section id="part-note" icon="short_text" title={t("partSpec", lang)} p={p}>
      <Field
        value={item.note ?? ""}
        onChange={(note) => onChange({ note })}
        placeholder={t("whenPressedExample", lang)}
        label={t("partSpec", lang)}
        p={p}
        multiline
        grow
        rows={2}
        maxHeight={200}
        aiBusy={ai.busy}
        action={<AiIconBtn ai={ai} p={p} />}
      />
    </Section>
  );
}

/** The colours a part can be, as one connected run of the theme's own roles: each cell is
 *  painted in the role, and the chosen one carries a check mark in the colour that reads on it.
 *  The run wraps onto a second row, since ten roles are more than one row holds. `clearable`
 *  adds an auto cell for a part that has a colour of its own until one is picked. */
export function FillRun({ value, onChange, p, clearable = false }: { value?: ColorToken; onChange: (fill: ColorToken | undefined) => void; p: Palette; clearable?: boolean }) {
  const lang = useLang();
  const auto = { key: "" as const, title: t("autoWidth", lang), node: <Icon name="format_paint" size={20} />, style: { background: p.surfaceContainerHigh, color: p.onSurfaceVariant, border: `1px solid ${p.outlineVariant}`, minWidth: 0, padding: 0 } };
  const rows = [COLOR_TOKENS.slice(0, 5), COLOR_TOKENS.slice(5)];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((row, r) => (
        <Segmented<ColorToken | "">
          key={r}
          options={[
            ...(r === 0 && clearable ? [auto] : []),
            ...row.map((tk) => ({
              key: tk.key as ColorToken | "",
              title: lang === "en" ? tk.label : COLOR_TOKEN_TEXT[lang][tk.key],
              node: tk.key === value ? <Icon name="check" size={20} /> : <span />,
              style: { background: p[tk.key], color: onToken(tk.key, p), border: `1px solid ${p.outlineVariant}`, minWidth: 0, padding: 0 },
            })),
          ]}
          value={value ?? ""}
          onChange={(k) => onChange(k || undefined)}
          p={p}
          label={`${t("style", lang)} ${r + 1}/${rows.length}`}
          tight
        />
      ))}
    </div>
  );
}

/** The colour the words on a part can take, as a run of letters painted in each role. The first
 *  cell is the part's own look, so a chosen colour can be let go of again. */
export function TextRun({ value, onChange, p }: { value?: TextToken; onChange: (text: TextToken | undefined) => void; p: Palette }) {
  const lang = useLang();
  return (
    <Segmented<TextToken | "">
      options={[
        { key: "", title: t("autoWidth", lang), node: <Icon name="format_clear" size={20} />, style: { background: p.surfaceContainerHigh, color: p.onSurfaceVariant, border: `1px solid ${p.outlineVariant}`, minWidth: 0, padding: 0 } },
        ...TEXT_TOKENS.map((tk) => ({
          key: tk.key as TextToken | "",
          title: lang === "en" ? tk.label : TEXT_TOKEN_TEXT[lang][tk.key],
          node: tk.key === value ? <Icon name="check" size={20} /> : <span style={{ fontWeight: 700, fontSize: 15 }}>A</span>,
          style: { background: p.surfaceContainerHigh, color: p[tk.key], border: `1px solid ${p.outlineVariant}`, minWidth: 0, padding: 0 },
        })),
      ]}
      value={value ?? ""}
      onChange={(k) => onChange(k || undefined)}
      p={p}
      label={t("textColor", lang)}
      tight
    />
  );
}

/** Selected parts lined up against each other: to an edge or a centre of what they cover, or spread
 *  out evenly, or with an exact space between them. */
export function LineUp({ onAlign, onDistribute, p }: { onAlign: (how: AlignHow) => void; onDistribute: (axis: "x" | "y", gap?: number) => void; p: Palette }) {
  const lang = useLang();
  const [gap, setGap] = useState(16);
  const cells: { how: AlignHow; icon: string; title: "lineLeft" | "lineCenterH" | "lineRight" | "lineTop" | "lineCenterV" | "lineBottom" }[] = [
    { how: "left", icon: "align_horizontal_left", title: "lineLeft" },
    { how: "centerH", icon: "align_horizontal_center", title: "lineCenterH" },
    { how: "right", icon: "align_horizontal_right", title: "lineRight" },
    { how: "top", icon: "align_vertical_top", title: "lineTop" },
    { how: "centerV", icon: "align_vertical_center", title: "lineCenterV" },
    { how: "bottom", icon: "align_vertical_bottom", title: "lineBottom" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
        {cells.map((c) => (
          <IconBtn key={c.how} icon={c.icon} p={p} size={36} onClick={() => onAlign(c.how)} title={t(c.title, lang)} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <IconBtn icon="horizontal_distribute" p={p} size={36} onClick={() => onDistribute("x")} title={t("distributeH", lang)} />
        <IconBtn icon="vertical_distribute" p={p} size={36} onClick={() => onDistribute("y")} title={t("distributeV", lang)} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: p.onSurfaceVariant }}>{t("exactGap", lang)}</span>
        <Num value={gap} min={0} max={400} title={t("exactGap", lang)} onChange={setGap} p={p} />
        <IconBtn icon="arrow_range" p={p} size={36} onClick={() => onDistribute("x", gap)} title={t("gapAcross", lang)} />
        <IconBtn icon="height" p={p} size={36} onClick={() => onDistribute("y", gap)} title={t("gapDown", lang)} />
      </div>
    </div>
  );
}

/** where a part stands on its screen, in numbers */
export function PositionRow({ x, y, onMove, p }: { x: number; y: number; onMove: (x: number, y: number) => void; p: Palette }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant }}>X</span>
      <Num value={x} min={-9999} max={9999} title="X" lazy onChange={(v) => onMove(v, y)} p={p} />
      <span style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant }}>Y</span>
      <Num value={y} min={-9999} max={9999} title="Y" lazy onChange={(v) => onMove(x, v)} p={p} />
    </div>
  );
}

/** The corners of a part: one slider for all four, and each on its own on a drawing of the part.
 *  They hold the component's own radius (`seed`) until the author moves one; the row under the
 *  slider gives that own radius back. */
export function AppearanceCorners({ item, seed, onChange, p }: { item: Item; seed: number; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const corners = item.corners;
  const even = !corners || (corners.tl === corners.tr && corners.tr === corners.br && corners.br === corners.bl);
  const [each, setEach] = useState(!even);
  const shown = corners ? (even ? corners.tl : Math.round((corners.tl + corners.tr + corners.br + corners.bl) / 4)) : Math.min(seed, CORNER_MAX);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Slider icon="rounded_corner" title={t("corners", lang)} value={shown} min={0} max={CORNER_MAX} step={1} onChange={(v) => onChange({ corners: uniformRadii(v) })} p={p} />
      <Toggle
        on={each}
        onChange={(on) => {
          setEach(on);
          if (on && !corners) onChange({ corners: uniformRadii(shown) });
          if (!on && corners) onChange({ corners: uniformRadii(shown) });
        }}
        p={p}
        label={t("cornersEach", lang)}
        grow
      />
      {each && corners && <CornerStage item={item} corners={corners} max={CORNER_MAX} onChange={(c) => onChange({ corners: c })} p={p} />}
      {corners && (
        <button
          className="m3-press"
          onClick={() => {
            setEach(false);
            onChange({ corners: undefined });
          }}
          style={{ height: 36, borderRadius: 18, border: `1px solid ${p.outlineVariant}`, background: "transparent", color: p.onSurfaceVariant, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {t("cornersReset", lang)}
        </button>
      )}
    </div>
  );
}

/** The widths a screen is built from, as one connected run. The names carry the meaning, so the
 *  cells stay plain words. */
export function WidthRun({ value, onChange, frameW, p, height }: { value: number | undefined; onChange: (size: number | undefined) => void; frameW: number; p: Palette; height?: number }) {
  const lang = useLang();
  const cells: { key: string; size: number; label: string }[] = [
    { key: "half", size: halfWidth(frameW), label: t("halfWidth", lang) },
    { key: "content", size: contentWidth(frameW), label: t("contentWidth", lang) },
    { key: "screen", size: frameW, label: t("screenWidth", lang) },
  ];
  return (
    <Segmented<string>
      /* the cell carries the word; hovering says the dp it comes to on this screen */
      options={cells.map((c) => ({ key: c.key, label: c.label, title: `${c.size}dp`, style: RUN_CELL }))}
      value={cells.find((c) => c.size === value)?.key ?? ""}
      onChange={(k) => onChange(cells.find((c) => c.key === k)?.size)}
      p={p}
      label={t("width", lang)}
      height={height}
      tight
    />
  );
}

/** the width of a part on the slider, with the run of a screen's widths under it */
export function WidthRows({ value, min, max, step = 4, frameW, onChange, p }: { value: number; min: number; max: number; step?: number; frameW: number; onChange: (size: number | undefined) => void; p: Palette }) {
  const lang = useLang();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Slider icon="width" title={t("width", lang)} value={value} min={Math.min(min, value)} max={Math.max(frameW, max)} step={step} onChange={(v) => onChange(v)} p={p} />
      <WidthRun value={value} onChange={onChange} frameW={frameW} p={p} />
    </div>
  );
}

/** a cell that shows an icon and opens the picker for it; empty, it offers to add one */
function IconCell({ icon, open, title, onClick, p }: { icon: string | null; open: boolean; title: string; onClick: () => void; p: Palette }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-expanded={open}
      className="m3-press"
      style={{
        width: 44,
        height: 44,
        flex: "0 0 auto",
        borderRadius: 22,
        border: icon || open ? "none" : `1.5px dashed ${p.outline}`,
        background: open ? p.primary : icon ? p.surfaceContainerHigh : "transparent",
        color: open ? p.onPrimary : icon ? p.onSurface : p.outline,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      {icon ? <Icon name={icon} size={22} /> : <Icon name="add" size={20} />}
    </button>
  );
}

/** The icons a part carries at its two ends -- or the one it carries -- each a cell that opens
 *  the picker in place. */
export function IconRow({ slots, onPick, p }: { slots: { key: string; value: string | null; title: string }[]; onPick: (key: string, icon: string | null) => void; p: Palette }) {
  const [open, setOpen] = useState<string | null>(null);
  const picked = slots.find((s) => s.key === open) ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {slots[0] && <IconCell icon={slots[0].value} open={open === slots[0].key} title={slots[0].title} onClick={() => setOpen(open === slots[0].key ? null : slots[0].key)} p={p} />}
        <span style={{ flex: 1 }} />
        {slots[1] && <IconCell icon={slots[1].value} open={open === slots[1].key} title={slots[1].title} onClick={() => setOpen(open === slots[1].key ? null : slots[1].key)} p={p} />}
      </div>
      {picked && <IconPicker value={picked.value} onChange={(icon) => onPick(picked.key, icon)} onClose={() => setOpen(null)} palette={p} />}
    </div>
  );
}

/** The rows of a list prop -- a bar's destinations, a menu's items, a tab row's tabs -- one row
 *  each, dragged by the handle at the start of its words. Carrying a row down onto the button that
 *  adds entries turns that button into the one that takes this one out, so there is nothing to
 *  delete with until something is being dragged. */
export function EntryList({
  id,
  tabs,
  bounds,
  spare,
  onChange,
  p,
  icons = true,
  images = false,
  fields,
}: {
  /** the part the rows belong to: another part starts the row names over */
  id: string;
  tabs: NavTab[];
  bounds: { min: number; max: number };
  /** where a row the author adds comes from */
  spare: NavTab[];
  /** the rows as they now are; `order` holds, for each, the index it had (-1 for a new one) */
  onChange: (tabs: NavTab[], order: number[]) => void;
  p: Palette;
  /** each entry has an icon */
  icons?: boolean;
  /** each entry has a picture of its own, under its words (a carousel's slide) */
  images?: boolean;
  /** one more choice per row, as a small run under its words (a button group's per-row variant) */
  fields?: { key: string; label: string; options: { key: string; label: string }[] }[];
}) {
  const lang = useLang();
  /* the row whose icon is being picked, by the name the row keeps through a reorder */
  const [pick, setPick] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [overBin, setOverBin] = useState(false);
  const bin = useRef<HTMLButtonElement | null>(null);
  /* a name per row that survives a reorder, so the list knows which row moved where. Rows are
   * named as they appear, never during render, and a list that came back a different length
   * or from a different part starts its names over. */
  const keys = useRef<{ id: string; names: string[] }>({ id, names: [] });
  if (keys.current.id !== id) keys.current = { id, names: [] };
  const named = useRef(0);
  while (keys.current.names.length < tabs.length) keys.current.names.push(`e${named.current++}`);
  if (keys.current.names.length > tabs.length) keys.current.names.length = tabs.length;
  const names = keys.current.names;
  const picked = pick === null ? -1 : names.indexOf(pick);
  const same = tabs.map((_, j) => j);
  const set = (i: number, patch: Partial<NavTab>) => onChange(tabs.map((t, j) => (j === i ? { ...t, ...patch } : t)), same);
  const onBin = (e: { clientX: number; clientY: number }) => {
    const r = bin.current?.getBoundingClientRect();
    return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8;
  };
  const canAdd = tabs.length < bounds.max;
  const canRemove = tabs.length > bounds.min;
  const reorder = (next: string[]) => {
    const order = next.map((k) => names.indexOf(k));
    keys.current.names = next;
    onChange(order.map((j) => ({ ...tabs[j] })), order);
  };
  const remove = (i: number) => {
    if (pick === names[i]) setPick(null);
    keys.current.names = names.filter((_, j) => j !== i);
    onChange(tabs.filter((_, j) => j !== i), same.filter((j) => j !== i));
  };
  /* after a key moved or removed a row, focus stays with it or goes to the row that takes its
   * place, so a second Delete does not reach the part itself */
  const list = useRef<HTMLUListElement | null>(null);
  const focusHandle = (i: number) =>
    requestAnimationFrame(() => {
      const handles = list.current?.querySelectorAll<HTMLElement>("[data-entry-handle]");
      handles?.[Math.min(i, handles.length - 1)]?.focus();
    });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Reorder.Group
        ref={list}
        axis="y"
        values={names}
        onReorder={reorder}
        style={{ display: "flex", flexDirection: "column", gap: 6, padding: 0, margin: 0 }}
      >
        {tabs.map((tab, i) => (
          <EntryRow
            key={names[i]}
            id={names[i]}
            tab={tab}
            icons={icons}
            open={pick === names[i]}
            onPick={() => setPick(pick === names[i] ? null : names[i])}
            onLabel={(label) => set(i, { label })}
            onImage={images ? (image) => set(i, { image }) : undefined}
            fields={fields}
            onField={(key, v) => set(i, { [key]: v } as Partial<NavTab>)}
            onDragStart={() => setDragging(i)}
            onDrag={(e) => setOverBin(canRemove && onBin(e))}
            onDragEnd={(e) => {
              const drop = canRemove && onBin(e);
              setDragging(null);
              setOverBin(false);
              if (drop) remove(i);
            }}
            onMove={(d) => {
              const at = i + d;
              if (at < 0 || at >= names.length) return;
              const next = [...names];
              [next[i], next[at]] = [next[at], next[i]];
              reorder(next);
              focusHandle(at);
            }}
            onRemove={() => {
              if (!canRemove) return;
              remove(i);
              focusHandle(i);
            }}
            p={p}
          />
        ))}
      </Reorder.Group>
      {picked >= 0 && tabs[picked] && (
        <IconPicker value={tabs[picked].icon || null} onChange={(icon) => set(picked, { icon: icon ?? "" })} onClose={() => setPick(null)} palette={p} />
      )}
      {(canAdd || dragging !== null) && (
        <button
          ref={bin}
          disabled={!canAdd && dragging === null}
          onClick={() => {
            if (!canAdd) return;
            onChange([...tabs, { ...spare[tabs.length % spare.length] }], [...same, -1]);
          }}
          className="m3-press"
          style={{
            height: 44,
            borderRadius: 22,
            border: `1px ${dragging !== null ? "dashed" : "solid"} ${overBin ? p.error : dragging !== null ? (canRemove ? p.error : p.outlineVariant) : p.outline}`,
            background: overBin ? p.errorContainer : "transparent",
            color: dragging !== null ? (canRemove ? p.error : p.outline) : p.primary,
            fontSize: 13,
            fontWeight: 600,
            cursor: dragging !== null ? "copy" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "background 120ms, color 120ms, border-color 120ms",
          }}
        >
          <Icon name={dragging !== null ? "delete" : "add"} size={18} />
          {t(dragging !== null ? "dropToRemove" : "addTab", lang)}
        </button>
      )}
    </div>
  );
}

/** one entry: the handle at the start of its words, the words, and the icon beside them */
function EntryRow({
  id,
  tab,
  icons,
  open,
  onPick,
  onLabel,
  onImage,
  fields,
  onField,
  onDragStart,
  onDrag,
  onDragEnd,
  onMove,
  onRemove,
  p,
}: {
  id: string;
  tab: NavTab;
  icons: boolean;
  open: boolean;
  onPick: () => void;
  onLabel: (v: string) => void;
  onImage?: (v: string | undefined) => void;
  fields?: { key: string; label: string; options: { key: string; label: string }[] }[];
  onField?: (key: string, v: string) => void;
  onDragStart: () => void;
  onDrag: (e: { clientX: number; clientY: number }) => void;
  onDragEnd: (e: { clientX: number; clientY: number }) => void;
  onMove: (by: 1 | -1) => void;
  onRemove: () => void;
  p: Palette;
}) {
  const lang = useLang();
  const controls = useDragControls();
  const handle = (
    <span
      data-entry-handle
      role="button"
      tabIndex={0}
      aria-label={t("reorder", lang)}
      aria-keyshortcuts="ArrowUp ArrowDown Delete"
      onPointerDown={(e) => {
        e.preventDefault();
        controls.start(e);
      }}
      onKeyDown={(e) => {
        const act = e.key === "ArrowUp" ? () => onMove(-1) : e.key === "ArrowDown" ? () => onMove(1) : e.key === "Delete" || e.key === "Backspace" ? onRemove : null;
        if (!act) return;
        /* the key is the row's own: the canvas shortcuts behind the panel do not hear it */
        e.preventDefault();
        e.stopPropagation();
        act();
      }}
      title={t("reorder", lang)}
      style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 38, cursor: "grab", touchAction: "none" }}
    />
  );
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDrag={(e) => onDrag(e as PointerEvent)}
      onDragEnd={(e) => onDragEnd(e as PointerEvent)}
      style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 4, position: "relative" }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", position: "relative", width: "100%" }}>
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <Field value={tab.label} onChange={onLabel} placeholder={t("label", lang)} p={p} icon="drag_indicator" height={44} />
        {/* the handle sits where the field draws its mark, and is the only thing that drags */}
        {handle}
      </div>
      {icons && <IconCell icon={tab.icon || null} open={open} title={t("changeIcon", lang)} onClick={onPick} p={p} />}
      </div>
      {onImage && <ImageRow value={tab.image} onChange={onImage} p={p} />}
      {fields?.map((f) => {
        const value = (tab[f.key as keyof NavTab] as string | undefined) || f.options[0]?.key || "";
        /* a button's own variant is six style names; they do not fit one row, so that
           choice is a select. Short width words still sit side by side. */
        if (segmentedFits(f.options.map((o) => o.label))) {
          return (
            <Segmented<string>
              key={f.key}
              options={f.options}
              value={value}
              onChange={(v) => onField?.(f.key, v)}
              p={p}
              height={28}
              tight
              label={f.label}
            />
          );
        }
        return (
          <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px" }}>{f.label}</div>
            <Select options={f.options} value={value} onChange={(v) => onField?.(f.key, v)} p={p} label={f.label} />
          </div>
        );
      })}
    </Reorder.Item>
  );
}

/** a number typed into a small box: it follows the field while the number is in range and settles
 *  when the field is left, the way the slider's own number does. It keeps the precision of its
 *  `step` (lib/numbers.ts): whole numbers by default, a prop's own step, or what was typed ("any")
 *  for a value with no step of its own, a variable's say. */
export function Num({ value, min, max, title, onChange, p, lazy, step = 1 }: { value: number; min: number; max: number; title: string; onChange: (v: number) => void; p: Palette; /** only once the number is finished: for what is costly to change, or wrong halfway through */ lazy?: boolean; step?: Step }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);
  const commit = () => {
    const n = typedNumber(text, step);
    if (n !== undefined && Math.max(min, Math.min(max, n)) !== value) onChange(Math.max(min, Math.min(max, n)));
    setEditing(false);
    setText(String(value));
  };
  return (
    <input
      type="number"
      inputMode={decimalsOf(step) === 0 ? "numeric" : "decimal"}
      aria-label={title}
      title={title}
      min={min}
      max={max}
      step={inputStep(step)}
      value={editing ? text : String(value)}
      onFocus={(e) => {
        setEditing(true);
        setText(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        if (lazy) return;
        const n = typedNumber(e.target.value, step);
        if (n !== undefined && n >= min && n <= max) onChange(n);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(String(value));
          e.currentTarget.blur();
        }
      }}
      className="m3-number"
      style={{
        width: 48,
        height: 28,
        padding: "0 6px",
        borderRadius: 8,
        border: "none",
        background: p.surfaceContainerHigh,
        color: p.onSurface,
        fontSize: 12,
        fontWeight: 600,
        textAlign: "center",
        fontVariantNumeric: "tabular-nums",
        fontFamily: "inherit",
        outline: editing ? `2px solid ${p.primary}` : "none",
        outlineOffset: -1,
        boxSizing: "border-box",
      }}
    />
  );
}

const CORNER_KEYS = ["tl", "tr", "bl", "br"] as const;
type CornerKey = (typeof CORNER_KEYS)[number];
const CORNER_TEXT: Record<CornerKey, "cornerTl" | "cornerTr" | "cornerBl" | "cornerBr"> = { tl: "cornerTl", tr: "cornerTr", bl: "cornerBl", br: "cornerBr" };
/** the tallest the drawing of the part is; the widest is the stage it stands on */
const SHAPE_MAX_H = 104;
const SHAPE_MIN = 56;
const HANDLE = 14;

/** The part drawn small on a stage of its own, the way the trigger tab draws a screen, with each
 *  corner's number beside it and a handle on the corner itself. A handle sits where the corner's
 *  arc is centred, so pulling it in along the diagonal rounds the corner under the finger. */
function CornerStage({ item, corners, max, onChange, p }: { item: Item; corners: Radii; max: number; onChange: (c: Radii) => void; p: Palette }) {
  const lang = useLang();
  const stage = useRef<HTMLDivElement | null>(null);
  const shape = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  /* the drawing keeps the part's own proportions, so a wide box reads as a wide box */
  const { w: dpW, h: dpH } = sizeOf(item, {});
  const maxW = Math.max(SHAPE_MIN, (avail || 220) - 24);
  const k = Math.min(maxW / Math.max(1, dpW), SHAPE_MAX_H / Math.max(1, dpH));
  const w = Math.max(SHAPE_MIN, Math.round(dpW * k));
  const h = Math.max(SHAPE_MIN, Math.round(dpH * k));
  /* radii are scaled with the drawing, so the picture is the part, not a diagram of it */
  const scale = w / Math.max(1, dpW);
  const px = (r: number) => Math.round(r * scale);
  const set = (key: CornerKey, r: number) => onChange({ ...corners, [key]: Math.max(0, Math.min(max, Math.round(r))) });

  const drag = (key: CornerKey) => (e: React.PointerEvent<HTMLSpanElement>) => {
    const box = shape.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    /* the corner the handle belongs to, and which way "in" is from it */
    const cx = key === "tl" || key === "bl" ? box.left : box.right;
    const cy = key === "tl" || key === "tr" ? box.top : box.bottom;
    const sx = key === "tl" || key === "bl" ? 1 : -1;
    const sy = key === "tl" || key === "tr" ? 1 : -1;
    const move = (ev: PointerEvent) => {
      const inset = Math.min((ev.clientX - cx) * sx, (ev.clientY - cy) * sy);
      set(key, inset / scale);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const num = (key: CornerKey) => <Num value={corners[key]} min={0} max={max} title={t(CORNER_TEXT[key], lang)} onChange={(v) => set(key, v)} p={p} />;
  const handle = (key: CornerKey) => {
    const r = px(corners[key]);
    const at: React.CSSProperties = {
      left: key === "tl" || key === "bl" ? r - HANDLE / 2 : undefined,
      right: key === "tr" || key === "br" ? r - HANDLE / 2 : undefined,
      top: key === "tl" || key === "tr" ? r - HANDLE / 2 : undefined,
      bottom: key === "bl" || key === "br" ? r - HANDLE / 2 : undefined,
    };
    return (
      <span
        key={key}
        aria-hidden
        onPointerDown={drag(key)}
        style={{
          position: "absolute",
          ...at,
          width: HANDLE,
          height: HANDLE,
          borderRadius: HANDLE / 2,
          background: p.primary,
          border: `2px solid ${p.surface}`,
          boxSizing: "border-box",
          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
          cursor: key === "tl" || key === "br" ? "nwse-resize" : "nesw-resize",
          touchAction: "none",
        }}
      />
    );
  };

  return (
    <div ref={stage} style={{ flex: 1, minWidth: 0, background: p.surfaceContainerLow, borderRadius: 12, padding: "8px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
        {num("tl")}
        {num("tr")}
      </div>
      <div
        ref={shape}
        style={{
          position: "relative",
          width: w,
          height: h,
          /* the part's own colour, drawn without the picture that may be on it */
          background: p.surfaceContainerHighest,
          border: `1.5px solid ${p.outline}`,
          boxSizing: "border-box",
          borderRadius: `${px(corners.tl)}px ${px(corners.tr)}px ${px(corners.br)}px ${px(corners.bl)}px`,
        }}
      >
        {CORNER_KEYS.map(handle)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
        {num("bl")}
        {num("br")}
      </div>
    </div>
  );
}

