import { Pressable, Text as RNText, View, type ViewStyle } from "react-native";

import type { PartBase } from "../atoms/basics";
import { Button } from "../atoms/controls";
import { Glyph } from "../icons/Icon";
import { withAlpha } from "../look";
import { withDefaults, type ListRow } from "../parts";
import { accentText, extraColor, panelStyle } from "../recipes";
import { Surface } from "../Surface";
import { corner, recipeOf, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";

/* What opens over a screen: dialogs, a sheet from an edge, an action sheet. Each is drawn open where the design puts it,
 * as the canvas draws it; a screen shown as an overlay (a tap that opens it over another) is how an app raises one on
 * demand. The style composes each: iOS's narrow alert with its buttons in halves, WeChat's, Material's. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/** the buttons along the foot of an alert, split in halves by hairlines (iOS, WeChat) */
function SplitActions({ kit, actions }: { kit: Kit; actions: { label: string; onPress?: () => void; main?: boolean }[] }) {
  /* iOS sets both in the tint and regular; WeChat its main one green and bold */
  const weui = recipeOf(kit, "dialog") === "weui";
  const line = withAlpha(c(kit, "on-surface"), 0.14);
  return (
    <View style={{ flexDirection: "row", borderTopWidth: 0.5, borderTopColor: line }}>
      {actions.map((a, i) => (
        <Pressable key={i} accessibilityRole="button" onPress={a.onPress} style={{ flex: 1, height: weui ? 56 : 44, alignItems: "center", justifyContent: "center", borderLeftWidth: i ? 0.5 : 0, borderLeftColor: line }}>
          <RNText style={{ ...typeStyle(kit, "body-large"), fontSize: 17, fontWeight: a.main && weui ? "600" : "400", color: weui ? (a.main ? c(kit, "primary") : c(kit, "on-surface")) : c(kit, "primary") }}>{a.label}</RNText>
        </Pressable>
      ))}
    </View>
  );
}

type Dialogish = { icon?: string; title?: string; description?: string; dismiss?: string; confirm?: string; stacked?: boolean; closeButton?: boolean; /** the main action filled (an alert dialog's) */ filled?: boolean };

/** a dialog's card under the style's dialog recipe */
function DialogCard({ p, base }: { p: PartBase & Dialogish; base?: ViewStyle }) {
  const kit = useKit();
  const recipe = recipeOf(kit, "dialog");
  const actions = [p.dismiss ? { label: p.dismiss, onPress: tapOf(p, "dismiss") } : null, p.confirm ? { label: p.confirm, onPress: tapOf(p, "confirm"), main: true } : null].filter((a): a is { label: string; onPress: (() => void) | undefined; main?: boolean } => !!a);
  if (recipe === "alert" || recipe === "weui") {
    const weui = recipe === "weui";
    return (
      <Surface base={panelStyle(kit, { width: weui ? 320 : 270, borderRadius: weui ? 12 : 14, backgroundColor: extraColor(kit, "dialogBg") ?? c(kit, "surface-container-high"), overflow: "hidden", ...base })} appearance={p} testID={p.testID}>
        <View style={{ paddingHorizontal: weui ? 24 : 16, paddingTop: weui ? 32 : 20, paddingBottom: weui ? 32 : 20, rowGap: weui ? 16 : 4, alignItems: "center" }}>
          {p.icon ? <Glyph name={p.icon} size={24} color={c(kit, "secondary")} /> : null}
          <RNText style={{ ...typeStyle(kit, "title-medium"), fontSize: 17, lineHeight: 22, fontWeight: "600", color: c(kit, "on-surface"), textAlign: "center" }}>{p.title}</RNText>
          {p.description ? <RNText style={{ ...typeStyle(kit, "body-small"), fontSize: weui ? 15 : 13, lineHeight: weui ? 22 : 18, color: c(kit, "on-surface-variant"), textAlign: "center", marginTop: weui ? 0 : 8 }}>{p.description}</RNText> : null}
        </View>
        <SplitActions kit={kit} actions={actions} />
      </Surface>
    );
  }
  const modal = recipe === "modal";
  return (
    <Surface base={panelStyle(kit, { width: 312, padding: 24, rowGap: 16, borderRadius: corner(kit, "xl"), backgroundColor: c(kit, "surface-container-high"), boxShadow: "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026", ...base })} appearance={p} testID={p.testID}>
      {p.closeButton ? (
        <Pressable accessibilityLabel="Close" onPress={tapOf(p, "dismiss")} style={{ position: "absolute", top: 12, right: 12 }}>
          <Glyph name="close" size={24} color={c(kit, "on-surface-variant")} />
        </Pressable>
      ) : null}
      {p.icon ? <Glyph name={p.icon} size={24} color={c(kit, "secondary")} style={{ alignSelf: "center" }} /> : null}
      <RNText style={{ ...typeStyle(kit, "headline-small"), color: c(kit, "on-surface"), textAlign: p.icon ? "center" : "left" }}>{p.title}</RNText>
      {p.description ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant") }}>{p.description}</RNText> : null}
      <View style={{ flexDirection: p.stacked ? "column" : "row", justifyContent: "flex-end", alignItems: p.stacked ? "flex-end" : "center", gap: 8, marginTop: 8 }}>
        {actions.map((a, i) => (
          <Button key={i} label={a.label} variant={(modal || p.filled) && a.main ? "filled" : "text"} size="sm" onPress={a.onPress} />
        ))}
      </View>
    </Surface>
  );
}

export type DialogProps = PartBase & Dialogish & { styleVariant?: "basic" | "fullscreen"; dialogWidth?: number; width?: number; height?: number };

export function Dialog(props: DialogProps) {
  const p = withDefaults<DialogProps>("dialog", props);
  const kit = useKit();
  if (p.styleVariant === "fullscreen")
    return (
      <Surface base={{ width: Math.round(p.width ?? 412), height: Math.round(p.height ?? 640), backgroundColor: c(kit, "surface") }} appearance={p} testID={p.testID}>
        <View style={{ height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 4, columnGap: 4 }}>
          <Pressable accessibilityLabel="Close" onPress={tapOf(p, "dismiss")} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
            <Glyph name="close" size={24} color={c(kit, "on-surface")} />
          </Pressable>
          <RNText style={{ flex: 1, ...typeStyle(kit, "title-large"), color: c(kit, "on-surface") }}>{p.title}</RNText>
          {p.confirm ? <Button label={p.confirm} variant="text" size="sm" onPress={tapOf(p, "confirm")} /> : null}
        </View>
        {p.description ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant"), padding: 24 }}>{p.description}</RNText> : null}
      </Surface>
    );
  /* it stands in a screen of its own size, with the screen's margins around it */
  const recipe = recipeOf(kit, "dialog");
  return <DialogCard p={p} base={recipe === "alert" || recipe === "weui" ? undefined : { width: Math.max(280, Math.min(560, Math.round(p.dialogWidth ?? 412) - 48)) }} />;
}

export type AlertDialogProps = PartBase & { icon?: string; title?: string; description?: string; cancel?: string; action?: string; size?: "default" | "sm" };

export function AlertDialog(props: AlertDialogProps) {
  const p = withDefaults<AlertDialogProps>("alert-dialog", props);
  const kit = useKit();
  const recipe = recipeOf(kit, "dialog");
  return <DialogCard p={{ ...p, dismiss: p.cancel, confirm: p.action, filled: true }} base={recipe !== "alert" && recipe !== "weui" ? { width: p.size === "sm" ? 280 : 364 } : undefined} />;
}

export type SheetProps = PartBase & { side?: "right" | "left" | "bottom" | "top"; title?: string; description?: string; footer?: boolean };

/** a sheet from an edge: a panel down a side, or one rising from the foot with the style's handle */
export function Sheet(props: SheetProps) {
  const p = withDefaults<SheetProps>("sheet", props);
  const kit = useKit();
  const recipe = recipeOf(kit, "sheet");
  const bottom = p.side === "bottom" || p.side === "top";
  const r = recipe === "grabber" || recipe === "weui" ? 12 : recipe === "panel" ? 0 : corner(kit, "xl");
  const base: ViewStyle = bottom
    ? { width: 412, paddingBottom: 16, backgroundColor: c(kit, "surface-container-low"), ...(p.side === "top" ? { borderBottomLeftRadius: r, borderBottomRightRadius: r } : { borderTopLeftRadius: r, borderTopRightRadius: r }) }
    : { width: 320, height: 560, backgroundColor: c(kit, "surface-container-low"), borderRadius: recipe === "panel" ? 0 : corner(kit, "lg") };
  return (
    <Surface base={panelStyle(kit, base)} appearance={p} testID={p.testID}>
      {bottom && p.side === "bottom" && recipe !== "panel" && recipe !== "m3" ? <View style={{ alignSelf: "center", marginTop: recipe === "grabber" ? 6 : 16, width: recipe === "grabber" ? 36 : 32, height: recipe === "grabber" ? 5 : 4, borderRadius: 3, backgroundColor: recipe === "grabber" ? withAlpha(c(kit, "on-surface"), 0.22) : c(kit, "on-surface-variant") }} /> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-start", padding: 24, columnGap: 12 }}>
        <View style={{ flex: 1, rowGap: 4 }}>
          <RNText style={{ ...typeStyle(kit, recipe === "grabber" || recipe === "weui" ? "title-medium" : "title-large"), ...(recipe === "grabber" || recipe === "weui" ? { fontSize: 17, fontWeight: "600" } : null), color: c(kit, "on-surface") }}>{p.title}</RNText>
          {p.description ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant") }}>{p.description}</RNText> : null}
        </View>
        <Pressable accessibilityLabel="Close" onPress={tapOf(p, "dismiss")}>
          <Glyph name="close" size={24} color={c(kit, "on-surface-variant")} />
        </Pressable>
      </View>
      {p.footer ? (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", columnGap: 8, paddingHorizontal: 24, marginTop: bottom ? 0 : "auto", paddingBottom: bottom ? 0 : 24 }}>
          <Button label="Cancel" variant="outlined" size="sm" onPress={tapOf(p, "dismiss")} />
          <Button label="Save" size="sm" onPress={tapOf(p, "confirm")} />
        </View>
      ) : null}
    </Surface>
  );
}

export type ActionSheetProps = PartBase & { title?: string; message?: string; actions?: ListRow[]; cancel?: string; width?: number };

export function ActionSheet(props: ActionSheetProps) {
  const p = withDefaults<ActionSheetProps>("action-sheet", props);
  const kit = useKit();
  const recipe = recipeOf(kit, "sheet");
  const ios = recipe === "grabber";
  const weui = recipe === "weui";
  const line = withAlpha(c(kit, "on-surface"), 0.14);
  const ink = ios ? accentText(kit) : weui ? c(kit, "on-surface") : c(kit, "primary");
  const rowH = ios || weui ? 56 : 40;
  const actions = p.actions ?? [];
  const groupR = weui ? 0 : ios ? 14 : corner(kit, "xl");
  const groupBg = ios ? (extraColor(kit, "dialogBg") ?? c(kit, "surface-container-low")) : c(kit, "surface-container-low");
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), rowGap: weui ? 8 : 8, ...(weui ? { backgroundColor: c(kit, "surface"), borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: "hidden" } : null) }} appearance={p} testID={p.testID}>
      <View style={{ borderRadius: groupR, backgroundColor: groupBg, overflow: "hidden" }}>
        {p.title || p.message ? (
          <View style={{ paddingVertical: 14, paddingHorizontal: 16, alignItems: "center", rowGap: 2 }}>
            {p.title ? <RNText style={{ ...typeStyle(kit, "label-large"), fontSize: 13, fontWeight: "600", color: c(kit, "on-surface-variant"), textAlign: "center" }}>{p.title}</RNText> : null}
            {p.message ? <RNText style={{ ...typeStyle(kit, "body-small"), fontSize: 13, color: c(kit, "on-surface-variant"), textAlign: "center" }}>{p.message}</RNText> : null}
          </View>
        ) : null}
        {actions.map((a, i) => (
          <Pressable key={i} accessibilityRole="button" onPress={tapOf(p, `tab:${i}`)} style={{ height: rowH, alignItems: "center", justifyContent: "center", borderTopWidth: 0.5, borderTopColor: line }}>
            <RNText style={{ ...typeStyle(kit, ios || weui ? "body-large" : "label-large"), ...(ios ? { fontSize: 20 } : weui ? { fontSize: 17 } : null), color: i === 0 && ios ? c(kit, "error") : ink }}>{a.label}</RNText>
          </Pressable>
        ))}
      </View>
      {p.cancel ? (
        <Pressable accessibilityRole="button" onPress={tapOf(p, "cancel")} style={{ height: rowH, alignItems: "center", justifyContent: "center", borderRadius: weui ? 0 : ios ? 14 : rowH / 2, backgroundColor: ios || weui ? c(kit, "surface-container-low") : c(kit, "secondary-container") }}>
          <RNText style={{ ...typeStyle(kit, ios || weui ? "body-large" : "label-large"), ...(ios ? { fontSize: 20, fontWeight: "600" } : weui ? { fontSize: 17 } : null), color: ios ? ink : weui ? c(kit, "on-surface") : c(kit, "on-secondary-container") }}>{p.cancel}</RNText>
        </Pressable>
      ) : null}
    </Surface>
  );
}
