import { useEffect, useId, useRef, useState } from "react";
import { Icon as Iconify } from "@iconify/react/offline";
import type { IconFamily } from "@/components/m3e/icon-family";
import { loadPreview, type IconShard } from "@/components/m3e/icon-sets/load";
import type { Palette } from "@/lib/tokens";
import { Icon } from "./Icon";
import { useDismiss } from "./ui";

/* The icon families a style can draw with, each shown by a few of its own glyphs: names alone (Phosphor,
 * Tabler, MingCute) say nothing to most people. The glyphs are one small file fetched when this is shown. */

/** the names every family is shown by, in this order */
const SHOWN = ["home", "search", "favorite", "chat", "settings"];

/** what has arrived, kept for the next time the panel opens */
let arrived: IconShard | undefined;

function Glyphs({ family, preview, size }: { family: IconFamily; preview?: IconShard; size: number }) {
  const set = family === "filled" ? "rounded" : family;
  return (
    <span aria-hidden style={{ display: "inline-flex", gap: Math.round(size / 3), flexShrink: 0 }}>
      {SHOWN.map((name) => {
        const id = preview?.map?.[`${set}/${name}`]?.[family === "filled" ? 1 : 0];
        return id ? <Iconify key={name} icon={id} width={size} height={size} data-family={family} /> : <span key={name} style={{ width: size, height: size }} />;
      })}
    </span>
  );
}

export function IconFamilyPicker({
  value,
  options,
  onChange,
  p,
  label,
}: {
  value: IconFamily;
  options: { key: IconFamily; label: string }[];
  onChange: (family: IconFamily) => void;
  p: Palette;
  label: string;
}) {
  const [preview, setPreview] = useState(arrived);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const list = useId();
  useEffect(() => {
    if (arrived) return;
    let alive = true;
    void loadPreview().then((shard) => {
      arrived = shard;
      if (alive) setPreview(shard);
    });
    return () => {
      alive = false;
    };
  }, []);
  useDismiss(open, () => setOpen(false), [box]);
  const current = options.find((o) => o.key === value) ?? options[0];
  return (
    <div ref={box} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? list : undefined}
        aria-label={label}
        className="m3-press"
        style={{ width: "100%", height: 48, padding: "0 12px 0 14px", borderRadius: open ? "12px 12px 4px 4px" : 12, border: "none", background: p.surfaceContainerHigh, color: p.onSurface, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontSize: 14, fontWeight: 600, textAlign: "left" }}
      >
        <Glyphs family={current.key} preview={preview} size={18} />
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.label}</span>
        <Icon name={open ? "expand_less" : "expand_more"} size={20} />
      </button>
      {open && (
        <div
          id={list}
          role="listbox"
          aria-label={label}
          style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4, padding: 4, borderRadius: "4px 4px 12px 12px", background: p.surfaceContainerHigh }}
        >
          {options.map((o) => {
            const on = o.key === value;
            return (
              <button
                key={o.key}
                role="option"
                aria-selected={on}
                data-family={o.key}
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
                className="m3-press"
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", background: on ? p.secondaryContainer : "transparent", color: on ? p.onSecondaryContainer : p.onSurface }}
              >
                <Glyphs family={o.key} preview={preview} size={16} />
                <span style={{ fontSize: 12, fontWeight: on ? 600 : 500, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
