import { useRef, useState } from "react";
import { Button } from "@/components/m3e/button";
import { FilterChip, InputChip } from "@/components/m3e/chip";
import { Input } from "@/components/m3e/input";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";

/* What a person picks or enters beyond a plain field. Written here on the shadcn M3E controls, after
 * flutter_shadcn_kit's chip input, dropzone, item picker and multiple choice, and Miuix's number picker
 * and color palette. An author's colors are data, not theme roles, so they are written as given. */

const HEX = /^#[0-9a-f]{3,8}$/i;

export function TagInput({ items = [], placeholder = "", width = 320 }: { items?: string[]; placeholder?: string; width?: number }) {
  const [tags, setTags] = useState(items);
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) setTags((t) => [...t, tag]);
    setDraft("");
  };
  return (
    <div data-slot="tag-input" data-count={tags.length} className="bg-surface-container-highest flex flex-col gap-2 rounded-xl p-2" style={{ width }}>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <InputChip key={tag} onRemove={() => setTags((t) => t.filter((x) => x !== tag))}>
              {tag}
            </InputChip>
          ))}
        </div>
      )}
      <Input
        value={draft}
        placeholder={placeholder}
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

export function FileUpload({ title = "", hint = "", action = "", multiple = true, accept = "", width = 360 }: { title?: string; hint?: string; action?: string; multiple?: boolean; accept?: string; width?: number }) {
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
      className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center ${over ? "border-primary bg-primary-container" : "border-outline-variant bg-surface-container-low"}`}
      style={{ width }}
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
        <Button variant="tonal" size="xs" onClick={() => input.current?.click()}>
          {action}
        </Button>
      )}
      <input ref={input} type="file" hidden multiple={multiple} accept={accept || undefined} onChange={(e) => take(e.target.files)} />
      {names.length > 0 && <div className="text-body-small text-on-surface w-full truncate">{names.join(", ")}</div>}
    </div>
  );
}

export function ItemPicker({ items = [], columns = 4, selected = 0, width = 320 }: { items?: { label: string; icon?: string }[]; columns?: number; selected?: number; width?: number }) {
  const [on, setOn] = useState(selected);
  return (
    <div data-slot="item-picker" data-selected={on} role="radiogroup" className="grid gap-2" style={{ width, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <Tap key={i} role="radio" aria-checked={i === on} className={`text-label-small flex flex-col items-center gap-1 rounded-xl p-2 ${i === on ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-low text-on-surface-variant"}`} onClick={() => setOn(i)}>
          {it.icon && <WidgetIcon name={it.icon} className="size-6" />}
          <span className="w-full truncate">{it.label}</span>
        </Tap>
      ))}
    </div>
  );
}

export function MultiSelect({ items = [], selected = [], width = 320 }: { items?: string[]; selected?: number[]; width?: number }) {
  const [on, setOn] = useState<number[]>(selected);
  return (
    <div data-slot="multi-select" data-selected={on.join(",")} className="flex flex-wrap gap-2" style={{ width }}>
      {items.map((label, i) => (
        <FilterChip key={i} pressed={on.includes(i)} onPressedChange={(next: boolean) => setOn((cur) => (next ? [...cur, i] : cur.filter((x) => x !== i)))}>
          {label}
        </FilterChip>
      ))}
    </div>
  );
}

export function ColorPalette({ colors = [], selected = 0, width = 320 }: { colors?: string[]; selected?: number; width?: number }) {
  const shown = colors.filter((c) => HEX.test(c));
  const [on, setOn] = useState(selected);
  return (
    <div data-slot="color-palette" data-selected={shown[on] ?? ""} role="radiogroup" className="flex flex-wrap gap-2" style={{ width }}>
      {shown.map((color, i) => (
        <Tap key={`${color}-${i}`} role="radio" aria-checked={i === on} aria-label={color} className={`flex size-10 items-center justify-center rounded-full ${i === on ? "border-on-surface border-2" : "border-outline-variant border"}`} style={{ background: color }} onClick={() => setOn(i)}>
          {i === on && <WidgetIcon name="check" className="text-on-primary size-5" />}
        </Tap>
      ))}
    </div>
  );
}

export function NumberPicker({ value = 5, min = 0, max = 10, step = 1, unit = "", width = 96 }: { value?: number; min?: number; max?: number; step?: number; unit?: string; width?: number }) {
  const [n, setN] = useState(Math.min(max, Math.max(min, value)));
  const next = n + step;
  const previous = n - step;
  return (
    <div data-slot="number-picker" data-value={n} className="inline-flex flex-col items-center gap-1" style={{ width }}>
      <Button variant="text" size="icon-sm" aria-label="Increase" disabled={next > max} onClick={() => setN(next)}>
        <WidgetIcon name="keyboard_arrow_up" />
      </Button>
      <span className="text-body-medium text-on-surface-variant h-6">{next <= max ? next : ""}</span>
      <span className="bg-surface-container-high text-title-large text-on-surface w-full rounded-lg py-1 text-center">
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
