import { Image as ExpoImage } from "expo-image";
import { useState, type ReactNode } from "react";
import { Pressable, Text as RNText, TextInput, View } from "react-native";

import type { PartBase } from "../atoms/basics";
import { Button, Checkbox, RadioMark } from "../atoms/controls";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { withAlpha } from "../look";
import { clampInt, sourceOf, withDefaults, type ListRow, type Picture } from "../parts";
import { accentText, fieldStyle } from "../recipes";
import { Surface } from "../Surface";
import { corner, recipeOf, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { TextField } from "./forms";
import { tapOf } from "./bars";

/* More of what screens are made of, after the most common: a group of radio buttons, an input with what goes before and
 * after it, a grid of shortcuts, an accordion, a block of code, a place to drop files, a scene behind a game screen, a
 * side bar and a sign-in form. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

export type RadioGroupProps = PartBase & {
  items?: ListRow[];
  selected?: number;
  layout?: "column" | "row";
  error?: boolean;
  disabled?: boolean;
  /** told of the option chosen; given, `selected` says which is chosen (a form's field holds it) */
  onSelect?: (index: number, label: string) => void;
};

export function RadioGroup(props: RadioGroupProps) {
  const p = withDefaults<RadioGroupProps>("radio-group", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [own, setOwn] = useState(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)));
  const chosen = p.onSelect ? clampInt(p.selected ?? -1, -1, items.length - 1) : own;
  const setChosen = (i: number) => {
    setOwn(i);
    p.onSelect?.(i, items[i]?.label ?? "");
  };
  return (
    <View testID={p.testID} accessibilityRole="radiogroup" style={{ flexDirection: p.layout === "row" ? "row" : "column", gap: p.layout === "row" ? 16 : 12, alignSelf: "flex-start" }}>
      {items.map((it, i) => (
        <Pressable
          key={i}
          accessibilityRole="radio"
          accessibilityState={{ checked: i === chosen, disabled: !!p.disabled }}
          disabled={p.disabled}
          onPress={() => {
            setChosen(i);
            tapOf(p, `tab:${i}`)?.();
          }}
          style={{ flexDirection: "row", alignItems: "center", columnGap: 12 }}
        >
          <RadioMark on={i === chosen} disabled={p.disabled} />
          <RNText style={{ ...typeStyle(kit, "body-large"), color: c(kit, p.error ? "error" : "on-surface") }}>{it.label}</RNText>
        </Pressable>
      ))}
    </View>
  );
}

export type InputGroupProps = PartBase & { placeholder?: string; leadingIcon?: string; leadingText?: string; trailingText?: string; button?: string; error?: boolean; disabled?: boolean; width?: number };

export function InputGroup(props: InputGroupProps) {
  const p = withDefaults<InputGroupProps>("input-group", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useState("");
  const { box } = fieldStyle(kit, "outlined");
  const muted = c(kit, "on-surface-variant");
  return (
    <View testID={p.testID} style={[{ width: Math.round(p.width ?? 320), height: 56, flexDirection: "row", alignItems: "center", columnGap: 8, paddingHorizontal: 12, opacity: p.disabled ? 0.38 : 1, ...box, ...(p.error ? { borderColor: c(kit, "error") } : null) }, fill]}>
      {p.leadingIcon ? <Glyph name={p.leadingIcon} size={20} color={muted} /> : null}
      {p.leadingText ? <RNText style={{ ...typeStyle(kit, "body-large"), color: muted }}>{p.leadingText}</RNText> : null}
      <TextInput accessibilityLabel={p.placeholder} editable={!p.disabled} value={text} onChangeText={setText} placeholder={p.placeholder} placeholderTextColor={muted} style={{ flex: 1, minWidth: 0, ...typeStyle(kit, "body-large"), color: c(kit, "on-surface"), paddingVertical: 0 }} />
      {p.trailingText ? <RNText style={{ ...typeStyle(kit, "body-large"), color: muted }}>{p.trailingText}</RNText> : null}
      {p.button ? <Button label={p.button} size="xs" variant="tonal" onPress={tapOf(p, "button")} /> : null}
    </View>
  );
}

export type IconGridProps = PartBase & { items?: ListRow[]; columns?: number; badge?: string; width?: number };

/** a grid of shortcuts: an icon in a tinted tile and its name under it, a dot or a word on the new ones */
export function IconGrid(props: IconGridProps) {
  const p = withDefaults<IconGridProps>("icon-grid", props);
  const kit = useKit();
  const fill = useFill();
  const cols = clampInt(p.columns ?? 4, 1, 8);
  const items = p.items ?? [];
  const tile = recipeOf(kit, "icon") === "tile";
  return (
    <View testID={p.testID} style={[{ width: Math.round(p.width ?? 380), flexDirection: "row", flexWrap: "wrap", rowGap: 16 }, fill]}>
      {items.map((it, i) => (
        <Pressable key={i} accessibilityRole="button" accessibilityLabel={it.label} onPress={tapOf(p, `tab:${i}`)} style={{ width: `${100 / cols}%`, alignItems: "center", rowGap: 6 }}>
          <View style={{ width: 48, height: 48, borderRadius: tile ? 12 : 24, backgroundColor: c(kit, "secondary-container"), alignItems: "center", justifyContent: "center" }}>
            <Glyph name={it.icon || "apps"} size={24} color={c(kit, "on-secondary-container")} />
            {it.variant === "dot" ? <View style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: c(kit, "error") }} /> : null}
            {it.variant === "new" ? (
              <View style={{ position: "absolute", top: -6, right: -14, paddingHorizontal: 4, height: 16, borderRadius: 8, backgroundColor: c(kit, "error"), justifyContent: "center" }}>
                <RNText style={{ ...typeStyle(kit, "label-small"), lineHeight: 16, color: c(kit, "on-error") }}>{p.badge}</RNText>
              </View>
            ) : null}
          </View>
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface") }}>{it.label}</RNText>
        </Pressable>
      ))}
    </View>
  );
}

export type AccordionProps = PartBase & { items?: ListRow[]; content?: string; openFirst?: boolean; multiple?: boolean; width?: number };

export function Accordion(props: AccordionProps) {
  const p = withDefaults<AccordionProps>("accordion", props);
  const kit = useKit();
  const fill = useFill();
  const [open, setOpen] = useState<number[]>(p.openFirst ? [0] : []);
  const items = p.items ?? [];
  return (
    <View testID={p.testID} style={[{ width: Math.round(p.width ?? 360) }, fill]}>
      {items.map((it, i) => {
        const on = open.includes(i);
        return (
          <View key={i} style={{ borderBottomWidth: 1, borderBottomColor: c(kit, "outline-variant") }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : p.multiple ? [...o, i] : [i]))} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", columnGap: 12 }}>
              <RNText style={{ flex: 1, ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface") }}>{it.label}</RNText>
              <Glyph name={on ? "expand_less" : "expand_more"} size={24} color={c(kit, "on-surface-variant")} />
            </Pressable>
            {on && p.content ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant"), paddingBottom: 16 }}>{p.content}</RNText> : null}
          </View>
        );
      })}
    </View>
  );
}

export type CodeBlockProps = PartBase & { code?: string; language?: string; width?: number };

export function CodeBlock(props: CodeBlockProps) {
  const p = withDefaults<CodeBlockProps>("code-block", props);
  const kit = useKit();
  const fill = useFill();
  return (
    <Surface base={{ width: Math.round(p.width ?? 420), borderRadius: corner(kit, "md"), backgroundColor: c(kit, "surface-container-high"), overflow: "hidden" }} style={fill} appearance={p} testID={p.testID}>
      {p.language ? <RNText style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface-variant"), paddingHorizontal: 16, paddingTop: 10 }}>{p.language}</RNText> : null}
      <RNText style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 20, color: c(kit, "on-surface"), padding: 16 }}>{p.code}</RNText>
    </Surface>
  );
}

export type FileUploadProps = PartBase & {
  title?: string;
  hint?: string;
  action?: string;
  multiple?: boolean;
  accept?: string;
  width?: number;
  /** the names of the files chosen, shown in place of the hint */
  chosen?: string;
  error?: boolean;
};

/** where files are dropped: a dashed panel with a button that picks them (the app wires the picker it uses) */
export function FileUpload(props: FileUploadProps) {
  const p = withDefaults<FileUploadProps>("file-upload", props);
  const kit = useKit();
  const fill = useFill();
  const hint = p.chosen || p.hint;
  return (
    <Surface base={{ width: Math.round(p.width ?? 360), padding: 24, rowGap: 8, alignItems: "center", borderRadius: corner(kit, "lg"), borderWidth: 2, borderStyle: "dashed", borderColor: c(kit, p.error ? "error" : "outline-variant"), backgroundColor: c(kit, "surface-container-low") }} style={fill} appearance={p} testID={p.testID}>
      <Glyph name={p.chosen ? "task" : "upload_file"} size={32} color={c(kit, "primary")} />
      <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface") }}>{p.title}</RNText>
      {hint ? <RNText style={{ ...typeStyle(kit, "body-small"), color: c(kit, p.chosen ? "on-surface" : "on-surface-variant") }}>{hint}</RNText> : null}
      {p.action ? <Button label={p.action} variant="tonal" size="sm" onPress={tapOf(p, "action") ?? p.onPress} /> : null}
    </Surface>
  );
}

export type SceneProps = PartBase & { image?: Picture; scrim?: string; icon?: string; width?: number; height?: number; children?: ReactNode };

/** the picture a game screen stands on, with what is laid over it; a motion the editor animates is still here */
export function Scene(props: SceneProps & Record<string, unknown>) {
  const p = withDefaults<SceneProps>("scene", props);
  const kit = useKit();
  return (
    <Surface base={{ width: Math.round(p.width ?? 412), height: Math.round(p.height ?? 892), backgroundColor: c(kit, "surface-container-high"), overflow: "hidden", alignItems: "center", justifyContent: "center" }} appearance={p} testID={p.testID}>
      {p.image ? <ExpoImage source={sourceOf(p.image)} contentFit="cover" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} /> : <Glyph name={p.icon || "landscape"} size={48} color={c(kit, "outline")} />}
      {p.scrim && p.scrim !== "none" ? <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: withAlpha("#000000", 0.35) }} /> : null}
      {p.children}
    </Surface>
  );
}

export type SidebarProps = PartBase & { label?: string; items?: ListRow[]; selected?: number; size?: string; width?: number; height?: number };

export function Sidebar(props: SidebarProps) {
  const p = withDefaults<SidebarProps>("sidebar", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [chosen, setChosen] = useState(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)));
  return (
    <Surface base={{ width: Math.round(p.width ?? 288), height: Math.round(p.height ?? 400), padding: 12, rowGap: 4, backgroundColor: c(kit, "surface-container-low") }} appearance={p} testID={p.testID}>
      {p.label ? <RNText style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface-variant"), paddingHorizontal: 12, paddingVertical: 8 }}>{p.label}</RNText> : null}
      {items.map((it, i) => (
        <Pressable
          key={i}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === chosen }}
          onPress={() => {
            setChosen(i);
            tapOf(p, `tab:${i}`)?.();
          }}
          style={{ height: 48, borderRadius: 24, flexDirection: "row", alignItems: "center", columnGap: 12, paddingHorizontal: 16, backgroundColor: i === chosen ? c(kit, "secondary-container") : "transparent" }}
        >
          {it.icon ? <Glyph name={it.icon} size={24} filled={i === chosen} color={c(kit, i === chosen ? "on-secondary-container" : "on-surface-variant")} /> : null}
          <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, i === chosen ? "on-secondary-container" : "on-surface-variant") }}>{it.label}</RNText>
        </Pressable>
      ))}
    </Surface>
  );
}

export type AuthFormProps = PartBase & {
  mode?: "sign-in" | "sign-up";
  title?: string;
  subtitle?: string;
  upTitle?: string;
  nameLabel?: string;
  emailLabel?: string;
  passwordLabel?: string;
  confirmLabel?: string;
  remember?: string;
  forgot?: string;
  action?: string;
  upAction?: string;
  toUp?: string;
  toIn?: string;
  others?: ListRow[];
  width?: number;
};

/** A sign-in (or sign-up) form: its fields, its main button, other ways in and the switch between the two. Each button is
 *  a place with an action of its own, under the part's slot names (parts/defs/app.ts): `submit`, `forgot`, `switch` and
 *  `other:<i>`; one with none is a tap on the whole part, as on the web. */
export function AuthForm(props: AuthFormProps & Record<string, unknown>) {
  const p = withDefaults<AuthFormProps>("auth-form", props);
  const kit = useKit();
  const fill = useFill();
  const [up, setUp] = useState(p.mode === "sign-up");
  const w = Math.round(p.width ?? 380);
  return (
    <View testID={p.testID} style={[{ width: w, rowGap: 16 }, fill]}>
      <View style={{ rowGap: 4 }}>
        <RNText style={{ ...typeStyle(kit, "headline-small"), color: c(kit, "on-surface") }}>{up ? p.upTitle : p.title}</RNText>
        {p.subtitle && !up ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant") }}>{p.subtitle}</RNText> : null}
      </View>
      {up ? <TextField label={p.nameLabel} width={w} /> : null}
      <TextField label={p.emailLabel} width={w} />
      <TextField label={p.passwordLabel} width={w} />
      {up ? <TextField label={p.confirmLabel} width={w} /> : null}
      {!up ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Checkbox label={p.remember} checked={false} />
          {p.forgot ? (
            <Pressable accessibilityRole="button" onPress={tapOf(p, "forgot")}>
              <RNText style={{ ...typeStyle(kit, "label-large"), color: accentText(kit) }}>{p.forgot}</RNText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Button label={up ? p.upAction : p.action} width={w} onPress={tapOf(p, "submit")} />
      {(p.others ?? []).map((o, i) => (
        <Button key={i} label={o.label} variant="outlined" width={w} onPress={tapOf(p, `other:${i}`)} />
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setUp((v) => !v);
          tapOf(p, "switch")?.();
        }}
        style={{ alignSelf: "center" }}
      >
        <RNText style={{ ...typeStyle(kit, "label-large"), color: accentText(kit) }}>{up ? p.toIn : p.toUp}</RNText>
      </Pressable>
    </View>
  );
}
