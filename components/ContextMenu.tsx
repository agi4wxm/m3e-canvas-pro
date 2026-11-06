import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { Icon } from "./Icon";

/* The canvas's right-click menu, the way Figma's is: a column of commands at the pointer, with their keys, grouped by
 * dividers, and a submenu for picking a layer further out. It closes on a choice, a press outside, Escape or a scroll;
 * the arrow keys walk it and Enter runs what is lit. It does nothing itself: each entry runs what it is given. */

export type MenuEntry = { key: string; label: string; icon?: string; keys?: string; run?: () => void; disabled?: boolean; danger?: boolean; sub?: MenuEntry[] } | "divider";

const W = 248;
const ROW = 32;

function MenuList({ entries, x, y, onDone, p, depth = 0 }: { entries: MenuEntry[]; x: number; y: number; onDone: () => void; p: Palette; depth?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x, y });
  const [lit, setLit] = useState(-1);
  const [open, setOpen] = useState<number | null>(null);
  const rows = entries.map((e, i) => ({ e, i })).filter((r): r is { e: Exclude<MenuEntry, "divider">; i: number } => r.e !== "divider");
  /* kept inside the window: a menu near the right or the bottom edge opens the other way */
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const nx = r.right > window.innerWidth - 8 ? Math.max(8, depth ? x - W * 2 + 8 : window.innerWidth - r.width - 8) : x;
    const ny = r.bottom > window.innerHeight - 8 ? Math.max(8, window.innerHeight - r.height - 8) : y;
    if (nx !== at.x || ny !== at.y) setAt({ x: nx, y: ny });
    if (depth === 0) box.current?.focus();
  }, []);
  const run = (e: Exclude<MenuEntry, "divider">, i: number) => {
    if (e.disabled) return;
    if (e.sub) {
      setOpen(i);
      return;
    }
    onDone();
    e.run?.();
  };
  return (
    <div
      ref={box}
      role="menu"
      tabIndex={-1}
      data-context-menu={depth}
      onKeyDown={(ev) => {
        const live = rows.filter((r) => !r.e.disabled);
        const now = live.findIndex((r) => r.i === lit);
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          ev.stopPropagation();
          const next = live[(now + (ev.key === "ArrowDown" ? 1 : -1) + live.length) % live.length];
          if (next) setLit(next.i);
        } else if ((ev.key === "Enter" || ev.key === " " || ev.key === "ArrowRight") && now >= 0) {
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.key !== "ArrowRight" || live[now].e.sub) run(live[now].e, live[now].i);
        }
      }}
      style={{ position: "fixed", left: at.x, top: at.y, width: W, padding: 6, borderRadius: 16, background: p.surfaceContainer, color: p.onSurface, boxShadow: "0 8px 28px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04)", zIndex: 400 + depth, outline: "none", boxSizing: "border-box" }}
    >
      {entries.map((e, i) =>
        e === "divider" ? (
          <div key={`d${i}`} role="separator" style={{ height: 1, margin: "4px 8px", background: p.outlineVariant }} />
        ) : (
          <div key={e.key} style={{ position: "relative" }}>
            <button
              role="menuitem"
              data-menu-item={e.key}
              aria-disabled={e.disabled || undefined}
              aria-haspopup={e.sub ? "menu" : undefined}
              aria-expanded={e.sub ? open === i : undefined}
              onPointerEnter={() => {
                setLit(i);
                setOpen(e.sub && !e.disabled ? i : null);
              }}
              onClick={() => run(e, i)}
              style={{
                width: "100%",
                height: ROW,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0 10px",
                border: "none",
                borderRadius: 10,
                background: lit === i && !e.disabled ? p.secondaryContainer : "transparent",
                color: e.disabled ? p.outline : e.danger ? p.error : p.onSurface,
                fontSize: 13,
                cursor: e.disabled ? "default" : "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ width: 18, display: "inline-flex", flex: "0 0 auto" }}>{e.icon && <Icon name={e.icon} size={18} />}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
              {e.keys && <span style={{ fontSize: 11, color: p.onSurfaceVariant, flex: "0 0 auto" }}>{e.keys}</span>}
              {e.sub && <Icon name="chevron_right" size={18} />}
            </button>
            {e.sub && open === i && <MenuList entries={e.sub} x={at.x + W - 6} y={at.y + 6 + entries.slice(0, i).reduce((h, x) => h + (x === "divider" ? 9 : ROW), 0)} onDone={onDone} p={p} depth={depth + 1} />}
          </div>
        ),
      )}
    </div>
  );
}

/** the menu at a point of the window, or nothing; `onClose` when it should go */
export function ContextMenu({ at, entries, onClose, p }: { at: { x: number; y: number } | null; entries: MenuEntry[]; onClose: () => void; p: Palette }) {
  const lang = useLang();
  useEffect(() => {
    if (!at) return;
    const away = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.("[data-context-menu]")) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("wheel", onClose, { passive: true });
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("wheel", onClose);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", onClose);
    };
  }, [at, onClose]);
  if (!at || !entries.length) return null;
  return (
    <div aria-label={t("cmMenu", lang)}>
      <MenuList entries={entries} x={at.x} y={at.y} onDone={onClose} p={p} />
    </div>
  );
}
