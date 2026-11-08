import { ScrollView, View } from "@tarojs/components";
import type { ReactNode } from "react";

import type { PartBase } from "../atoms/basics";
import { Words } from "../atoms/words";
import { c, ca } from "../color";
import { Glyph } from "../icons";
import { useFill } from "../layout";
import { withDefaults } from "../parts";
import { Surface, tagOf } from "../Surface";
import { merge, sx, ROW, type CSS } from "../styles";
import { corner, typeStyle, useKit } from "../theme";
import { tapOf } from "./bars";
import { own, TriggerButton, useDraft } from "./layouts";

/* What floats over a screen beside a dialog and a sheet: a tooltip, a popover and a hover card off their trigger, a
 * drawer from the foot, a side sheet docked to a window. The first three keep the room the canvas draws them open in
 * (parts/types.ts `around`), their trigger where it stands in it, and open on a tap (a long press for a tooltip) as the
 * preview opens them: whether one is open is `open`, a change told through `onOpenChange`. A drawer and a side sheet
 * are drawn open where the design puts them, as the kit's sheet is; what shows or hides them is the screen's (a part
 * that starts hidden is printed in a `Layer`). */

const SHADOW = "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 2px 6px 2px rgba(0,0,0,0.15)";
const COL: CSS = { display: "flex", flexDirection: "column" };

/** the box a popup that opens to one side of its trigger is drawn in (the canvas's) */
export function around(side: string, popupW: number, popupH: number, triggerW: number, triggerH: number, gap = 8) {
  const across = side === "left" || side === "right";
  return { w: across ? triggerW + gap + popupW : Math.max(triggerW, popupW), h: across ? Math.max(triggerH, popupH) : triggerH + gap + popupH };
}

/** where a trigger stands in that box: it hugs the side the popup is not on, and across a vertical gap it is centered */
export const placeOf = (side: string): CSS => ({ display: "flex", flexDirection: side === "left" || side === "right" ? "row" : "column", alignItems: "center", justifyContent: side === "top" || side === "left" ? "flex-end" : "flex-start", gap: 8 });

/** a trigger and the popup on its side, in the box they are drawn in: the trigger stays where it is when it opens */
function Beside({ side, box, trigger, popup }: { side: string; box: { w: number; h: number }; trigger: ReactNode; popup: ReactNode }) {
  const first = side === "top" || side === "left";
  return (
    <View style={sx(placeOf(side), { width: box.w, height: box.h, flexShrink: 0 })}>
      {first ? popup : null}
      {trigger}
      {first ? null : popup}
    </View>
  );
}

/* ---------- a tooltip ---------- */

export type TooltipProps = PartBase & { label?: string; variant?: string; text?: string; side?: "top" | "right" | "bottom" | "left"; open?: boolean; onOpenChange?: (open: boolean) => void };

/** A button and the words that say what it does, beside it on a long press (a phone has no pointer to hover with). A tap
 *  is the button's: what the design wires to the part. */
export function Tooltip(props: TooltipProps) {
  const p = withDefaults<TooltipProps>("tooltip", props);
  const kit = useKit();
  const [open, setOpen] = useDraft(!!p.open, p.onOpenChange);
  const side = p.side ?? "top";
  return (
    <View {...tagOf(p.testID)}>
      <Beside
        side={side}
        box={around(side, 150, 40, 120, 40)}
        trigger={
          <TriggerButton
            label={p.label}
            variant={p.variant ?? "outlined"}
            onLongPress={() => setOpen(true)}
            onPress={() => {
              if (open) setOpen(false);
              p.onPress?.();
            }}
          />
        }
        popup={
          open ? (
            <Surface base={merge(ROW, { minHeight: 24, maxWidth: 320, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderRadius: corner(kit, "xs"), backgroundColor: c("inverse-surface") })} appearance={p} role="tooltip">
              <Words text={p.text} style={{ ...typeStyle(kit, "body-small"), color: c("inverse-on-surface") }} />
            </Surface>
          ) : null
        }
      />
    </View>
  );
}

/* ---------- a popover ---------- */

export type PopoverProps = PartBase & { trigger?: string; variant?: string; title?: string; description?: string; side?: "bottom" | "top" | "right" | "left"; open?: boolean; onOpenChange?: (open: boolean) => void };

/** a button that opens a card of its own beside it: a title and a line */
export function Popover(props: PopoverProps) {
  const p = withDefaults<PopoverProps>("popover", props);
  const kit = useKit();
  const [open, setOpen] = useDraft(!!p.open, p.onOpenChange);
  const side = p.side ?? "bottom";
  return (
    <View {...tagOf(p.testID)}>
      <Beside
        side={side}
        box={around(side, 300, 190, 120, 40)}
        trigger={
          <TriggerButton
            label={p.trigger}
            variant={p.variant ?? "outlined"}
            onPress={() => {
              setOpen(!open);
              p.onPress?.();
            }}
          />
        }
        popup={
          open ? (
            <Surface base={merge(COL, { width: 288, padding: 16, rowGap: 4, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container"), boxShadow: SHADOW, flexShrink: 0 })} appearance={p} role="dialog">
              <Words text={p.title} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface") }} />
              {p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} /> : null}
            </Surface>
          ) : null
        }
      />
    </View>
  );
}

/* ---------- a hover card ---------- */

export type HoverCardProps = PartBase & { trigger?: string; avatar?: string; title?: string; description?: string; side?: "bottom" | "top" | "right" | "left"; open?: boolean; onOpenChange?: (open: boolean) => void };

/** A link and the card it shows about what it names: a letter in a circle, a title and a line. A pointer hovers it on
 *  the web; in a mini-program a tap shows it, and another tap hides it. */
export function HoverCard(props: HoverCardProps) {
  const p = withDefaults<HoverCardProps>("hover-card", props);
  const kit = useKit();
  const [open, setOpen] = useDraft(!!p.open, p.onOpenChange);
  const side = p.side ?? "bottom";
  return (
    <View {...tagOf(p.testID)}>
      <Beside
        side={side}
        box={around(side, 288, 150, 90, 24)}
        trigger={
          <View
            ariaRole="link"
            ariaLabel={p.trigger}
            hoverClass="m3e-pressed"
            onClick={own(() => {
              setOpen(!open);
              p.onPress?.();
            })}
            style={sx(ROW, { height: 24, flexShrink: 0 })}
          >
            <Words text={p.trigger} style={{ ...typeStyle(kit, "body-medium"), color: c("primary"), textDecoration: "underline" }} />
          </View>
        }
        popup={
          open ? (
            <Surface base={merge(ROW, { width: 288, padding: 16, columnGap: 12, alignItems: "flex-start", boxSizing: "border-box", borderRadius: corner(kit, "md"), backgroundColor: c("surface-container"), boxShadow: SHADOW, flexShrink: 0 })} appearance={p} role="dialog">
              {p.avatar ? (
                <View style={sx(ROW, { width: 40, height: 40, flexShrink: 0, borderRadius: 20, justifyContent: "center", backgroundColor: c("primary-container") })}>
                  <Words text={p.avatar} style={{ ...typeStyle(kit, "title-medium"), color: c("on-primary-container") }} />
                </View>
              ) : null}
              <View style={sx(COL, { flex: 1, minWidth: 0, rowGap: 2 })}>
                <Words text={p.title} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface") }} />
                {p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} /> : null}
              </View>
            </Surface>
          ) : null
        }
      />
    </View>
  );
}

/* ---------- a drawer ---------- */

export type DrawerProps = PartBase & { title?: string; description?: string; close?: string; swipeHandle?: boolean; inline?: boolean };

/** a panel risen from the foot of the screen: its handle, a title and a line, and a button that closes it */
export function Drawer(props: DrawerProps) {
  const p = withDefaults<DrawerProps>("drawer", props);
  const kit = useKit();
  const fill = useFill();
  const r = corner(kit, "xl");
  return (
    <Surface base={merge(COL, { width: 412, borderTopLeftRadius: r, borderTopRightRadius: r, backgroundColor: c("surface-container-low"), boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 1px 3px 1px rgba(0,0,0,0.15)", overflow: "hidden", flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      {p.swipeHandle ? (
        <View style={sx(ROW, { height: 36, justifyContent: "center" })}>
          <View style={sx({ width: 32, height: 4, borderRadius: 2, backgroundColor: ca("on-surface-variant", 0.4) })} />
        </View>
      ) : null}
      <View style={sx(COL, { paddingLeft: 24, paddingRight: 24, paddingTop: p.swipeHandle ? 0 : 24, rowGap: 4, alignItems: "center", textAlign: "center" })}>
        <Words text={p.title} style={{ ...typeStyle(kit, "title-large"), color: c("on-surface") }} />
        {p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} /> : null}
      </View>
      <View style={sx(COL, { padding: 24, rowGap: 8 })}>{p.close ? <TriggerButton label={p.close} variant="text" wide onPress={() => tapOf(p, "close")?.()} /> : null}</View>
    </Surface>
  );
}

/* ---------- a side sheet ---------- */

export type SideSheetProps = PartBase & { title?: string; content?: string; side?: "right" | "left"; detached?: boolean; closeButton?: boolean; footer?: boolean; confirm?: string; dismiss?: string; width?: number; height?: number };

/** A sheet docked to a side of the window it stands in, as the canvas draws it on a screen (the sheet and room for the
 *  window's own content beside it, inside the screen's margins): its title and close button, what it says, and Apply and
 *  Cancel at its foot. */
export function SideSheet(props: SideSheetProps) {
  const p = withDefaults<SideSheetProps>("side-sheet", props);
  const kit = useKit();
  const w = Math.min(400, Math.max(256, Math.round(p.width ?? 360)));
  const left = p.side === "left";
  const line = `1px solid ${c("outline-variant")}`;
  const sheet: CSS = p.detached
    ? { width: w, marginTop: 16, marginBottom: 16, [left ? "marginLeft" : "marginRight"]: 16, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-low") }
    : { width: w, backgroundColor: c("surface"), [left ? "borderRight" : "borderLeft"]: line };
  return (
    <View {...tagOf(p.testID)} style={sx(ROW, { flexDirection: left ? "row-reverse" : "row", alignItems: "stretch", width: Math.round(p.width ?? 360) + 280, maxWidth: "calc(100vw - 32px)", height: Math.round(p.height ?? 320), border: line, borderRadius: corner(kit, "sm"), overflow: "hidden", boxSizing: "border-box", flexShrink: 0 })}>
      {/* the window's own content: what the sheet is beside, which keeps its place while the sheet is open */}
      <View style={sx({ flex: 1, minWidth: 0, backgroundColor: c("surface") })} />
      <Surface base={merge(COL, sheet, { flexShrink: 0, overflow: "hidden", boxSizing: "border-box" })} appearance={p}>
        <View style={sx(ROW, { minHeight: 64, columnGap: 4, paddingLeft: 24, paddingRight: 12, paddingTop: 8, paddingBottom: 8, boxSizing: "border-box" })}>
          <Words text={p.title} lines={1} style={{ ...typeStyle(kit, "title-large"), color: c("on-surface-variant"), flex: 1 }} />
          {p.closeButton ? (
            <View ariaRole="button" ariaLabel="Close" hoverClass="m3e-pressed" onClick={own(() => tapOf(p, "close")?.())} style={sx(ROW, { width: 40, height: 40, borderRadius: 20, justifyContent: "center" })}>
              <Glyph name="close" size={24} color="on-surface-variant" />
            </View>
          ) : null}
        </View>
        <ScrollView scrollY style={sx({ flex: 1, minHeight: 0 })}>
          <Words text={p.content} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant"), paddingLeft: 24, paddingRight: 24, paddingTop: 8, paddingBottom: 8 }} />
        </ScrollView>
        {p.footer && (p.confirm || p.dismiss) ? (
          <View style={sx(ROW, { columnGap: 8, borderTop: line, paddingLeft: 24, paddingRight: 24, paddingTop: 16, paddingBottom: 16 })}>
            {p.confirm ? <TriggerButton label={p.confirm} variant="filled" onPress={() => tapOf(p, "confirm")?.()} /> : null}
            {p.dismiss ? <TriggerButton label={p.dismiss} variant="outlined" onPress={() => tapOf(p, "dismiss")?.()} /> : null}
          </View>
        ) : null}
      </Surface>
    </View>
  );
}
