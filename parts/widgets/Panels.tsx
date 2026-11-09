import { useEffect, useRef, useState } from "react";
import { PAINTABLE, type Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";
import { useHost, type HostProps } from "./host";
import { keysOf, secondsLeft, usePicked, useSeeded } from "./seed";

/* The game panels, after 17722797729/m3e-canvas game-ui (MIT). What is claimed, checked in or picked is the game's to
 * say and comes in as props; a press only asks, and only a prototype's demo marks things done by itself. A rarity's
 * color is one color value (parts/color.ts), worked out to CSS by the part: painted only when it is one (`PAINTABLE`). */

export function Inventory({ columns = 5, rows = 4, filled = 7, width = 380, className, style }: { columns?: number; rows?: number; filled?: number; width?: number } & Look) {
  const [on, setOn] = useState(-1);
  return (
    <div data-slot="inventory" data-selected={on} className={cn("bg-surface-container grid gap-2 rounded-2xl p-3", className)} style={{ width, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, ...style }}>
      {Array.from({ length: columns * rows }, (_, i) => (
        <Tap key={i} aria-label={`${i + 1}`} aria-pressed={i === on} data-slot="inventory-cell" data-filled={i < filled || undefined} className={`flex aspect-square items-center justify-center rounded-lg ${i === on ? "bg-primary-container text-on-primary-container" : "bg-surface-container-low text-on-surface-variant"}`} onClick={() => setOn(i)}>
          {i < filled && <WidgetIcon name="inventory_2" className="size-5" />}
        </Tap>
      ))}
    </div>
  );
}

export function ItemCell({ icon = "", count = "", name = "", rarity = "", rarityColor = "", badge = "", selected = false, size = 60, className, style }: { icon?: string; count?: string; name?: string; rarity?: string; rarityColor?: string; badge?: string; selected?: boolean; size?: number } & Look) {
  /* whether it is the one picked is whoever draws it to say */
  return (
    <div data-slot="item-cell" data-selected={selected || undefined} className={cn("inline-flex flex-col items-center gap-0.5", className)} style={{ width: size, ...style }}>
      <div data-slot="item-cell-frame" className={cn("bg-surface-container-high text-on-surface relative flex aspect-square w-full items-center justify-center rounded-lg border", selected ? "border-primary ring-primary ring-2" : "border-secondary-container")}>
        {icon && <WidgetIcon name={icon} className="size-7" />}
        {badge && <span data-slot="item-cell-badge" className="bg-error text-on-error text-label-small absolute -top-1 -right-1 rounded-full px-1">{badge}</span>}
        {count && <span data-slot="item-cell-value" className="text-label-small text-on-surface absolute right-1 bottom-0">{count}</span>}
        {rarity && (
          <span data-slot="item-cell-tag" className="text-label-small absolute top-0 left-0 rounded-br-md rounded-tl-lg px-1 text-on-primary" style={{ background: PAINTABLE.test(rarityColor) ? rarityColor : "var(--md-sys-color-outline)" }}>
            {rarity}
          </span>
        )}
      </div>
      {name && <div data-slot="item-cell-label" className="text-label-small text-on-surface-variant w-full truncate text-center">{name}</div>}
    </div>
  );
}

export function TaskBar({ title = "", action = "", done = "", width = 380, className, style }: { title?: string; action?: string; done?: string; width?: number } & Look) {
  const [claimed, setClaimed] = useState(false);
  return (
    <div data-slot="task-bar" data-claimed={claimed} className={cn("bg-surface-container-low flex items-center gap-3 rounded-2xl p-3", className)} style={{ width, ...style }}>
      <div data-slot="task-bar-title" className="text-body-medium text-on-surface min-w-0 flex-1 truncate">{title}</div>
      <Button variant={claimed ? "tonal" : "filled"} size="xs" disabled={claimed} className="shrink-0" onClick={() => setClaimed(true)}>
        {claimed ? done : action}
      </Button>
    </div>
  );
}

/** rows counted from 1 in words like "1,3", as places from 0 */
const rowsIn = (words: string) => new Set(words.split(/[\s,，]+/).map((x) => Number(x) - 1).filter((n) => Number.isInteger(n) && n >= 0));

/* Which rewards are claimed is the game's to say (`claimed`, the rows counted from 1): a press on a ready one asks (one
 * action for every reward, `slot.index` is the row). A prototype's demo marks it claimed itself, by the reward (where
 * it stands and what it is), so a claim stays with its reward when the rows move and goes when the reward does. */
export function RewardTrack({ rewards = [], value = 0, max = 60, claimed = "", action = "", width = 380, demo, onValueChange, onEvent, wired, className, style }: { rewards?: { at: number; label: string; icon?: string }[]; value?: number; max?: number; claimed?: string; action?: string; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const keys = keysOf(rewards.map((r) => `${r.at}\u0001${r.label}`));
  const [mine, setMine] = usePicked(keys);
  const given = rowsIn(claimed);
  const done = (i: number) => given.has(i) || (host.demo && mine.includes(keys[i]));
  const share = Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100));
  return (
    <div data-slot="reward-track" data-claimed={rewards.filter((_, i) => done(i)).length} className={cn("flex flex-col gap-2", className)} style={{ width, ...style }}>
      <div className="flex justify-between gap-2">
        {rewards.map((r, i) => {
          const ready = value >= r.at && !done(i);
          return (
            <Tap key={i} disabled={!ready} data-tap={`tab:${i}`} data-ready={ready || undefined} data-claimed={done(i) || undefined} data-slot="reward-track-cell" className={`text-label-small flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg p-2 ${ready ? "bg-primary-container text-on-primary-container" : "bg-surface-container text-on-surface-variant"}`} onClick={() => host.demo && setMine((c) => [...c, keys[i]])}>
              {r.icon && <WidgetIcon name={done(i) ? "check" : r.icon} className="size-5" />}
              <span className="truncate">{r.label}</span>
              {ready && action && <span className="truncate">{action}</span>}
            </Tap>
          );
        })}
      </div>
      <div data-slot="reward-track-track" className="bg-surface-container-highest h-1.5 overflow-hidden rounded-full" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        <div data-slot="reward-track-fill" className="bg-primary h-full rounded-full" style={{ width: `${share}%` }} />
      </div>
      <div className="flex justify-between">
        {rewards.map((r, i) => (
          <span key={i} data-slot="reward-track-meta" className="text-label-small text-on-surface-variant flex-1 text-center">
            {r.at}
          </span>
        ))}
      </div>
    </div>
  );
}

/* How many days are checked in is the other side's (`signed`), and so is which day is today (`today`, counted from 1;
 * 0: the day after the last one checked in): a press on today asks (the `today` slot). A prototype's demo checks today
 * in itself, starting over from what it is given. */
export function CheckIn({ title = "", days = 30, signed = 3, today = 0, width = 300, demo, onValueChange, onEvent, wired, className, style }: { title?: string; days?: number; signed?: number; today?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [more, setMore] = useSeeded({ from: [signed, today], by: 0 });
  const count = signed + (host.demo ? more.by : 0);
  const now = today > 0 ? today - 1 : count;
  return (
    <div data-slot="check-in" data-signed={count} data-today={now + 1} className={cn("bg-surface-container-low flex flex-col gap-2 rounded-2xl p-3", className)} style={{ width, ...style }}>
      {title && <div data-slot="check-in-title" className="text-title-small text-on-surface">{title}</div>}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: days }, (_, i) => {
          const here = i === now && i >= count;
          return (
            <Tap key={i} disabled={!here} data-tap={here ? "today" : undefined} aria-current={i === now ? "date" : undefined} data-slot="check-in-cell" aria-label={`${i + 1}`} data-state={i < count ? "done" : here ? "today" : undefined} className={`text-label-small flex aspect-square items-center justify-center rounded-full ${i < count ? "bg-primary text-on-primary" : here ? "border-primary text-primary border-2" : "text-on-surface-variant"}`} onClick={() => host.demo && setMore((m) => ({ ...m, by: m.by + 1 }))}>
              {i < count ? <WidgetIcon name="check" className="size-3" /> : i + 1}
            </Tap>
          );
        })}
      </div>
    </div>
  );
}

const UNIT_SECONDS: Record<string, number> = { second: 1, minute: 60, hour: 3600 };

const pad = (n: number) => String(n).padStart(2, "0");
const clockOf = (left: number) => (left >= 3600 ? `${pad(Math.floor(left / 3600))}:${pad(Math.floor(left / 60) % 60)}:${pad(left % 60)}` : `${pad(Math.floor(left / 60))}:${pad(left % 60)}`);

/* What is left is read off the clock the other side keeps: `endsAt` (ms on that clock, which runs `clockSkew` ahead of
 * the device's). With no end given, `timer` and `unit` are only words drawn on it: nothing counts down by itself, so
 * coming back to the screen never starts it over. */
export function FunctionButton({ icon = "", label = "", timer = 0, unit = "minute", endsAt = 0, clockSkew = 0, size = 50, className, style }: { icon?: string; label?: string; timer?: number; unit?: string; endsAt?: number; clockSkew?: number; size?: number } & Look) {
  const ref = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const live = endsAt > 0;
  const left = live ? secondsLeft(endsAt, clockSkew) : timer * (UNIT_SECONDS[unit] ?? 60);
  useEffect(() => {
    /* on the canvas a part is a drawing: it only counts down in use */
    if (!live || ref.current?.closest("[inert]")) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [live, endsAt]);
  return (
    <div ref={ref} data-slot="function-button" data-left={left} className={cn("inline-flex flex-col items-center gap-0.5", className)} style={{ width: size + 24, ...style }}>
      <Tap aria-label={label} data-slot="function-button-glyph" className="bg-secondary-container text-on-secondary-container flex items-center justify-center rounded-full" style={{ width: size, height: size }}>
        {icon && <WidgetIcon name={icon} className="size-6" />}
      </Tap>
      <span data-slot="function-button-label" className="text-label-small text-on-surface w-full truncate text-center">{label}</span>
      {(live || timer > 0) && <span data-slot="function-button-value" className="text-label-small text-on-surface-variant">{clockOf(left)}</span>}
    </div>
  );
}
