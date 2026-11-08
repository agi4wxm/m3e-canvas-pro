import { useRef, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { FilterChip, InputChip } from "@/components/m3e/chip";
import { Input } from "@/components/m3e/input";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";
import { useHost, type HostProps } from "./host";
import { useValue } from "./seed";

/* What a person picks or enters beyond a plain field. Written here on the shadcn M3E controls, after
 * flutter_shadcn_kit's chip input, dropzone, item picker and multiple choice, and Miuix's number picker
 * and color palette. Each is an input (docs/组件规范.md "受控值和草稿"): its value is a prop, handed out on every
 * change, and while someone takes it the prop is what shows. An author's colors are data, not theme roles, so they
 * are written as given. */

const HEX = /^#[0-9a-f]{3,8}$/i;

/** words as a list: the list itself, or one a line (as a variable holds a list) */
const wordsOf = (v: string[] | string) => (Array.isArray(v) ? v.filter((w) => typeof w === "string") : String(v).split("\n").filter((w) => w.trim()));

/* An input of words: the tags are its value (`items`), handed out on every change, each change also sent as `add` or
 * `remove`. What is being typed is a draft of its own: Enter adds it, and it is cleared once added. */
export function TagInput({ items = [], placeholder = "", width = 320, demo, onValueChange, onEvent, wired, className, style }: { items?: string[] | string; placeholder?: string; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [tags, setTags] = useValue(wordsOf(items), host);
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      host.emit("add", { value: tag });
    }
    setDraft("");
  };
  const remove = (tag: string) => {
    setTags(tags.filter((x) => x !== tag));
    host.emit("remove", { value: tag });
  };
  return (
    <div data-slot="tag-input" data-count={tags.length} className={cn("bg-surface-container-highest flex flex-col gap-2 rounded-xl p-2", className)} style={{ width, ...style }}>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <InputChip key={tag} onRemove={() => remove(tag)}>
              {tag}
            </InputChip>
          ))}
        </div>
      )}
      <Input
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder || "Tag"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          add();
        }}
      />
    </div>
  );
}

export function FileUpload({ title = "", hint = "", action = "", multiple = true, accept = "", width = 360, className, style }: { title?: string; hint?: string; action?: string; multiple?: boolean; accept?: string; width?: number } & Look) {
  const input = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const take = (files: FileList | null) => {
    if (files?.length) setNames([...files].map((f) => f.name));
  };
  return (
    <div
      data-slot="file-upload"
      data-over={over || undefined}
      data-count={names.length}
      className={cn(`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center ${over ? "border-primary bg-primary-container" : "border-outline-variant bg-surface-container-low"}`, className)}
      style={{ width, ...style }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <WidgetIcon name="upload_file" className="text-on-surface-variant size-8" />
      {title && <div className="text-title-small text-on-surface">{title}</div>}
      {hint && <div className="text-body-small text-on-surface-variant">{hint}</div>}
      {action && (
        <Button variant="tonal" size="xs" data-tap="action" onClick={() => input.current?.click()}>
          {action}
        </Button>
      )}
      <input ref={input} type="file" hidden multiple={multiple} accept={accept || undefined} onChange={(e) => take(e.target.files)} />
      {names.length > 0 && <div className="text-body-small text-on-surface w-full truncate">{names.join(", ")}</div>}
    </div>
  );
}

/** the arrow keys move a choice along a row of options, wrapping round: what a radio group does */
const step = (key: string, at: number, count: number) => (key === "ArrowRight" || key === "ArrowDown" ? (at + 1) % count : key === "ArrowLeft" || key === "ArrowUp" ? (at - 1 + count) % count : key === "Home" ? 0 : key === "End" ? count - 1 : -1);

/* A choice of one: `selected` is the value (its place among `items`), handed out when another is picked. */
export function ItemPicker({ items = [], columns = 4, selected = 0, width = 320, demo, onValueChange, onEvent, wired, className, style }: { items?: { label: string; icon?: string }[]; columns?: number; selected?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [on, setOn] = useValue(selected, host);
  return (
    <div
      data-slot="item-picker"
      data-selected={on}
      role="radiogroup"
      className={cn("grid gap-2", className)}
      style={{ width, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, ...style }}
      onKeyDown={(e) => {
        const to = items.length ? step(e.key, Math.max(0, on), items.length) : -1;
        if (to < 0) return;
        e.preventDefault();
        setOn(to);
        (e.currentTarget.children[to] as HTMLElement | undefined)?.focus();
      }}
    >
      {items.map((it, i) => (
        <Tap key={i} role="radio" aria-checked={i === on} tabIndex={i === (on >= 0 ? on : 0) ? 0 : -1} className={`text-label-small flex flex-col items-center gap-1 rounded-xl p-2 ${i === on ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-low text-on-surface-variant"}`} onClick={() => setOn(i)}>
          {it.icon && <WidgetIcon name={it.icon} className="size-6" />}
          <span className="w-full truncate">{it.label}</span>
        </Tap>
      ))}
    </div>
  );
}

/** rows counted from 1 in words like "1,3" (or places from 0, as code may give them), as places from 0 */
const placesOf = (picked: string | number[]) => (Array.isArray(picked) ? picked.filter((n) => Number.isInteger(n) && n >= 0) : [...new Set(String(picked).split(/[\s,，]+/).map((x) => Number(x) - 1).filter((n) => Number.isInteger(n) && n >= 0))]);
/** places as the words that hold them: counted from 1, in order */
const wordsOfPlaces = (at: number[]) => [...at].sort((a, b) => a - b).map((n) => n + 1).join(",");

/* A choice of several: `selected` is the value, the rows picked counted from 1 ("1,3"), handed out on every change. */
export function MultiSelect({ items = [], selected = "", width = 320, demo, onValueChange, onEvent, wired, className, style }: { items?: string[]; selected?: string | number[]; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [value, setValue] = useValue(Array.isArray(selected) ? wordsOfPlaces(selected) : String(selected), host);
  const on = placesOf(value);
  return (
    <div data-slot="multi-select" data-selected={on.join(",")} className={cn("flex flex-wrap gap-2", className)} style={{ width, ...style }}>
      {items.map((label, i) => (
        <FilterChip key={i} pressed={on.includes(i)} onPressedChange={(next: boolean) => setValue(wordsOfPlaces(next ? [...on, i] : on.filter((x) => x !== i)))}>
          {label}
        </FilterChip>
      ))}
    </div>
  );
}

/* A choice of one color: `selected` is its place among all the colors given, an unreadable one included (it is only
 * not drawn), so a color picked stays picked when another one is mistyped. */
export function ColorPalette({ colors = [], selected = 0, width = 320, demo, onValueChange, onEvent, wired, className, style }: { colors?: string[]; selected?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [on, setOn] = useValue(selected, host);
  const shown = colors.map((color, i) => ({ color, i })).filter((c) => HEX.test(c.color));
  return (
    <div
      data-slot="color-palette"
      data-selected={HEX.test(colors[on] ?? "") ? colors[on] : ""}
      role="radiogroup"
      className={cn("flex flex-wrap gap-2", className)}
      style={{ width, ...style }}
      onKeyDown={(e) => {
        const at = Math.max(0, shown.findIndex((c) => c.i === on));
        const to = shown.length ? step(e.key, at, shown.length) : -1;
        if (to < 0) return;
        e.preventDefault();
        setOn(shown[to].i);
        (e.currentTarget.children[to] as HTMLElement | undefined)?.focus();
      }}
    >
      {shown.map(({ color, i }, k) => (
        <Tap key={`${color}-${i}`} role="radio" aria-checked={i === on} tabIndex={i === on || (k === 0 && !shown.some((c) => c.i === on)) ? 0 : -1} aria-label={color} className={`flex size-10 items-center justify-center rounded-full ${i === on ? "border-on-surface border-2" : "border-outline-variant border"}`} style={{ background: color }} onClick={() => setOn(i)}>
          {i === on && <WidgetIcon name="check" className="text-on-primary size-5" />}
        </Tap>
      ))}
    </div>
  );
}

/* A number: `value` is the value, kept to its range, handed out on every step. */
export function NumberPicker({ value = 5, min = 0, max = 10, step: by = 1, unit = "", width = 96, demo, onValueChange, onEvent, wired, className, style }: { value?: number; min?: number; max?: number; step?: number; unit?: string; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [given, setN] = useValue(value, host);
  const n = Math.min(max, Math.max(min, given));
  const next = n + by;
  const previous = n - by;
  return (
    <div data-slot="number-picker" data-value={n} className={cn("inline-flex flex-col items-center gap-1", className)} style={{ width, ...style }}>
      <Button variant="text" size="icon-sm" aria-label="Increase" disabled={next > max} onClick={() => setN(next)}>
        <WidgetIcon name="keyboard_arrow_up" />
      </Button>
      <span className="text-body-medium text-on-surface-variant h-6">{next <= max ? next : ""}</span>
      <span data-slot="number-picker-value" role="spinbutton" aria-valuenow={n} aria-valuemin={min} aria-valuemax={max} aria-label={unit || "Value"} className="bg-surface-container-high text-title-large text-on-surface w-full rounded-lg py-1 text-center">
        {n}
        {unit && <span className="text-label-medium text-on-surface-variant ml-1">{unit}</span>}
      </span>
      <span className="text-body-medium text-on-surface-variant h-6">{previous >= min ? previous : ""}</span>
      <Button variant="text" size="icon-sm" aria-label="Decrease" disabled={previous < min} onClick={() => setN(previous)}>
        <WidgetIcon name="keyboard_arrow_down" />
      </Button>
    </div>
  );
}
