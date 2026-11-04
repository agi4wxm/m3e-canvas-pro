import { useEffect, useRef, useState } from "react";
import { PackIcon } from "../PackIcon";

/* The game panels of 17722797729/m3e-canvas game-ui (MIT), each holding the state its fork keeps in
 * Preview.tsx. A rarity's color is the author's data, not a theme role, so it is written as given. */

const HEX = /^#[0-9a-f]{3,8}$/i;

export function SideTabs({ items = [], selected = 0, width = 120 }: { items?: { label: string }[]; selected?: number; width?: number }) {
  const [on, setOn] = useState(selected);
  return (
    <div data-slot="side-tabs" data-selected={on} role="tablist" aria-orientation="vertical" className="bg-surface-container flex flex-col gap-1 rounded-xl p-1" style={{ width }}>
      {items.map((t, i) => (
        <button key={i} type="button" role="tab" aria-selected={i === on} className={`text-label-large truncate rounded-lg px-3 py-2 text-left ${i === on ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant"}`} onClick={() => setOn(i)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Inventory({ columns = 5, rows = 4, filled = 7, width = 380 }: { columns?: number; rows?: number; filled?: number; width?: number }) {
  const [on, setOn] = useState(-1);
  return (
    <div data-slot="inventory" data-selected={on} className="bg-surface-container grid gap-2 rounded-2xl p-3" style={{ width, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns * rows }, (_, i) => (
        <button key={i} type="button" aria-label={`${i + 1}`} aria-pressed={i === on} className={`flex aspect-square items-center justify-center rounded-lg ${i === on ? "bg-primary-container text-on-primary-container" : "bg-surface-container-low text-on-surface-variant"}`} onClick={() => setOn(i)}>
          {i < filled && <PackIcon name="inventory_2" className="size-5" />}
        </button>
      ))}
    </div>
  );
}

export function ItemCell({ icon = "", count = "", name = "", rarity = "", rarityColor = "", badge = "", size = 60 }: { icon?: string; count?: string; name?: string; rarity?: string; rarityColor?: string; badge?: string; size?: number }) {
  return (
    <div data-slot="item-cell" className="inline-flex flex-col items-center gap-0.5" style={{ width: size }}>
      <div className="bg-surface-container-high border-secondary-container text-on-surface relative flex aspect-square w-full items-center justify-center rounded-lg border">
        {icon && <PackIcon name={icon} className="size-7" />}
        {badge && <span className="bg-error text-on-error text-label-small absolute -top-1 -right-1 rounded-full px-1">{badge}</span>}
        {count && <span className="text-label-small text-on-surface absolute right-1 bottom-0">{count}</span>}
        {rarity && (
          <span className="text-label-small absolute top-0 left-0 rounded-br-md rounded-tl-lg px-1 text-white" style={{ background: HEX.test(rarityColor) ? rarityColor : "var(--md-sys-color-outline)" }}>
            {rarity}
          </span>
        )}
      </div>
      {name && <div className="text-label-small text-on-surface-variant w-full truncate text-center">{name}</div>}
    </div>
  );
}

export function TaskBar({ title = "", action = "", done = "", width = 380 }: { title?: string; action?: string; done?: string; width?: number }) {
  const [claimed, setClaimed] = useState(false);
  return (
    <div data-slot="task-bar" data-claimed={claimed} className="bg-surface-container-low flex items-center gap-3 rounded-2xl p-3" style={{ width }}>
      <div className="text-body-medium text-on-surface min-w-0 flex-1 truncate">{title}</div>
      <button type="button" disabled={claimed} className={`text-label-large shrink-0 rounded-full px-4 py-2 ${claimed ? "bg-surface-container-highest text-on-surface-variant" : "bg-primary text-on-primary"}`} onClick={() => setClaimed(true)}>
        {claimed ? done : action}
      </button>
    </div>
  );
}

export function RewardTrack({ rewards = [], value = 0, max = 60, action = "", width = 380 }: { rewards?: { at: number; label: string; icon?: string }[]; value?: number; max?: number; action?: string; width?: number }) {
  const [claimed, setClaimed] = useState<number[]>([]);
  const share = Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100));
  return (
    <div data-slot="reward-track" data-claimed={claimed.length} className="flex flex-col gap-2" style={{ width }}>
      <div className="flex justify-between gap-2">
        {rewards.map((r, i) => {
          const ready = value >= r.at && !claimed.includes(i);
          return (
            <button key={i} type="button" disabled={!ready} data-ready={ready || undefined} className={`text-label-small flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg p-2 ${ready ? "bg-primary-container text-on-primary-container" : "bg-surface-container text-on-surface-variant"}`} onClick={() => setClaimed((c) => [...c, i])}>
              {r.icon && <PackIcon name={claimed.includes(i) ? "check" : r.icon} className="size-5" />}
              <span className="truncate">{r.label}</span>
              {ready && action && <span className="truncate">{action}</span>}
            </button>
          );
        })}
      </div>
      <div className="bg-surface-container-highest h-1.5 overflow-hidden rounded-full" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        <div className="bg-primary h-full rounded-full" style={{ width: `${share}%` }} />
      </div>
      <div className="flex justify-between">
        {rewards.map((r, i) => (
          <span key={i} className="text-label-small text-on-surface-variant flex-1 text-center">
            {r.at}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CheckIn({ title = "", days = 30, signed = 3, width = 300 }: { title?: string; days?: number; signed?: number; width?: number }) {
  const [count, setCount] = useState(signed);
  return (
    <div data-slot="check-in" data-signed={count} className="bg-surface-container-low flex flex-col gap-2 rounded-2xl p-3" style={{ width }}>
      {title && <div className="text-title-small text-on-surface">{title}</div>}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: days }, (_, i) => {
          const today = i === count;
          return (
            <button key={i} type="button" disabled={!today} aria-current={today ? "date" : undefined} className={`text-label-small flex aspect-square items-center justify-center rounded-full ${i < count ? "bg-primary text-on-primary" : today ? "border-primary text-primary border-2" : "text-on-surface-variant"}`} onClick={() => setCount((c) => c + 1)}>
              {i < count ? <PackIcon name="check" className="size-3" /> : i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const UNIT_SECONDS: Record<string, number> = { second: 1, minute: 60, hour: 3600 };

export function FunctionButton({ icon = "", label = "", timer = 0, unit = "minute", size = 50 }: { icon?: string; label?: string; timer?: number; unit?: string; size?: number }) {
  const start = timer * (UNIT_SECONDS[unit] ?? 60);
  const [left, setLeft] = useState(start);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setLeft(start);
    /* on the canvas a part is a drawing: it only counts down in the preview */
    if (start <= 0 || ref.current?.closest("[inert]")) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [start]);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = left >= 3600 ? `${pad(Math.floor(left / 3600))}:${pad(Math.floor(left / 60) % 60)}:${pad(left % 60)}` : `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
  return (
    <div ref={ref} data-slot="function-button" data-left={left} className="inline-flex flex-col items-center gap-0.5" style={{ width: size + 24 }}>
      <button type="button" aria-label={label} className="bg-secondary-container text-on-secondary-container flex items-center justify-center rounded-full" style={{ width: size, height: size }}>
        {icon && <PackIcon name={icon} className="size-6" />}
      </button>
      <span className="text-label-small text-on-surface w-full truncate text-center">{label}</span>
      {start > 0 && <span className="text-label-small text-on-surface-variant">{clock}</span>}
    </div>
  );
}
