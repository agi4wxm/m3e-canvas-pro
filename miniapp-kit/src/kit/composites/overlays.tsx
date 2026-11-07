import { View } from "@tarojs/components";

import type { PartBase } from "../atoms/basics";
import { Button } from "../atoms/controls";
import { Words } from "../atoms/words";
import { c, ca } from "../color";
import { Glyph } from "../icons";
import { withDefaults, type ListRow } from "../parts";
import { accentText, extraColor, panelStyle } from "../recipes";
import { Surface } from "../Surface";
import { merge, sx, ROW, type CSS } from "../styles";
import { corner, extra, recipeOf, typeStyle, useKit, type Kit } from "../theme";
import { tapOf } from "./bars";

/* What opens over a screen: dialogs, a sheet from an edge, an action sheet. Each is drawn where the design puts it, as
 * the canvas draws it; one that opens on a tap stands in a `Layer` over the screen while it is open (the printer puts it
 * there). The style composes each: iOS's narrow alert with its buttons in halves, WeChat's, Material's. */

/** the buttons along the foot of an alert, split in halves by hairlines (iOS, WeChat) */
function SplitActions({ kit, actions }: { kit: Kit; actions: { label: string; onPress?: () => void; main?: boolean }[] }) {
  const weui = recipeOf(kit, "dialog") === "weui";
  const line = ca("on-surface", 0.14);
  return (
    <View style={sx(ROW, { borderTop: `0.5px solid ${line}`, alignItems: "stretch" })}>
      {actions.map((a, i) => (
        <View key={i} ariaRole="button" hoverClass="m3e-pressed" onClick={(e) => (e.stopPropagation(), a.onPress?.())} style={sx(ROW, { flex: 1, height: weui ? 56 : 44, justifyContent: "center", ...(i ? { borderLeft: `0.5px solid ${line}` } : null) })}>
          <Words text={a.label} style={{ ...typeStyle(kit, "body-large"), fontSize: 17, fontWeight: a.main && weui ? 600 : 400, color: weui ? (a.main ? accentText() : c("on-surface")) : c("primary") }} />
        </View>
      ))}
    </View>
  );
}

type Dialogish = { icon?: string; title?: string; description?: string; dismiss?: string; confirm?: string; stacked?: boolean; closeButton?: boolean; filled?: boolean };

/** a dialog's card under the style's dialog recipe */
function DialogCard({ p, base }: { p: PartBase & Dialogish; base?: CSS }) {
  const kit = useKit();
  const recipe = recipeOf(kit, "dialog");
  const actions = [p.dismiss ? { label: p.dismiss, onPress: tapOf(p, "dismiss") } : null, p.confirm ? { label: p.confirm, onPress: tapOf(p, "confirm"), main: true } : null].filter((a): a is { label: string; onPress: (() => void) | undefined; main?: boolean } => !!a);
  if (recipe === "alert" || recipe === "weui") {
    const weui = recipe === "weui";
    return (
      <Surface base={panelStyle(kit, merge({ width: weui ? 320 : 270, borderRadius: weui ? 12 : 14, backgroundColor: extraColor(kit, "dialogBg") ?? c(weui ? "surface-container-low" : "surface-container-high"), overflow: "hidden" }, base))} appearance={p} testID={p.testID} role="dialog">
        <View style={sx({ display: "flex", flexDirection: "column", alignItems: "center", paddingLeft: weui ? 24 : 16, paddingRight: weui ? 24 : 16, paddingTop: weui ? 32 : 20, paddingBottom: weui ? 32 : 20, rowGap: weui ? 16 : 4 })}>
          {p.icon ? <Glyph name={p.icon} size={24} color="secondary" /> : null}
          <Words text={p.title} style={{ ...typeStyle(kit, "title-medium"), fontSize: 17, lineHeight: "22px", fontWeight: 600, color: c("on-surface"), textAlign: "center" }} />
          {p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-small"), fontSize: weui ? 15 : 13, lineHeight: weui ? "22px" : "18px", color: c("on-surface-variant"), textAlign: "center", marginTop: weui ? 0 : 8 }} /> : null}
        </View>
        <SplitActions kit={kit} actions={actions} />
      </Surface>
    );
  }
  const modal = recipe === "modal";
  return (
    <Surface base={panelStyle(kit, merge({ display: "flex", flexDirection: "column", width: 312, padding: 24, rowGap: 16, borderRadius: corner(kit, "xl"), backgroundColor: c("surface-container-high"), boxShadow: "0px 1px 3px 0px rgba(0,0,0,0.3), 0px 4px 8px 3px rgba(0,0,0,0.15)" }, base))} appearance={p} testID={p.testID} role="dialog">
      {p.closeButton ? (
        <View ariaLabel="Close" onClick={(e) => (e.stopPropagation(), tapOf(p, "dismiss")?.())} style={sx({ position: "absolute", top: 12, right: 12 })}>
          <Glyph name="close" size={24} color="on-surface-variant" />
        </View>
      ) : null}
      {p.icon ? (
        <View style={sx({ alignSelf: "center" })}>
          <Glyph name={p.icon} size={24} color="secondary" />
        </View>
      ) : null}
      <Words text={p.title} style={{ ...typeStyle(kit, "headline-small"), color: c("on-surface"), textAlign: p.icon ? "center" : "left" }} />
      {p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} /> : null}
      <View style={sx({ display: "flex", flexDirection: p.stacked ? "column" : "row", justifyContent: "flex-end", alignItems: p.stacked ? "flex-end" : "center", gap: 8, marginTop: 8 })}>
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
      <Surface base={{ width: Math.round(p.width ?? 412), height: Math.round(p.height ?? 640), backgroundColor: c("surface") }} appearance={p} testID={p.testID} role="dialog">
        <View style={sx(ROW, { height: 56, paddingLeft: 4, paddingRight: 4, columnGap: 4 })}>
          <View ariaLabel="Close" onClick={(e) => (e.stopPropagation(), tapOf(p, "dismiss")?.())} style={sx(ROW, { width: 48, height: 48, justifyContent: "center" })}>
            <Glyph name="close" size={24} color="on-surface" />
          </View>
          <Words text={p.title} style={{ flex: 1, ...typeStyle(kit, "title-large"), color: c("on-surface") }} />
          {p.confirm ? <Button label={p.confirm} variant="text" size="sm" onPress={tapOf(p, "confirm")} /> : null}
        </View>
        {p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant"), padding: 24 }} /> : null}
      </Surface>
    );
  const recipe = recipeOf(kit, "dialog");
  return <DialogCard p={p} base={recipe === "alert" || recipe === "weui" ? undefined : { width: Math.max(280, Math.min(560, Math.round(p.dialogWidth ?? 412) - 48)) }} />;
}

export type AlertDialogProps = PartBase & { icon?: string; title?: string; description?: string; cancel?: string; action?: string; size?: "default" | "sm" };

export function AlertDialog(props: AlertDialogProps) {
  const p = withDefaults<AlertDialogProps>("alert-dialog", props);
  const kit = useKit();
  const recipe = recipeOf(kit, "dialog");
  return <DialogCard p={{ ...p, dismiss: p.cancel, confirm: p.action, filled: true, taps: { dismiss: tapOf(p, "cancel") ?? tapOf(p, "dismiss"), confirm: tapOf(p, "action") ?? tapOf(p, "confirm") } }} base={recipe !== "alert" && recipe !== "weui" ? { width: p.size === "sm" ? 280 : 364 } : undefined} />;
}

export type SheetProps = PartBase & { side?: "right" | "left" | "bottom" | "top"; title?: string; description?: string; footer?: boolean };

/** a sheet from an edge: a panel down a side, or one rising from the foot with the style's handle */
export function Sheet(props: SheetProps) {
  const p = withDefaults<SheetProps>("sheet", props);
  const kit = useKit();
  const recipe = recipeOf(kit, "sheet");
  const bottom = p.side === "bottom" || p.side === "top";
  const r = recipe === "grabber" || recipe === "weui" ? 12 : recipe === "panel" ? 0 : corner(kit, "xl");
  const base: CSS = bottom
    ? { width: 412, paddingBottom: 16, backgroundColor: c("surface-container-low"), ...(p.side === "top" ? { borderBottomLeftRadius: r, borderBottomRightRadius: r } : { borderTopLeftRadius: r, borderTopRightRadius: r }) }
    : { width: 320, height: 560, backgroundColor: c("surface-container-low"), borderRadius: recipe === "panel" ? 0 : corner(kit, "lg") };
  const title = extra(kit, "sheetTitle");
  return (
    <Surface base={panelStyle(kit, { ...base, display: "flex", flexDirection: "column" })} appearance={p} testID={p.testID} role="dialog">
      {bottom && p.side === "bottom" && recipe !== "panel" && recipe !== "m3" ? <View style={sx({ alignSelf: "center", marginTop: recipe === "grabber" ? 6 : 16, width: recipe === "grabber" ? 36 : 32, height: recipe === "grabber" ? 5 : 4, borderRadius: 3, backgroundColor: recipe === "grabber" ? ca("on-surface", 0.22) : c("on-surface-variant") })} /> : null}
      <View style={sx(ROW, { alignItems: "flex-start", padding: 24, columnGap: 12 })}>
        <View style={sx({ flex: 1, display: "flex", flexDirection: "column", rowGap: 4 })}>
          <Words text={p.title} style={merge(typeStyle(kit, "title-large"), typeof title === "number" ? { fontSize: title, lineHeight: `${title + 5}px`, fontWeight: 600 } : null, { color: c("on-surface") })} />
          {p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} /> : null}
        </View>
        <View ariaLabel="Close" onClick={(e) => (e.stopPropagation(), tapOf(p, "dismiss")?.())}>
          <Glyph name="close" size={24} color="on-surface-variant" />
        </View>
      </View>
      {p.footer ? (
        <View style={sx(ROW, { justifyContent: "flex-end", columnGap: 8, paddingLeft: 24, paddingRight: 24, marginTop: bottom ? 0 : "auto", paddingBottom: bottom ? 0 : 24 })}>
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
  const line = ca("on-surface", 0.14);
  const ink = ios ? accentText() : weui ? c("on-surface") : c("primary");
  const rowH = ios || weui ? 56 : 40;
  const actions = p.actions ?? [];
  const groupR = weui ? 0 : ios ? 14 : corner(kit, "xl");
  const groupBg = ios ? (extraColor(kit, "dialogBg") ?? c("surface-container-low")) : weui ? c("surface-container-low") : c("surface-container-high");
  return (
    <Surface base={merge({ display: "flex", flexDirection: "column", width: Math.round(p.width ?? 380), rowGap: 8 }, weui ? { backgroundColor: c("surface"), borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: "hidden" } : null)} appearance={p} testID={p.testID} role="dialog">
      <View style={sx({ borderRadius: groupR, backgroundColor: groupBg, overflow: "hidden" })}>
        {p.title || p.message ? (
          <View style={sx({ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, rowGap: 2 })}>
            {p.title ? <Words text={p.title} style={{ ...typeStyle(kit, "label-large"), fontSize: weui ? 17 : 13, fontWeight: weui ? 500 : 600, color: weui ? c("on-surface") : c("on-surface-variant"), textAlign: "center" }} /> : null}
            {p.message ? <Words text={p.message} style={{ ...typeStyle(kit, "body-small"), fontSize: weui ? 12 : 13, color: c("on-surface-variant"), textAlign: "center" }} /> : null}
          </View>
        ) : null}
        {actions.map((a, i) => (
          <View key={i} ariaRole="button" hoverClass="m3e-pressed" onClick={(e) => (e.stopPropagation(), tapOf(p, `tab:${i}`)?.())} style={sx(ROW, { height: rowH, justifyContent: "center", borderTop: !ios && i > 0 ? undefined : `0.5px solid ${line}` })}>
            <Words text={a.label} style={merge(typeStyle(kit, ios || weui ? "body-large" : "label-large"), ios ? { fontSize: 20 } : weui ? { fontSize: 17 } : null, { color: ink })} />
          </View>
        ))}
      </View>
      {p.cancel ? (
        <View ariaRole="button" hoverClass="m3e-pressed" onClick={(e) => (e.stopPropagation(), tapOf(p, "cancel")?.())} style={sx(ROW, { height: rowH, justifyContent: "center", borderRadius: weui ? 0 : ios ? 14 : rowH / 2, backgroundColor: ios || weui ? c("surface-container-low") : c("secondary-container") })}>
          <Words text={p.cancel} style={merge(typeStyle(kit, ios || weui ? "body-large" : "label-large"), ios ? { fontSize: 20, fontWeight: 600 } : weui ? { fontSize: 17 } : null, { color: ios ? ink : weui ? c("on-surface") : c("on-secondary-container") })} />
        </View>
      ) : null}
    </Surface>
  );
}
