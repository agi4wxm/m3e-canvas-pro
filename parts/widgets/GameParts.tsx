import { useEffect, useRef, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { prefersReducedMotion } from "@/components/m3e/reduced-motion";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";
import { useHost, type HostProps } from "./host";
import { clockNow, stop } from "./seed";

/* What a game's screens are made of beyond its shop and rewards: a skill with a cooldown, the map of its levels, a
 * story told line by line, and a board to play on. The rules of a game are not here (docs/边界与契约.md): a cooldown
 * ends when the other side says (`endsAt`), the line and the board are what it gives, and a press only asks. Each
 * keeps a prototype's demo of the rule (a cooldown it starts itself, a board that takes turns and finds a line) for
 * a prototype nothing has taken over. */

const isInert = (el: Element | null) => !el || !!el.closest("[inert]");
const calm = prefersReducedMotion;

/** Re-draws every `ms` while `on`, for what is read off a clock; never on the canvas, where a part is a drawing. */
function useTicking(on: boolean, ms: number, root: { current: Element | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on || isInert(root.current)) return;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [on, ms, root]);
}

export function SkillButton({ icon = "bolt", label = "", cooldown = 5, endsAt = 0, clockSkew = 0, disabled = false, size = 72, demo, onValueChange, onEvent, wired, className, style }: { icon?: string; label?: string; cooldown?: number; endsAt?: number; clockSkew?: number; disabled?: boolean; size?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const root = useRef<HTMLDivElement>(null);
  /* a prototype's demo starts the cooldown itself; a product shows the one the other side gives */
  const [mine, setMine] = useState(0);
  const end = Math.max(endsAt, host.demo ? mine : 0);
  const left = end > 0 ? Math.max(0, (end - clockNow(clockSkew)) / 1000) : 0;
  const cooling = left > 0;
  useTicking(cooling, 100, root);
  const blocked = cooling || disabled;
  /* the cooldown's length is only how long the ring is */
  const ring = Math.min(1, left / Math.max(0.1, cooldown));
  return (
    <div ref={root} data-slot="skill-button" data-cooling={cooling || undefined} data-disabled={disabled || undefined} className={cn("inline-flex flex-col items-center gap-1", className)} style={{ width: size, ...style }}>
      <Tap data-slot="skill-button-face" data-tap="action" aria-label={label || icon} disabled={blocked} className="flex items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-100" style={{ width: size, height: size }} onClick={() => host.demo && setMine(clockNow(clockSkew) + cooldown * 1000)}>
        <WidgetIcon name={icon} className="size-1/2" />
        {cooling && (
          <span data-slot="skill-button-cooldown" data-cooldown className="absolute inset-0 flex items-center justify-center rounded-full text-title-medium text-inverse-on-surface tabular-nums" style={{ background: `conic-gradient(color-mix(in srgb, var(--md-sys-color-scrim) 65%, transparent) ${ring * 360}deg, transparent 0deg)` }}>
            {Math.ceil(left)}
          </span>
        )}
      </Tap>
      {/* the label is part of the skill: while it cools down a press on it is no press at all */}
      {label && (
        <span data-slot="skill-button-label" data-tap={blocked ? undefined : "action"} className="w-full truncate text-center text-label-small text-on-surface" onClick={blocked ? stop : undefined}>
          {label}
        </span>
      )}
    </div>
  );
}

const ROW_H = 92;

export function LevelMap({ levels = 12, current = 5, selected = -1, stars = "", perRow = 4, width = 380, className, style }: { levels?: number; current?: number; selected?: number; stars?: string; perRow?: number; width?: number } & Look) {
  /* which level is picked is the part's `selected`: whoever draws it moves it when a level is tapped (`selectKey`) */
  const on = selected;
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
      <svg aria-hidden data-slot="level-map-track" className="absolute inset-0 size-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
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
            <Tap data-slot="level-map-cell" data-current={here || undefined} data-locked={locked || undefined} aria-label={`${n}`} aria-pressed={i === on} disabled={locked} data-tap={locked ? undefined : `tab:${i}`} className={cn("flex size-12 items-center justify-center rounded-full text-title-medium", locked ? "bg-surface-container-high text-on-surface-variant" : here ? "bg-primary text-on-primary ring-4 ring-primary/30" : "bg-primary-container text-on-primary-container", i === on && "outline-2 outline-offset-2 outline-primary")}>
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

/* The line on show is the other side's (`line`): a press on the words asks for the next (the `next` slot), and once a
 * line has been told the box sends `settled` with it. Typing a line out is the box's own show: a press while it types
 * only finishes the line. A prototype's demo moves to the next line itself. */
export function DialogueBox({ speaker = "", icon = "person", image = "", lines = [], line: given = 0, choices = [], next = "", width = 380, demo, onValueChange, onEvent, wired, className, style }: { speaker?: string; icon?: string; image?: string; lines?: string[]; line?: number; choices?: string[]; next?: string; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [moved, setMoved] = useState<{ from: number; by: number }>({ from: given, by: 0 });
  /* the demo's steps count from the line it was given, and start over when it is given another */
  const by = moved.from === given ? moved.by : 0;
  const last = Math.max(0, lines.length - 1);
  const line = Math.min(last, Math.max(0, given + (host.demo ? by : 0)));
  const [typed, setTyped] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const words = lines[line] ?? "";
  const shown = typed < 0 || typed >= words.length;
  useEffect(() => {
    if (isInert(root.current) || calm()) {
      setTyped(-1);
      return;
    }
    setTyped(0);
  }, [line, words]);
  useEffect(() => {
    if (typed < 0 || typed >= words.length) return;
    const id = setTimeout(() => setTyped((n) => n + 1), 30);
    return () => clearTimeout(id);
  }, [typed, words.length]);
  /* a line told in full is said once, the moment it is */
  const told = useRef(-1);
  useEffect(() => {
    if (!shown || isInert(root.current) || told.current === line) return;
    told.current = line;
    host.emit("settled", { line, last: line >= last });
  }, [shown, line, last]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = line >= last;
  return (
    <div ref={root} data-slot="dialogue-box" data-line={line} className={cn("flex flex-col gap-2 rounded-2xl border border-outline-variant bg-surface-container-high p-3", className)} style={{ width, ...style }}>
      <div data-slot="dialogue-speaker" className="flex items-center gap-2">
        <span data-slot="dialogue-portrait" className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-container text-on-primary-container">
          {/^(https?:|data:image\/)/i.test(image) ? <img src={image} alt="" className="size-full object-cover" /> : <WidgetIcon name={icon} className="size-6" />}
        </span>
        <span data-slot="dialogue-name" className="min-w-0 flex-1 truncate text-title-small text-primary">{speaker}</span>
      </div>
      <Tap
        data-slot="dialogue-words"
        data-tap="next"
        data-dialogue-next
        className="min-h-16 rounded-md p-1 text-left text-body-large text-on-surface"
        onClick={(e) => {
          /* finishing the line being typed is the box's own: it asks for nothing */
          if (!shown) {
            stop(e);
            setTyped(-1);
          } else if (host.demo && !end) setMoved({ from: given, by: by + 1 });
        }}
      >
        {shown ? words : words.slice(0, Math.max(0, typed))}
      </Tap>
      {shown && end && choices.length > 0 ? (
        <div data-slot="dialogue-choices" className="flex flex-col gap-1">
          {choices.map((choice, i) => <Button key={i} variant="tonal" data-tap={`tab:${i}`}>{choice}</Button>)}
        </div>
      ) : (
        shown && !end && next && <div data-slot="dialogue-next" className="flex items-center justify-end gap-1 text-label-small text-on-surface-variant">{next}<WidgetIcon name="keyboard_arrow_down" className="size-4" /></div>
      )}
    </div>
  );
}

type Mark = string;

/** the first line of `need` same marks on a board: a prototype's demo of a game's rule, never a product's */
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

/** cells from words like "X,,O": as many as the board has */
const boardOf = (cells: string, size: number) => {
  const given = cells.split(",").map((s) => s.trim());
  return Array.from({ length: size }, (_, i) => given[i] ?? "");
};

/** picked cells from words like "1,5", counted from 1 */
const pickedOf = (picked: string, size: number) => [...new Set(picked.split(/[\s,，]+/).map((s) => Number(s) - 1).filter((n) => Number.isInteger(n) && n >= 0 && n < size))];

/* The board is the other side's (`cells`, `status`, `picked`): a press on a cell asks (the `cell:*` family, `slot.index`
 * is the cell) and the board shows what comes back. Only a prototype's demo plays by itself: it takes turns, finds N in
 * a row and keeps its own picks, starting over from what it is given. */
export function GameBoard({ rows = 3, columns = 3, mode = "mark", cells = "", status: told = "", picked: pickedGiven = "", marks = "X,O", need = 3, turnText = "", winText = "", drawText = "", reset = "", width = 320, demo, onValueChange, onEvent, wired, className, style }: { rows?: number; columns?: number; mode?: string; cells?: string; status?: string; picked?: string; marks?: string; need?: number; turnText?: string; winText?: string; drawText?: string; reset?: string; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const size = rows * columns;
  const given = boardOf(cells, size);
  const givenPicks = pickedOf(pickedGiven, size);
  const seed = JSON.stringify([rows, columns, cells, pickedGiven]);
  const [played, setPlayed] = useState<{ seed: string; board: string[]; picked: number[] } | null>(null);
  /* the demo's own game, from what it was last given */
  const mine = host.demo && played?.seed === seed ? played : null;
  const board = mine?.board ?? given;
  const picked = mine?.picked ?? givenPicks;
  const placing = mode === "mark";
  const pair = marks.split(/[\s,，]+/).filter(Boolean);
  const players = pair.length ? pair : ["X", "O"];
  const placed = board.filter(Boolean).length;
  /* who won is a rule: only the demo works it out, a product shows what it is told */
  const winner = host.demo && placing ? winnerOf(board, rows, columns, need) : null;
  const full = placed >= size;
  const turn = players[placed % players.length];
  const fill = (template: string, mark: string) => template.replace("{mark}", mark);
  /* told nothing, a product shows the design's own words for the opening: whose turn it is at the start */
  const status = !host.demo ? told || (placing ? fill(turnText, players[0]) : "") : !placing ? "" : winner ? fill(winText, winner) : full ? drawText : fill(turnText, turn);
  const play = (next: { board?: string[]; picked?: number[] }) => setPlayed({ seed, board: next.board ?? board, picked: next.picked ?? picked });
  const press = (i: number) => {
    if (!host.demo) return;
    if (!placing) return play({ picked: picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i] });
    if (winner || board[i]) return;
    play({ board: board.map((c, at) => (at === i ? turn : c)) });
  };
  return (
    <div data-slot="game-board" data-board={board.join(",")} data-winner={winner ?? ""} data-picked={picked.join(",")} className={cn("flex flex-col gap-2 rounded-xl bg-surface-container-low p-3", className)} style={{ width, ...style }}>
      {status && <div data-slot="game-board-title" data-board-status className="text-center text-title-small text-on-surface">{status}</div>}
      <div data-slot="game-board-grid" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {board.map((value, i) => (
          <Tap key={i} data-slot="game-board-cell" data-tap={`cell:${i}`} data-mark={value || undefined} aria-label={`${i + 1}`} aria-pressed={picked.includes(i)} data-cell={i} className={cn("flex aspect-square min-w-0 items-center justify-center rounded-md text-title-large", picked.includes(i) ? "bg-primary text-on-primary" : value ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface")} onClick={() => press(i)}>
            {value}
          </Tap>
        ))}
      </div>
      {reset && (
        <Button variant="text" data-tap="reset" onClick={() => host.demo && setPlayed(null)}>
          {reset}
        </Button>
      )}
    </div>
  );
}
