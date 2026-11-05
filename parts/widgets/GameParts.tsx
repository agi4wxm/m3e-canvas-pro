import { useEffect, useRef, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";

/* What a game's screens are made of beyond its shop and rewards: a skill with a cooldown, the map of its
 * levels, a story told line by line, and a board to play on. The rules of a particular game are not here:
 * the board knows only taking turns and N in a row. */

const isInert = (el: Element | null) => !el || !!el.closest("[inert]");
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function SkillButton({ icon = "bolt", label = "", cooldown = 5, size = 72, className, style }: { icon?: string; label?: string; cooldown?: number; size?: number } & Look) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => Math.max(0, s - 0.1)), 100);
    return () => clearTimeout(id);
  }, [left]);
  const cooling = left > 0;
  return (
    <div data-slot="skill-button" data-cooling={cooling || undefined} className={cn("inline-flex flex-col items-center gap-1", className)} style={{ width: size, ...style }}>
      <Tap data-slot="skill-button-face" aria-label={label || icon} disabled={cooling} className="flex items-center justify-center rounded-full bg-primary text-on-primary" style={{ width: size, height: size }} onClick={() => setLeft(cooldown)}>
        <WidgetIcon name={icon} className="size-1/2" />
        {cooling && (
          <span data-slot="skill-button-cooldown" data-cooldown className="absolute inset-0 flex items-center justify-center rounded-full text-title-medium text-inverse-on-surface tabular-nums" style={{ background: `conic-gradient(color-mix(in srgb, var(--md-sys-color-scrim) 65%, transparent) ${(left / Math.max(0.1, cooldown)) * 360}deg, transparent 0deg)` }}>
            {Math.ceil(left)}
          </span>
        )}
      </Tap>
      {label && <span data-slot="skill-button-label" className="w-full truncate text-center text-label-small text-on-surface">{label}</span>}
    </div>
  );
}

const ROW_H = 92;

export function LevelMap({ levels = 12, current = 4, stars = "", perRow = 4, width = 380, className, style }: { levels?: number; current?: number; stars?: string; perRow?: number; width?: number } & Look) {
  const [on, setOn] = useState(-1);
  const earned = stars.split(/[\s,，]+/).map((s) => Math.min(3, Math.max(0, Number(s) || 0)));
  const columns = Math.max(2, perRow);
  /* the path turns back at the end of each row, the way a game's map does */
  const at = (i: number) => {
    const row = Math.floor(i / columns);
    const col = row % 2 ? columns - 1 - (i % columns) : i % columns;
    return { x: ((col + 0.5) / columns) * 100, y: row * ROW_H + ROW_H / 2 };
  };
  const rows = Math.ceil(levels / columns);
  const height = rows * ROW_H;
  return (
    <div data-slot="level-map" data-selected={on} className={cn("relative overflow-hidden rounded-xl bg-surface-container-low", className)} style={{ width, height, ...style }}>
      <svg aria-hidden data-slot="level-map-path" className="absolute inset-0 size-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        {Array.from({ length: Math.max(0, levels - 1) }, (_, i) => {
          const a = at(i);
          const b = at(i + 1);
          return <line key={i} data-slot="level-map-line" data-done={i + 1 < current || undefined} x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" strokeWidth={4} stroke={i + 1 < current ? "var(--md-sys-color-primary)" : "var(--md-sys-color-outline-variant)"} />;
        })}
      </svg>
      {Array.from({ length: levels }, (_, i) => {
        const n = i + 1;
        const p = at(i);
        const locked = n > current;
        const here = n === current;
        return (
          <div key={i} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${p.x}%`, top: p.y }}>
            <Tap data-slot="level-map-node" data-state={locked ? "locked" : here ? "current" : "done"} aria-label={`${n}`} aria-pressed={i === on} disabled={locked} data-tap={locked ? undefined : `tab:${i}`} className={cn("flex size-12 items-center justify-center rounded-full text-title-medium", locked ? "bg-surface-container-high text-on-surface-variant" : here ? "bg-primary text-on-primary ring-4 ring-primary/30" : "bg-primary-container text-on-primary-container", i === on && "outline-2 outline-offset-2 outline-primary")} onClick={() => setOn(i)}>
              {locked ? <WidgetIcon name="lock" className="size-5" /> : n}
            </Tap>
            {!locked && !here && (
              <div data-slot="level-map-stars" data-stars className="flex text-tertiary">
                {[0, 1, 2].map((s) => <WidgetIcon key={s} name="star" className={cn("size-3", s >= (earned[i] ?? 0) && "opacity-30")} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DialogueBox({ speaker = "", icon = "person", image = "", lines = [], choices = [], next = "", width = 380, className, style }: { speaker?: string; icon?: string; image?: string; lines?: string[]; choices?: string[]; next?: string; width?: number } & Look) {
  const [line, setLine] = useState(0);
  const [typed, setTyped] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const words = lines[Math.min(line, lines.length - 1)] ?? "";
  const shown = typed < 0 || typed >= words.length;
  useEffect(() => {
    if (isInert(root.current) || calm()) {
      setTyped(-1);
      return;
    }
    setTyped(0);
  }, [line]);
  useEffect(() => {
    if (typed < 0 || typed >= words.length) return;
    const id = setTimeout(() => setTyped((n) => n + 1), 30);
    return () => clearTimeout(id);
  }, [typed, words.length]);
  const last = line >= lines.length - 1;
  const press = () => {
    if (!shown) setTyped(-1);
    else if (!last) setLine(line + 1);
  };
  return (
    <div ref={root} data-slot="dialogue-box" data-line={line} className={cn("flex flex-col gap-2 rounded-2xl border border-outline-variant bg-surface-container-high p-3", className)} style={{ width, ...style }}>
      <div data-slot="dialogue-speaker" className="flex items-center gap-2">
        <span data-slot="dialogue-portrait" className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-container text-on-primary-container">
          {/^(https?:|data:image\/)/i.test(image) ? <img src={image} alt="" className="size-full object-cover" /> : <WidgetIcon name={icon} className="size-6" />}
        </span>
        <span data-slot="dialogue-name" className="min-w-0 flex-1 truncate text-title-small text-primary">{speaker}</span>
      </div>
      <Tap data-slot="dialogue-words" data-dialogue-next className="min-h-16 rounded-md p-1 text-left text-body-large text-on-surface" onClick={press}>
        {shown ? words : words.slice(0, Math.max(0, typed))}
      </Tap>
      {shown && last && choices.length > 0 ? (
        <div data-slot="dialogue-choices" className="flex flex-col gap-1">
          {choices.map((choice, i) => <Button key={i} variant="tonal" data-tap={`tab:${i}`}>{choice}</Button>)}
        </div>
      ) : (
        shown && !last && next && <div data-slot="dialogue-next" className="flex items-center justify-end gap-1 text-label-small text-on-surface-variant">{next}<WidgetIcon name="keyboard_arrow_down" className="size-4" /></div>
      )}
    </div>
  );
}

type Mark = string;

/** the first line of `need` same marks on a board */
export function winnerOf(cells: Mark[], rows: number, columns: number, need: number): Mark | null {
  const at = (r: number, c: number) => (r >= 0 && c >= 0 && r < rows && c < columns ? cells[r * columns + c] : "");
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const mark = at(r, c);
      if (!mark) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        let run = 1;
        while (run < need && at(r + dr * run, c + dc * run) === mark) run++;
        if (run >= need) return mark;
      }
    }
  }
  return null;
}

export function GameBoard({ rows = 3, columns = 3, mode = "mark", cells = "", marks = "X,O", need = 3, turnText = "", winText = "", drawText = "", reset = "", width = 320, className, style }: { rows?: number; columns?: number; mode?: string; cells?: string; marks?: string; need?: number; turnText?: string; winText?: string; drawText?: string; reset?: string; width?: number } & Look) {
  const size = rows * columns;
  const opening = () => {
    const given = cells.split(",").map((s) => s.trim());
    return Array.from({ length: size }, (_, i) => given[i] ?? "");
  };
  const [board, setBoard] = useState<string[]>(opening);
  const [picked, setPicked] = useState<number[]>([]);
  const pair = marks.split(/[\s,，]+/).filter(Boolean);
  const players = pair.length ? pair : ["X", "O"];
  useEffect(() => {
    setBoard(opening());
    setPicked([]);
  }, [rows, columns, cells]); // eslint-disable-line react-hooks/exhaustive-deps
  const placing = mode === "mark";
  const placed = board.filter(Boolean).length;
  const winner = placing ? winnerOf(board, rows, columns, need) : null;
  const full = placed >= size;
  const turn = players[placed % players.length];
  const fill = (template: string, mark: string) => template.replace("{mark}", mark);
  const status = !placing ? "" : winner ? fill(winText, winner) : full ? drawText : fill(turnText, turn);
  const press = (i: number) => {
    if (!placing) {
      setPicked((now) => (now.includes(i) ? now.filter((x) => x !== i) : [...now, i]));
      return;
    }
    if (winner || board[i]) return;
    setBoard((now) => now.map((c, at) => (at === i ? turn : c)));
  };
  return (
    <div data-slot="game-board" data-board={board.join(",")} data-winner={winner ?? ""} data-picked={picked.join(",")} className={cn("flex flex-col gap-2 rounded-xl bg-surface-container-low p-3", className)} style={{ width, ...style }}>
      {status && <div data-slot="game-board-status" data-board-status className="text-center text-title-small text-on-surface">{status}</div>}
      <div data-slot="game-board-grid" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {board.map((value, i) => (
          <Tap key={i} data-slot="game-board-cell" data-mark={value || undefined} aria-label={`${i + 1}`} aria-pressed={picked.includes(i)} data-cell={i} className={cn("flex aspect-square min-w-0 items-center justify-center rounded-md text-title-large", picked.includes(i) ? "bg-primary text-on-primary" : value ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface")} onClick={() => press(i)}>
            {value}
          </Tap>
        ))}
      </div>
      {reset && <Button variant="text" onClick={() => { setBoard(opening()); setPicked([]); }}>{reset}</Button>}
    </div>
  );
}
