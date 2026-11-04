
import {
  Frame,
  FramePreset,
  Item,
  Palette,
  TRANSITIONS,
  Transition,
  framePresetOf,
} from "@/lib/tokens";
import { ComponentInspector } from "./ComponentInspector";
import { AlignBox, PartMenu, PlaceFn } from "./PartPanel";
import { Icon } from "./Icon";
import { PanelShell, Section, Segmented } from "./ui";
import { TRANSITION_TEXT, t, useLang } from "@/lib/i18n";

export function FrameSizePicker({
  frame,
  palette: p,
  onChange,
  compact,
}: {
  frame: Frame;
  palette: Palette;
  onChange: (preset: FramePreset) => void;
  compact?: boolean;
}) {
  const lang = useLang();
  return (
    <Segmented<FramePreset>
      options={[
        { key: "phone", icon: "smartphone", label: compact ? undefined : t("phoneFrame", lang), title: t("phoneFrame", lang) },
        { key: "desktop", icon: "desktop_windows", label: compact ? undefined : t("desktopFrame", lang), title: t("desktopFrame", lang) },
      ]}
      value={framePresetOf(frame)}
      onChange={onChange}
      p={p}
      height={compact ? 36 : 40}
      grow={!compact}
    />
  );
}

export function TransitionPicker({ value, onChange, p }: { value: Transition; onChange: (t: Transition) => void; p: Palette }) {
  const lang = useLang();
  return (
    <Segmented<Transition>
      options={TRANSITIONS.map((tr) => ({ key: tr.key, icon: tr.icon, title: TRANSITION_TEXT[lang][tr.key] }))}
      value={value}
      onChange={onChange}
      p={p}
      height={34}
    />
  );
}

/** what a field's AI button needs from the page; `reason` explains a disabled button */
export type AiHooks = { ready: boolean; reason?: string; busy: boolean; onRun: () => void; onCancel: () => void };

/** The panel for several parts at once, or for one hand-made group. It wears the chrome a
 *  part's panel does -- the title row with its menu, then short sections -- and holds only what
 *  a selection has: lining its parts up, and making or breaking the group. */
function GroupPanel({
  p,
  count,
  grouped,
  locked,
  onToggleLock,
  onDuplicate,
  onDelete,
  onGroup,
  onUngroup,
  onPlace,
  selectionKey,
}: {
  p: Palette;
  count: number;
  grouped: boolean;
  locked: boolean;
  onToggleLock?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onPlace?: PlaceFn;
  /** names the selection, so the spot picked for one is not shown lit for the next */
  selectionKey: string;
}) {
  const lang = useLang();
  const title = grouped ? t("group", lang) : lang === "en" ? `${count} ${t("selectedParts", lang)}` : `${count}${t("selectedParts", lang)}`;
  const toggle = grouped ? onUngroup : onGroup;
  return (
    <PanelShell
      p={p}
      locked={locked}
      onUnlock={onToggleLock}
      head={
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "0 2px 0 6px", color: p.onSurfaceVariant }}>
          <Icon name={grouped ? "group_work" : "select_all"} size={20} />
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, color: p.onSurface }}>{title}</span>
          <PartMenu p={p} locked={locked} onDuplicate={onDuplicate} onToggleLock={onToggleLock} onDelete={onDelete} deleteLabel={t("deleteSelection", lang)} />
        </div>
      }
    >
      {onPlace && (
        <Section id="group-align" icon="grid_on" title={t("align", lang)} p={p}>
          <AlignBox key={selectionKey} onPlace={onPlace} p={p} />
        </Section>
      )}
      {/* the header already names the group, so the button that makes or breaks it stands under the sections without a title of its own */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 4px" }}>
        <button
          onClick={toggle}
          className="m3-press"
          style={{
            height: 44,
            borderRadius: 22,
            border: "none",
            background: p.secondaryContainer,
            color: p.onSecondaryContainer,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
          }}
        >
          <Icon name={grouped ? "ungroup" : "group_work"} size={20} />
          {t(grouped ? "ungroup" : "makeGroup", lang)}
        </button>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px", textWrap: "pretty" }}>{t(grouped ? "groupEditNote" : "groupHint", lang)}</div>
      </div>
    </PanelShell>
  );
}

export function Inspector({
  ai,
  item,
  palette: p,
  frames,
  frame,
  onChange,
  onDelete,
  onDuplicate,
  locked,
  onToggleLock,
  multi,
  grouped,
  selectionWhole,
  selectionKey,
  onGroup,
  onUngroup,
  onPlace,
  selfRect,
  allFrames,
}: {
  /** the AI button beside the behavior field */
  ai: AiHooks;
  item: Item | null;
  palette: Palette;
  frames: Frame[];
  /** frame containing the selected part; its dimensions bound size controls */
  frame?: Frame | null;
  onChange: (patch: Partial<Item>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** every group holding the selection is locked */
  locked?: boolean;
  onToggleLock?: () => void;
  multi: number;
  /** the selection is exactly one hand-made group */
  grouped?: boolean;
  /** the selection covers every group it touches, so a lock on it holds nothing more */
  selectionWhole?: boolean;
  /** the selected ids, joined: tells one multi-selection from the next */
  selectionKey?: string;
  onGroup?: () => void;
  onUngroup?: () => void;
  /** puts the selection at one of nine spots in its screen's body, clear of the parts already there */
  onPlace?: (col: "left" | "centerH" | "right", row: "top" | "centerV" | "bottom") => void;
  /** where the selected part sits on the canvas, for the tap map */
  selfRect?: { x: number; y: number; w: number; h: number } | null;
  /** every screen on the canvas, whatever the frame mode; the tap map draws them all */
  allFrames?: Frame[];
}) {
  if (!item) {
    if (multi > 1) {
      return (
        <GroupPanel
          p={p}
          count={multi}
          grouped={!!grouped}
          locked={!!locked}
          /* a loose selection locks only when that locks nothing more than it; a lock already on can always come off */
          onToggleLock={locked || selectionWhole ? onToggleLock : undefined}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onGroup={onGroup}
          onUngroup={onUngroup}
          onPlace={onPlace}
          selectionKey={selectionKey ?? ""}
        />
      );
    }
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          color: p.outlineVariant,
          padding: 24,
          textAlign: "center",
        }}
      >
        <Icon name="ads_click" size={44} />
      </div>
    );
  }

  return (
    <ComponentInspector
      ai={ai}
      item={item}
      palette={p}
      frame={frame ?? null}
      onChange={onChange}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      locked={locked}
      onToggleLock={onToggleLock}
      onPlace={onPlace}
      selfRect={selfRect ?? null}
      allFrames={allFrames ?? frames}
    />
  );
}
