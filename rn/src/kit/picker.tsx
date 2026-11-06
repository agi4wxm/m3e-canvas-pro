import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, Text as RNText, View } from "react-native";

import { Glyph } from "./icons/Icon";
import { withAlpha } from "./look";
import { panelStyle } from "./recipes";
import { corner, recipeOf, typeStyle, useKit, type Kit } from "./theme/ThemeProvider";

/* What floats over the screen when a control is tapped: a list (a select's options, a menu's actions), and the
 * platform's date and time pickers (Android's dialog, iOS's picker in a sheet, a month the kit draws on the web, where
 * there is none). Shared by the pickers and by an input that takes a date or a time. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/** a list floating over the screen: a select's options, a menu's actions */
export function Popup({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const kit = useKit();
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: withAlpha(c(kit, "scrim") || "#000000", 0.32), alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Pressable onPress={() => {}} style={panelStyle(kit, { minWidth: 220, maxWidth: 360, paddingVertical: 8, borderRadius: recipeOf(kit, "menu") === "ios" ? 13 : corner(kit, "xs"), backgroundColor: c(kit, "surface-container"), boxShadow: "0px 1px 2px 0px #0000004D, 0px 2px 6px 2px #00000026" })}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** a month to pick a day from, where the platform has no picker of its own (the web) */
export function MonthGrid({ value, onPick }: { value: Date; onPick: (d: Date) => void }) {
  const kit = useKit();
  const [month, setMonth] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array.from({ length: first }, () => 0), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <View style={{ width: 308, padding: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <RNText style={{ flex: 1, ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>{`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}</RNText>
        <Pressable accessibilityLabel="Previous month" onPress={() => shift(-1)} style={{ padding: 8 }}>
          <Glyph name="chevron_left" size={24} color={c(kit, "on-surface-variant")} />
        </Pressable>
        <Pressable accessibilityLabel="Next month" onPress={() => shift(1)} style={{ padding: 8 }}>
          <Glyph name="chevron_right" size={24} color={c(kit, "on-surface-variant")} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((d, i) => {
          const on = d === value.getDate() && month.getMonth() === value.getMonth() && month.getFullYear() === value.getFullYear();
          return (
            <Pressable key={i} disabled={!d} onPress={() => onPick(new Date(month.getFullYear(), month.getMonth(), d))} style={{ width: 40, height: 40, margin: 1, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: on ? c(kit, "primary") : "transparent" }}>
              <RNText style={{ ...typeStyle(kit, "body-large"), color: on ? c(kit, "on-primary") : c(kit, "on-surface") }}>{d ? String(d) : ""}</RNText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** a time typed where the platform has no picker of its own (the web): hours and minutes stepped */
function TimeSteps({ value, onPick }: { value: Date; onPick: (d: Date) => void }) {
  const kit = useKit();
  const two = (n: number) => String(n).padStart(2, "0");
  const step = (h: number, m: number) => onPick(new Date(value.getFullYear(), value.getMonth(), value.getDate(), (value.getHours() + h + 24) % 24, (value.getMinutes() + m + 60) % 60));
  const column = (label: string, v: string, up: () => void, down: () => void) => (
    <View style={{ alignItems: "center" }}>
      <Pressable accessibilityLabel={`${label} up`} onPress={up} style={{ padding: 8 }}>
        <Glyph name="keyboard_arrow_up" size={24} color={c(kit, "on-surface-variant")} />
      </Pressable>
      <RNText style={{ ...typeStyle(kit, "display-small"), color: c(kit, "on-surface") }}>{v}</RNText>
      <Pressable accessibilityLabel={`${label} down`} onPress={down} style={{ padding: 8 }}>
        <Glyph name="keyboard_arrow_down" size={24} color={c(kit, "on-surface-variant")} />
      </Pressable>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 16, padding: 12 }}>
      {column("Hours", two(value.getHours()), () => step(1, 0), () => step(-1, 0))}
      <RNText style={{ ...typeStyle(kit, "display-small"), color: c(kit, "on-surface") }}>:</RNText>
      {column("Minutes", two(value.getMinutes()), () => step(0, 1), () => step(0, -1))}
    </View>
  );
}

/** Asks the platform for a date or a time: Android's dialog, iOS's picker in a sheet, the kit's own on the web. */
export function usePicker(mode: "date" | "time", value: Date, set: (d: Date) => void) {
  const [open, setOpen] = useState(false);
  const show = () => {
    if (Platform.OS === "android") DateTimePickerAndroid.open({ value, mode, onChange: (_e, d) => d && set(d) });
    else setOpen(true);
  };
  const sheet = (
    <Popup open={open} onClose={() => setOpen(false)}>
      {Platform.OS === "ios" ? (
        <DateTimePicker value={value} mode={mode} display={mode === "date" ? "inline" : "spinner"} onChange={(_e, d) => d && set(d)} />
      ) : mode === "date" ? (
        <MonthGrid
          value={value}
          onPick={(d) => {
            set(d);
            setOpen(false);
          }}
        />
      ) : (
        <TimeSteps value={value} onPick={set} />
      )}
    </Popup>
  );
  return { show, sheet };
}

const two = (n: number) => String(n).padStart(2, "0");

/** a day as a form sends it: YYYY-MM-DD */
export const dayOf = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** a time of day as a form sends it: HH:MM */
export const timeOf = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

/** what an input of dates or times holds, read back as a date (now, when it holds none it can read) */
export function dateOfValue(value: string | undefined, kind: "date" | "time" | "datetime"): Date {
  const now = new Date();
  if (!value) return now;
  if (kind === "time") {
    const m = /^(\d{1,2}):(\d{2})/.exec(value);
    return m ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2])) : now;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : now;
}
