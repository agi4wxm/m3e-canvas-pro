import type { ReactNode } from "react";
import { Pressable, ScrollView, Text as RNText, View, useWindowDimensions, type ViewStyle } from "react-native";

import type { PartBase } from "../atoms/basics";
import { buttonColors } from "../atoms/controls";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { withAlpha } from "../look";
import { withDefaults } from "../parts";
import { Surface } from "../Surface";
import { controlRadius, corner, typeStyle, useKit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";
import { c, TriggerButton, useDraft } from "./layouts";

/* What floats over a screen beside a dialog and a sheet: a tooltip, a popover and a hover card off their trigger, a
 * drawer from the foot, a side sheet docked to a window. The first three keep the room the canvas draws them open in
 * (parts/types.ts `around`), their trigger where it stands in it, and open on a tap (a long press for a tooltip) as the
 * preview opens them: whether one is open is `open`, a change told through `onOpenChange`. A drawer and a side sheet
 * are drawn open where the design puts them, as the kit's sheet is; what shows or hides them is the screen's. */

const SHADOW = "0px 1px 2px 0px #0000004D, 0px 2px 6px 2px #00000026";

/** the box a popup that opens to one side of its trigger is drawn in, and where the trigger stands in it (the canvas's) */
export function around(side: string, popupW: number, popupH: number, triggerW: number, triggerH: number, gap = 8) {
  const across = side === "left" || side === "right";
  return { w: across ? triggerW + gap + popupW : Math.max(triggerW, popupW), h: across ? Math.max(triggerH, popupH) : triggerH + gap + popupH };
}

/** a trigger and the popup on its side, in the box they are drawn in: the trigger stays where it is when it opens */
function Beside({ side, box, trigger, popup, testID }: { side: string; box: { w: number; h: number }; trigger: ReactNode; popup: ReactNode; testID?: string }) {
  const across = side === "left" || side === "right";
  /* the trigger hugs the side the popup is not on; across a vertical gap it is centered */
  const style: ViewStyle = { width: box.w, height: box.h, flexDirection: across ? "row" : "column", alignItems: "center", justifyContent: side === "top" || side === "left" ? "flex-end" : "flex-start", gap: 8 };
  const first = side === "top" || side === "left";
  return (
    <View testID={testID} style={style} pointerEvents="box-none">
      {first ? popup : null}
      {trigger}
      {first ? null : popup}
    </View>
  );
}

/** a button-shaped trigger in a variant of the kit's buttons */
function ButtonTrigger({ label, variant, expanded, onPress, onLongPress }: { label?: string; variant?: string; expanded: boolean; onPress?: () => void; onLongPress?: () => void }) {
  const kit = useKit();
  const look = buttonColors(kit, variant ?? "outlined");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded }} onPress={onPress} onLongPress={onLongPress} style={{ height: 40, paddingHorizontal: 16, borderRadius: controlRadius(kit, 40), flexDirection: "row", alignItems: "center", justifyContent: "center", ...look.box }}>
      <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-large"), color: look.ink, ...(look.weight ? { fontWeight: look.weight } : null) }}>
        {label}
      </RNText>
    </Pressable>
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
  const popup = open ? (
    <Surface base={{ minHeight: 24, maxWidth: 320, paddingHorizontal: 8, paddingVertical: 4, borderRadius: corner(kit, "xs"), backgroundColor: c(kit, "inverse-surface"), justifyContent: "center" }} appearance={p} accessibilityRole="none">
      <RNText style={{ ...typeStyle(kit, "body-small"), color: c(kit, "inverse-on-surface") }}>{p.text}</RNText>
    </Surface>
  ) : null;
  return (
    <Beside
      side={side}
      box={around(side, 150, 40, 120, 40)}
      testID={p.testID}
      trigger={
        <ButtonTrigger
          label={p.label}
          variant={p.variant}
          expanded={open}
          onLongPress={() => setOpen(true)}
          onPress={() => {
            if (open) setOpen(false);
            p.onPress?.();
          }}
        />
      }
      popup={popup}
    />
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
  const popup = open ? (
    <Surface base={{ width: 288, padding: 16, rowGap: 4, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container"), boxShadow: SHADOW }} appearance={p}>
      <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface") }}>{p.title}</RNText>
      {p.description ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant") }}>{p.description}</RNText> : null}
    </Surface>
  ) : null;
  return (
    <Beside
      side={side}
      box={around(side, 300, 190, 120, 40)}
      testID={p.testID}
      trigger={
        <ButtonTrigger
          label={p.trigger}
          variant={p.variant}
          expanded={open}
          onPress={() => {
            setOpen(!open);
            p.onPress?.();
          }}
        />
      }
      popup={popup}
    />
  );
}

/* ---------- a hover card ---------- */

export type HoverCardProps = PartBase & { trigger?: string; avatar?: string; title?: string; description?: string; side?: "bottom" | "top" | "right" | "left"; open?: boolean; onOpenChange?: (open: boolean) => void };

/** A link and the card it shows about what it names: a letter in a circle, a title and a line. A pointer hovers it on
 *  the web; on a phone a tap shows it, and another tap hides it. */
export function HoverCard(props: HoverCardProps) {
  const p = withDefaults<HoverCardProps>("hover-card", props);
  const kit = useKit();
  const [open, setOpen] = useDraft(!!p.open, p.onOpenChange);
  const side = p.side ?? "bottom";
  const popup = open ? (
    <Surface base={{ width: 288, padding: 16, flexDirection: "row", columnGap: 12, borderRadius: corner(kit, "md"), backgroundColor: c(kit, "surface-container"), boxShadow: SHADOW }} appearance={p}>
      {p.avatar ? (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c(kit, "primary-container"), alignItems: "center", justifyContent: "center" }}>
          <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-primary-container") }}>{p.avatar}</RNText>
        </View>
      ) : null}
      <View style={{ flex: 1, rowGap: 2 }}>
        <RNText style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>{p.title}</RNText>
        {p.description ? <RNText style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant") }}>{p.description}</RNText> : null}
      </View>
    </Surface>
  ) : null;
  return (
    <Beside
      side={side}
      box={around(side, 288, 150, 90, 24)}
      testID={p.testID}
      trigger={
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={p.trigger}
          accessibilityState={{ expanded: open }}
          onPress={() => {
            setOpen(!open);
            p.onPress?.();
          }}
          style={{ height: 24, justifyContent: "center" }}
        >
          <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "primary"), textDecorationLine: "underline" }}>{p.trigger}</RNText>
        </Pressable>
      }
      popup={popup}
    />
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
    <Surface base={{ width: 412, borderTopLeftRadius: r, borderTopRightRadius: r, backgroundColor: c(kit, "surface-container-low"), boxShadow: "0px 1px 2px 0px #0000004D, 0px 1px 3px 1px #00000026", overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      {p.swipeHandle ? (
        <View style={{ height: 36, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: withAlpha(c(kit, "on-surface-variant"), 0.4) }} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 24, paddingTop: p.swipeHandle ? 0 : 24, rowGap: 4, alignItems: "center" }}>
        <RNText style={{ ...typeStyle(kit, "title-large"), color: c(kit, "on-surface"), textAlign: "center" }}>{p.title}</RNText>
        {p.description ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant"), textAlign: "center" }}>{p.description}</RNText> : null}
      </View>
      <View style={{ padding: 24, rowGap: 8 }}>{p.close ? <TriggerButton label={p.close} variant="text" wide onPress={tapOf(p, "close")} /> : null}</View>
    </Surface>
  );
}

/* ---------- a side sheet ---------- */

export type SideSheetProps = PartBase & { title?: string; content?: string; side?: "right" | "left"; detached?: boolean; closeButton?: boolean; footer?: boolean; confirm?: string; dismiss?: string; width?: number; height?: number };

/** the width of the window a side sheet docks to, as the canvas draws it on a screen: the sheet and room for the content
 *  beside it, inside the screen's margins */
export const sideSheetWindow = (width: number, screen: number) => Math.min(width + 280, Math.max(200, screen - 32));

/** A sheet docked to a side of the window it stands in, as the canvas draws it: the window's own content stays where it
 *  is beside it. Its title and close button, what it says, and Apply and Cancel at its foot. */
export function SideSheet(props: SideSheetProps) {
  const p = withDefaults<SideSheetProps>("side-sheet", props);
  const kit = useKit();
  const screen = useWindowDimensions().width;
  const w = Math.min(400, Math.max(256, Math.round(p.width ?? 360)));
  const left = p.side === "left";
  const line = c(kit, "outline-variant");
  const sheet: ViewStyle = p.detached
    ? { width: w, marginVertical: 16, ...(left ? { marginLeft: 16 } : { marginRight: 16 }), borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-low") }
    : { width: w, backgroundColor: c(kit, "surface"), ...(left ? { borderRightWidth: 1 } : { borderLeftWidth: 1 }), borderColor: line };
  const body = (
    <Surface key="sheet" base={{ ...sheet, overflow: "hidden" }} appearance={p}>
      <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", columnGap: 4, paddingLeft: 24, paddingRight: 12, paddingVertical: 8 }}>
        <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "title-large"), color: c(kit, "on-surface-variant") }}>
          {p.title}
        </RNText>
        {p.closeButton ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={tapOf(p, "close")} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
            <Glyph name="close" size={24} color={c(kit, "on-surface-variant")} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8 }}>
        <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant") }}>{p.content}</RNText>
      </ScrollView>
      {p.footer && (p.confirm || p.dismiss) ? (
        <View style={{ flexDirection: "row", columnGap: 8, borderTopWidth: 1, borderTopColor: line, paddingHorizontal: 24, paddingVertical: 16 }}>
          {p.confirm ? <TriggerButton label={p.confirm} variant="filled" onPress={tapOf(p, "confirm")} /> : null}
          {p.dismiss ? <TriggerButton label={p.dismiss} variant="outlined" onPress={tapOf(p, "dismiss")} /> : null}
        </View>
      ) : null}
    </Surface>
  );
  /* the window's own content: what the sheet is beside, which keeps its place while the sheet is open */
  const content = <View key="content" style={{ flex: 1, minWidth: 0, backgroundColor: c(kit, "surface") }} />;
  return (
    <View testID={p.testID} style={{ width: sideSheetWindow(Math.round(p.width ?? 360), screen), height: Math.round(p.height ?? 320), flexDirection: "row", borderWidth: 1, borderColor: line, borderRadius: corner(kit, "sm"), overflow: "hidden" }}>
      {left ? [body, content] : [content, body]}
    </View>
  );
}
