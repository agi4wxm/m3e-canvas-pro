import { useContext } from "react";
import { BACK_TARGET, STAY_TARGET, type Action, type Frame, type Motion, type Palette } from "@/lib/tokens";
import { motionOf, triggerOf, withMotion } from "@/lib/prototype";
import { t, useLang, type UIKey } from "@/lib/i18n";
import { partBySlug } from "@/parts/registry";
import { labelOfPart } from "@/parts/resize";
import { nameOf } from "@/parts/labels";
import { BehaviorContext } from "./EffectsPanel";
import { Icon } from "./Icon";
import { Num } from "./PartPanel";
import { Field, IconBtn, Section, Segmented, Select, Toggle } from "./ui";

/* An interaction the way Figma's prototype panel has it: what starts it (a tap, the pointer coming over the part, a
 * delay), whether the screen it goes to lays over the one on show, and how it comes in (an animation with a direction,
 * an easing and a duration). The same fields in the part's Prototype tab and on the canvas, in the box that opens on a
 * connection. They change the action they are given and hand it back whole (lib/prototype.ts). */

const TRIGGERS: { key: "tap" | "hover" | "delay"; text: UIKey; icon: string }[] = [
  { key: "tap", text: "prOnTap", icon: "touch_app" },
  { key: "hover", text: "prOnHover", icon: "mouse" },
  { key: "delay", text: "prAfterDelay", icon: "timer" },
];

const KINDS: { key: Motion["kind"]; text: UIKey; icon: string }[] = [
  { key: "instant", text: "prInstant", icon: "bolt" },
  { key: "dissolve", text: "prDissolve", icon: "blur_on" },
  { key: "move", text: "prMove", icon: "input" },
  { key: "push", text: "prPush", icon: "double_arrow" },
  { key: "slide", text: "prSlide", icon: "slideshow" },
];

const DIRS: { key: NonNullable<Motion["dir"]>; icon: string; text: UIKey }[] = [
  { key: "left", icon: "arrow_back", text: "prFromRight" },
  { key: "right", icon: "arrow_forward", text: "prFromLeft" },
  { key: "up", icon: "arrow_upward", text: "prFromBottom" },
  { key: "down", icon: "arrow_downward", text: "prFromTop" },
];

const EASINGS: { key: NonNullable<Motion["easing"]>; text: UIKey }[] = [
  { key: "out", text: "prEaseOut" },
  { key: "in", text: "prEaseIn" },
  { key: "inOut", text: "prEaseInOut" },
  { key: "linear", text: "prLinear" },
  { key: "spring", text: "prSpring" },
];

const label = (p: Palette): React.CSSProperties => ({ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px" });

/** what starts an interaction: a tap, the pointer, or a delay of so many milliseconds */
export function TriggerField({ action, onChange, p }: { action: Action; onChange: (a: Action) => void; p: Palette }) {
  const lang = useLang();
  const trig = triggerOf(action);
  return (
    <div data-trigger={trig.on} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Select
        options={TRIGGERS.map((x) => ({ key: x.key, label: t(x.text, lang), icon: x.icon }))}
        value={trig.on}
        onChange={(k) => {
          const { trigger: _was, ...rest } = action;
          onChange(k === "tap" ? rest : k === "hover" ? { ...rest, trigger: { on: "hover" } } : { ...rest, trigger: { on: "delay", ms: 800 } });
        }}
        p={p}
        label={t("prTrigger", lang)}
      />
      {trig.on === "delay" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...label(p), flex: 1 }}>{t("prDelay", lang)}</span>
          <Num value={trig.ms} min={0} max={10000} title={t("prDelay", lang)} onChange={(ms) => onChange({ ...action, trigger: { on: "delay", ms } })} p={p} />
        </div>
      )}
    </div>
  );
}

/** how the screen an interaction goes to comes in */
export function MotionField({ action, onChange, p }: { action: Action; onChange: (a: Action) => void; p: Palette }) {
  const lang = useLang();
  const m = motionOf(action);
  const put = (patch: Partial<Motion>) => {
    const next: Motion = { ...m, ...patch };
    /* a kind that moves needs a side to come from; one that does not, none of the rest */
    if (next.kind === "move" || next.kind === "push" || next.kind === "slide") next.dir = next.dir ?? "left";
    else delete next.dir;
    if (next.kind === "instant") {
      delete next.easing;
      delete next.ms;
    }
    onChange(withMotion(action, next));
  };
  const moving = m.kind === "move" || m.kind === "push" || m.kind === "slide";
  return (
    <div data-motion={m.kind} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Select options={KINDS.map((x) => ({ key: x.key, label: t(x.text, lang), icon: x.icon }))} value={m.kind} onChange={(k) => put({ kind: k as Motion["kind"] })} p={p} label={t("prAnimation", lang)} />
      {moving && <Segmented<string> options={DIRS.map((d) => ({ key: d.key, icon: d.icon, title: t(d.text, lang) }))} value={m.dir ?? "left"} onChange={(k) => put({ dir: k as Motion["dir"] })} p={p} height={32} label={t("prDirection", lang)} />}
      {m.kind !== "instant" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Select options={EASINGS.map((x) => ({ key: x.key, label: t(x.text, lang) }))} value={m.easing ?? "out"} onChange={(k) => put({ easing: k as Motion["easing"] })} p={p} label={t("prEasing", lang)} height={36} />
          </div>
          {m.easing !== "spring" && <Num value={m.ms ?? 300} min={0} max={10000} title={t("prDuration", lang)} onChange={(ms) => put({ ms })} p={p} />}
        </div>
      )}
    </div>
  );
}

/** What an interaction does beyond where it goes, under the destination: the trigger, the screen laid over the one on
 *  show, the part to scroll to, and the animation. */
export function InteractionFields({ action, onChange, frames, p }: { action: Action | undefined; onChange: (a: Action | undefined) => void; frames: Frame[]; p: Palette }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  if (!action) return null;
  const toScreen = frames.some((f) => f.id === action.to);
  const parts = b.groups.flatMap((g) => g.items.map((it) => ({ key: it.id, label: (g.items.length === 1 && g.name) || labelOfPart(partBySlug(it.component), it.props) || nameOf(partBySlug(it.component) ?? { slug: "", name: it.label }, lang), icon: partBySlug(it.component)?.icon ?? "widgets" })));
  return (
    <div data-interaction style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={label(p)}>{t("prTrigger", lang)}</div>
      <TriggerField action={action} onChange={onChange} p={p} />
      {toScreen && <Toggle on={!!action.overlay} onChange={(on) => onChange({ ...action, overlay: on || undefined })} p={p} label={t("prOverlay", lang)} grow />}
      {action.to === STAY_TARGET && action.scrollTo !== undefined && (
        <>
          <div style={label(p)}>{t("prScrollTarget", lang)}</div>
          <Select options={parts} value={action.scrollTo} onChange={(scrollTo) => onChange({ ...action, scrollTo })} p={p} label={t("prScrollTarget", lang)} />
        </>
      )}
      {(toScreen || action.to === BACK_TARGET) && (
        <>
          <div style={label(p)}>{t("prAnimation", lang)}</div>
          <MotionField action={action} onChange={onChange} p={p} />
        </>
      )}
    </div>
  );
}

/** The box that opens on a connection selected on the canvas: where it goes and how, what starts it, and the way to
 *  take it out. The action is the first of the taps the line stands for; a change goes to each of them. */
export function ConnectionBox({ action, frames, onChange, onRemove, p }: { action: Action; frames: Frame[]; onChange: (a: Action) => void; onRemove: () => void; p: Palette }) {
  const lang = useLang();
  const screens = frames.map((f) => ({ key: f.id, label: f.name || t("screen", lang), icon: "smartphone" }));
  return (
    <div data-connection-box style={{ width: 248, display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 20, background: p.surfaceContainerLow, boxShadow: "0 6px 24px rgba(0,0,0,0.18)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: p.onSurface }}>
        <Icon name="bolt" size={18} color={p.primary} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{t("prInteraction", lang)}</span>
        <IconBtn icon="link_off" p={p} danger size={32} onClick={onRemove} title={t("prRemove", lang)} />
      </div>
      <TriggerField action={action} onChange={onChange} p={p} />
      <div style={label(p)}>{t("prAction", lang)}</div>
      <Segmented<string>
        options={[
          { key: "go", label: t("prNavigate", lang), icon: "arrow_forward" },
          { key: "overlay", label: t("prOverlay", lang), icon: "layers" },
        ]}
        value={action.overlay ? "overlay" : "go"}
        onChange={(k) => onChange({ ...action, overlay: k === "overlay" || undefined })}
        p={p}
        height={32}
        label={t("prAction", lang)}
      />
      <Select options={screens} value={action.to} onChange={(to) => onChange({ ...action, to })} p={p} label={t("prNavigate", lang)} height={36} />
      {!action.overlay && <MotionField action={action} onChange={onChange} p={p} />}
    </div>
  );
}

/** what a destination select offers beyond screens, back and a link: scrolling to a part of the screen on show */
export const SCROLL_TO = "scroll";

/** On a screen: whether a flow of the prototype starts there, and under what name. The preview offers each flow. */
export function FlowStartSection({ frame, flowCount, onChange, p }: { frame: Frame; flowCount: number; onChange: (patch: Partial<Frame>) => void; p: Palette }) {
  const lang = useLang();
  const on = typeof frame.flow === "string";
  const nth = flowCount + 1;
  return (
    <Section id="frame-flow" icon="play_circle" title={t("prFlowStart", lang)} p={p}>
      <div data-flow-start style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Toggle on={on} onChange={(v) => onChange({ flow: v ? t("prFlowNth", lang).replace("{n}", String(nth)) : undefined })} p={p} label={t(on ? "prRemoveFlow" : "prAddFlow", lang)} grow />
        {on && <Field value={frame.flow ?? ""} onChange={(flow) => onChange({ flow })} placeholder={t("prFlowName", lang)} label={t("prFlowName", lang)} p={p} height={40} />}
      </div>
    </Section>
  );
}
