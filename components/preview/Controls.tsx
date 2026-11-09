/* The preview's own controls, beside the screen and never on it: back, the screen picker (and the flows' starts), the
 * mock library's scenario and request log, the dark mode, the width, close. On a wide window they stand in a column
 * at the right edge; on a phone they run along the bottom, marks only. */

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { framePresetOf, isPhoneFrame, type Doc, type Frame, type FramePreset, type Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { PRESETS } from "@/lib/variants";
import { flowStarts } from "@/lib/prototype";
import { EASE } from "@/lib/screenMotion";
import { Icon } from "../Icon";
import { MockClockSwitch, MockScenarioSwitch, type PreviewMocks } from "../MockPreview";

export function PreviewControls({
  doc,
  current,
  p,
  wide,
  canGoBack,
  onBack,
  picker,
  setPicker,
  onPick,
  mocks,
  logOpen,
  onToggleLog,
  dark,
  onToggleDark,
  onSize,
  onClose,
}: {
  doc: Doc;
  current: Frame;
  p: Palette;
  wide: boolean;
  canGoBack: boolean;
  onBack: () => void;
  /** the screen picker is open */
  picker: boolean;
  setPicker: (next: boolean | ((was: boolean) => boolean)) => void;
  /** a screen picked by hand, or the start of a flow: the preview starts over there */
  onPick: (frameId: string) => void;
  mocks: PreviewMocks | null;
  logOpen: boolean;
  onToggleLog: () => void;
  dark: boolean;
  onToggleDark: () => void;
  onSize: (preset: FramePreset) => void;
  onClose: () => void;
}) {
  const lang = useLang();
  const frames = doc.frames;
  const phone = isPhoneFrame(current);
  /* every size of a screen is laid out on its own, so the switch is only there when there is something to switch to */
  const hasSizes = frames.some((f) => f.variantOf);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerButton = useRef<HTMLButtonElement>(null);
  /* A menu hands focus back to its button when it closes; a chosen screen is then one Tab
   * away. The chosen item is still in the tree here because the menu animates out. */
  useEffect(() => {
    const focused = document.activeElement;
    if (!picker && focused !== pickerButton.current && pickerRef.current?.contains(focused)) pickerButton.current?.focus();
  }, [picker]);
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPicker(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [picker, setPicker]);


  const barBtn: React.CSSProperties = {
    height: 40,
    padding: "0 14px 0 10px",
    borderRadius: 20,
    border: "none",
    background: "transparent",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    /* the column has a fixed width, so labels are cut with an ellipsis instead of widening it */
    width: wide ? "100%" : undefined,
    minWidth: 0,
    /* along a phone's bottom it is the screen's name that gives way, not the buttons beside it */
    flexShrink: wide ? undefined : 0,
  };
  /* along a phone's bottom there is room for the marks, not the words: the title says them */
  const markOnly: React.CSSProperties = wide ? {} : { padding: "0 10px" };
  const label: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };


  return (
      <div
        style={
          wide
            ? { position: "absolute", right: 20, bottom: 20, display: "flex", alignItems: "flex-end", pointerEvents: "none" }
            : { position: "absolute", left: 0, right: 0, bottom: 14, display: "flex", justifyContent: "center", pointerEvents: "none" }
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: wide ? "column" : "row",
            alignItems: wide ? "stretch" : "center",
            gap: 4,
            padding: 6,
            borderRadius: 28,
            background: p.surface,
            boxShadow: "0 4px 18px rgba(0,0,0,0.14)",
            pointerEvents: "auto",
            width: wide ? 172 : undefined,
            maxWidth: "calc(100vw - 24px)",
          }}
        >
          <button
            onClick={onBack}
            disabled={!canGoBack}
            title={t("back", lang)}
            aria-label={t("back", lang)}
            className="m3-press"
            style={{
              ...barBtn,
              ...markOnly,
              color: canGoBack ? p.onSurfaceVariant : p.outlineVariant,
              cursor: canGoBack ? "pointer" : "default",
            }}
          >
            <Icon name="arrow_back" size={20} />
            {wide && <span style={label}>{t("back", lang)}</span>}
          </button>
          <div ref={pickerRef} style={{ position: "relative", minWidth: 0, flex: wide ? undefined : "0 1 auto" }}>
            <button
              ref={pickerButton}
              onClick={() => setPicker((v) => !v)}
              title={t("screens", lang)}
              aria-expanded={picker}
              className="m3-press"
              style={{
                ...barBtn,
                background: p.secondaryContainer,
                color: p.onSecondaryContainer,
                width: "100%",
                maxWidth: wide ? undefined : 200,
                padding: wide ? barBtn.padding : "0 8px 0 12px",
              }}
            >
              {wide && <Icon name={phone ? "smartphone" : "desktop_windows"} size={20} />}
              <span style={{ ...label, flex: wide ? 1 : undefined, textAlign: "left" }}>{current.name || t("screen", lang)}</span>
              <Icon name={wide ? (picker ? "chevron_right" : "chevron_left") : picker ? "expand_more" : "expand_less"} size={18} />
            </button>
            <AnimatePresence>
              {picker && (
                <motion.div
                  role="menu"
                  initial={wide ? { opacity: 0, x: 6, scale: 0.96 } : { opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, x: wide ? 0 : "-50%", y: 0, scale: 1 }}
                  exit={wide ? { opacity: 0, x: 6, scale: 0.96 } : { opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.16, ease: EASE }}
                  style={{
                    position: "absolute",
                    ...(wide ? { right: "calc(100% + 14px)", bottom: 0 } : { bottom: 48, left: "50%" }),
                    minWidth: 160,
                    maxWidth: "calc(100vw - 24px)",
                    maxHeight: "50vh",
                    overflowY: "auto",
                    padding: 6,
                    borderRadius: 18,
                    background: p.surfaceContainerLow,
                    boxShadow: "0 6px 20px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transformOrigin: wide ? "bottom right" : "bottom center",
                  }}
                >
                  {flowStarts(frames).map((f) => (
                    <button
                      key={`flow:${f.id}`}
                      role="menuitem"
                      data-preview-flow={f.flow}
                      onClick={() => {
                        setPicker(false);
                        onPick(f.id);
                      }}
                      className="m3-press"
                      style={{ height: 40, padding: "0 14px 0 10px", borderRadius: 12, border: "none", background: "transparent", color: p.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap", textAlign: "left" }}
                    >
                      <Icon name="play_arrow" size={18} />
                      {f.flow || t("prFlowStart", lang)}
                    </button>
                  ))}
                  {frames.map((f) => {
                    const on = f.id === current.id;
                    return (
                      <button
                        key={f.id}
                        role="menuitemradio"
                        aria-checked={on}
                        onClick={() => {
                          setPicker(false);
                          if (!on) onPick(f.id);
                        }}
                        className="m3-press"
                        style={{
                          height: 40,
                          padding: "0 14px 0 10px",
                          borderRadius: 12,
                          border: "none",
                          background: on ? p.secondaryContainer : "transparent",
                          color: on ? p.onSecondaryContainer : p.onSurface,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          whiteSpace: "nowrap",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ width: 18, display: "inline-flex" }}>
                          {on ? <Icon name="check" size={18} /> : <Icon name={isPhoneFrame(f) ? "smartphone" : "desktop_windows"} size={18} />}
                        </span>
                        {f.name || t("screen", lang)}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {mocks && <MockScenarioSwitch mocks={mocks} scenarios={doc.mocks?.scenarios ?? []} p={p} wide={wide} barBtn={{ ...barBtn, ...markOnly }} />}
          {mocks && <MockClockSwitch mocks={mocks} p={p} wide={wide} barBtn={{ ...barBtn, ...markOnly }} />}
          {mocks && (
            <button data-preview-log-button aria-pressed={logOpen} onClick={onToggleLog} title={t("mocksLog", lang)} aria-label={t("mocksLog", lang)} className="m3-press" style={{ ...barBtn, ...markOnly, color: logOpen ? p.onSecondaryContainer : p.onSurfaceVariant, background: logOpen ? p.secondaryContainer : "transparent" }}>
              <Icon name="receipt_long" size={20} />
              {wide && <span style={label}>{t("mocksLog", lang)}</span>}
            </button>
          )}
          <button
            data-preview-dark={dark ? "on" : "off"}
            onClick={onToggleDark}
            title={t(dark ? "light" : "dark", lang)}
            aria-label={t(dark ? "light" : "dark", lang)}
            className="m3-press"
            style={{ ...barBtn, ...markOnly, color: p.onSurfaceVariant }}
          >
            <Icon name={dark ? "light_mode" : "dark_mode"} size={20} />
            {wide && <span style={label}>{t(dark ? "light" : "dark", lang)}</span>}
          </button>
          {hasSizes && (
            <div role="radiogroup" aria-label={t("previewWidth", lang)} data-preview-width style={{ display: "flex", gap: 2, justifyContent: "center", flexShrink: 0 }}>
              {PRESETS.map((preset) => {
                const on = framePresetOf(current) === preset;
                const word = t(preset === "phone" ? "phoneFrame" : preset === "tablet" ? "tabletFrame" : "desktopFrame", lang);
                return (
                  <button
                    key={preset}
                    role="radio"
                    aria-checked={on}
                    aria-label={word}
                    title={word}
                    data-preview-size={preset}
                    onClick={() => onSize(preset)}
                    className="m3-press"
                    style={{ ...barBtn, width: wide ? 44 : 36, padding: 0, justifyContent: "center", background: on ? p.secondaryContainer : "transparent", color: on ? p.onSecondaryContainer : p.onSurfaceVariant }}
                  >
                    <Icon name={preset === "phone" ? "smartphone" : preset === "tablet" ? "tablet" : "desktop_windows"} size={20} />
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={onClose} title={t("close", lang)} aria-label={t("close", lang)} className="m3-press" style={{ ...barBtn, ...markOnly, color: p.onSurfaceVariant }}>
            <Icon name="close" size={20} />
            {wide && <span style={label}>{t("closeBtn", lang)}</span>}
          </button>
        </div>
      </div>
  );
}
