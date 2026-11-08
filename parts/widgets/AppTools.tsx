import { pageLocale } from "@/components/m3e/say";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { Checkbox } from "@/components/m3e/checkbox";
import { Input } from "@/components/m3e/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/m3e/table";
import { TextField } from "@/components/m3e/text-field";
import type { Look } from "./look";
import { amountOf, keysOf, stop, usePicked, useSeeded, useValue } from "./seed";
import { useHost, type HostProps } from "./host";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";

/* What people work with, not just look at: a table to sort, a board to move cards on, a form that
 * checks itself, a pad, a pen. New code written for this project; the QR encoder follows ISO/IEC 18004. */

const Soft = "opacity-70";

/** a square tick for a row that is itself a press target: a checkbox cannot sit inside one */
function Tick({ on }: { on: boolean }) {
  return <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-[2px] border-2", on ? "border-primary bg-primary text-on-primary" : "border-current")}>{on && <WidgetIcon name="check" className="size-3.5" />}</span>;
}

/* ---------- a table that answers ---------- */

const NUMERIC = /^[^\p{L}\d\s-]{0,2}\s?[-+]?[\d,]+(\.\d+)?\s?[^\p{L}\d\s]{0,2}$/u;

/* What the visitor asks of the table is a draft of its own that starts at the props and starts over when they change:
 * the search (`query`), the sort (`sortColumn`, `sortDir`), the page (`page`). Each change is sent (`search`, `sort`,
 * `page`), and so is what is checked (`select`, the rows by their place in the data). Given `total`, the rows are one
 * page the other side has already searched, sorted and cut, and the table only asks for others; without it, it is
 * the design's own rows and the table does that itself. A row is a place of its own (`row:*`, by its place in the
 * data, whatever the order shown); checked rows are kept by what they say, so they stay checked when rows move. */
export function DataTable({ title = "", columns = [], rows = [], search = "", selectable = true, pageSize = 5, query: queryGiven = "", sortColumn = -1, sortDir = "asc", page: pageGiven = 0, total = 0, width = 560, demo, onValueChange, onEvent, wired, className, style }: { title?: string; columns?: string[]; rows?: string[][]; search?: string; selectable?: boolean; pageSize?: number; query?: string; sortColumn?: number; sortDir?: string; page?: number; total?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [query, setQuery] = useSeeded(queryGiven);
  const [sort, setSort] = useSeeded<{ column: number; down: boolean } | null>(sortColumn >= 0 ? { column: sortColumn, down: sortDir === "desc" } : null);
  const [page, setPage] = useSeeded(Math.max(0, pageGiven));
  const remote = total > 0;
  const keys = keysOf(rows.map((r) => r.join("\u0001")));
  const [picked, setPicked] = usePicked(keys);
  const numeric = columns.map((_, c) => rows.length > 0 && rows.every((r) => NUMERIC.test((r[c] ?? "").trim())));
  const lines = useMemo(() => {
    const all = rows.map((cells, id) => ({ cells, id, key: keys[id] }));
    if (remote) return all;
    const needle = query.trim().toLowerCase();
    const found = all.filter((l) => !needle || l.cells.some((c) => c.toLowerCase().includes(needle)));
    if (!sort) return found;
    const { column, down } = sort;
    const order = numeric[column] ? (a: string, b: string) => amountOf(a) - amountOf(b) : (a: string, b: string) => a.localeCompare(b);
    return found.toSorted((a, b) => (down ? -1 : 1) * order(a.cells[column] ?? "", b.cells[column] ?? ""));
    /* `rows` is a new array whenever the part draws; its words are what matter */
  }, [JSON.stringify(rows), query, sort, remote]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = remote ? total : lines.length;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = remote ? lines.slice(0, pageSize) : lines.slice(current * pageSize, current * pageSize + pageSize);
  const allOn = shown.length > 0 && shown.every((l) => picked.includes(l.key));
  const turn = (to: number) => {
    setPage(to);
    host.emit("page", { page: to });
  };
  const pick = (next: string[]) => {
    setPicked(next);
    host.emit("select", { rows: rows.flatMap((_, i) => (next.includes(keys[i]) ? [i] : [])) });
  };
  const press = (column: number) => {
    /* ascending, descending, then back to the author's order */
    const next = sort?.column !== column ? { column, down: false } : sort.down ? null : { column, down: true };
    setSort(next);
    host.emit("sort", { column: next ? next.column : -1, dir: next?.down ? "desc" : next ? "asc" : "" });
    if (current !== 0) turn(0);
  };
  return (
    <div data-slot="data-table" data-rows={count} data-page={current} data-picked={rows.flatMap((_, i) => (picked.includes(keys[i]) ? [i] : [])).join(",")} data-sort={sort ? `${sort.column}:${sort.down ? "down" : "up"}` : undefined} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-2 overflow-hidden rounded-xl p-3", className)} style={{ width, ...style }} onClick={(e) => !(e.target as Element).closest?.("[data-tap]") && stop(e)}>
      {(title || search) && (
        <div data-slot="data-table-header" className="flex flex-wrap items-center gap-2">
          {title && <div data-slot="data-table-title" className="text-title-medium min-w-0 flex-1 truncate">{picked.length ? `${title} · ${picked.length}` : title}</div>}
          {search && (
            <div className="w-48 max-w-full">
              <Input
                size="sm"
                type="search"
                value={query}
                placeholder={search}
                aria-label={search}
                onChange={(e) => {
                  setQuery(e.target.value);
                  host.emit("search", { query: e.target.value });
                  if (current !== 0) turn(0);
                }}
              />
            </div>
          )}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-10">
                <Checkbox aria-label="All" checked={allOn} disabled={!shown.length} onCheckedChange={(on: boolean) => pick(on ? [...new Set([...picked, ...shown.map((l) => l.key)])] : picked.filter((k) => !shown.some((l) => l.key === k)))} />
              </TableHead>
            )}
            {columns.map((c, i) => (
              <TableHead key={i} aria-sort={sort?.column === i ? (sort.down ? "descending" : "ascending") : "none"} className={numeric[i] ? "text-right" : undefined}>
                <Tap className={cn("inline-flex items-center gap-1 rounded-sm", numeric[i] && "flex-row-reverse")} onClick={() => press(i)}>
                  {c}
                  <WidgetIcon name={sort?.column === i && sort.down ? "arrow_downward" : "arrow_upward"} className={cn("size-4", sort?.column !== i && "opacity-0")} />
                </Tap>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((l) => (
            <TableRow key={l.key} data-tap={`row:${l.id}`} data-state={picked.includes(l.key) ? "selected" : undefined} onClick={host.own(`row:${l.id}`)}>
              {selectable && (
                <TableCell onClick={stop}>
                  <Checkbox aria-label={l.cells[0]} checked={picked.includes(l.key)} onCheckedChange={(on: boolean) => pick(on ? [...picked, l.key] : picked.filter((k) => k !== l.key))} />
                </TableCell>
              )}
              {columns.map((_, i) => (
                <TableCell key={i} className={numeric[i] ? "text-right tabular-nums" : undefined}>
                  {l.cells[i] ?? ""}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div data-slot="data-table-footer" className="text-label-medium flex items-center justify-end gap-1">
        <span className={`mr-2 tabular-nums ${Soft}`}>
          {count ? current * pageSize + 1 : 0}–{Math.min(count, (current + 1) * pageSize)} / {count}
        </span>
        <Button variant="text" size="icon-sm" aria-label="Previous" disabled={current === 0} onClick={() => turn(current - 1)}>
          <WidgetIcon name="chevron_left" />
        </Button>
        <Button variant="text" size="icon-sm" aria-label="Next" disabled={current >= pages - 1} onClick={() => turn(current + 1)}>
          <WidgetIcon name="chevron_right" />
        </Button>
      </div>
    </div>
  );
}

/* ---------- a board ---------- */

type Lane = { title: string; cards: { id: string; row: number; text: string }[] };

/* Which card is in which lane is the data's: a card moved (by dragging, or with the arrows under a picked card), a card
 * added and a card opened are sent (`move`, `add`, `open`) with the card by its place in the data. Only a prototype's
 * demo moves and adds cards itself. Cards keep who they are by their lane and words, so the one picked stays picked
 * when the data moves. */
export function Kanban({ columns = [], rows = [], add = "", width = 720, demo, onValueChange, onEvent, wired, className, style }: { columns?: string[]; rows?: string[][]; add?: string; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  /* each column of the author's table is a lane, and its filled cells are the cards */
  const given: Lane[] = columns.map((title, c) => {
    const cells = rows.flatMap((r, i) => (r[c] ? [{ row: i, text: r[c] }] : []));
    const keys = keysOf(cells.map((x) => `${c}\u0001${x.text}`));
    return { title, cards: cells.map((x, k) => ({ id: keys[k], row: x.row, text: x.text })) };
  });
  const [mine, setMine] = useSeeded(given);
  const lanes = host.demo ? mine : given;
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(-1);
  const [draft, setDraft] = useState("");
  const dragged = useRef<string | null>(null);
  const nextId = useRef(0);
  const laneOf = (id: string) => lanes.findIndex((l) => l.cards.some((x) => x.id === id));
  /** puts a card in a lane, before another card or at the end: the demo does it, everything sends it */
  const move = (id: string, to: number, before?: string) => {
    const from = laneOf(id);
    const card = lanes[from]?.cards.find((x) => x.id === id);
    if (!card || id === before) return;
    host.emit("move", { row: card.row, from, to, before: lanes[to]?.cards.find((x) => x.id === before)?.row ?? -1 });
    if (!host.demo) return;
    setMine((all) =>
      all.map((l, i) => {
        const cards = l.cards.filter((x) => x.id !== id);
        if (i !== to) return { ...l, cards };
        const at = before === undefined ? cards.length : cards.findIndex((x) => x.id === before);
        return { ...l, cards: [...cards.slice(0, at < 0 ? cards.length : at), card, ...cards.slice(at < 0 ? cards.length : at)] };
      }),
    );
  };
  const commit = (lane: number) => {
    const text = draft.trim();
    if (text) {
      host.emit("add", { lane, text });
      if (host.demo) setMine((all) => all.map((l, i) => (i === lane ? { ...l, cards: [...l.cards, { id: `new\u0001${nextId.current++}`, row: -1, text }] } : l)));
    }
    setDraft("");
    setAdding(-1);
  };
  const shown = lanes.some((l) => l.cards.some((x) => x.id === picked)) ? picked : null;
  return (
    <div data-slot="kanban" data-counts={lanes.map((l) => l.cards.length).join(",")} className={cn("bg-surface-container-lowest text-on-surface flex items-start gap-2 overflow-x-auto rounded-xl p-2", className)} style={{ width, ...style }} onClick={stop}>
      {lanes.map((lane, l) => (
        <div
          key={l}
          data-lane={l}
          data-slot="kanban-lane"
          className="bg-surface-container flex min-w-44 flex-1 flex-col gap-2 rounded-lg p-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragged.current !== null) move(dragged.current, l);
            dragged.current = null;
          }}
        >
          <div data-slot="kanban-header" className="flex items-center justify-between gap-2 px-1">
            <span data-slot="kanban-title" className="text-title-small truncate">{lane.title}</span>
            <span data-slot="kanban-meta" className={`text-label-medium tabular-nums ${Soft}`}>{lane.cards.length}</span>
          </div>
          {lane.cards.map((card) => (
            <div
              key={card.id}
              data-card={card.row}
              data-slot="kanban-card"
              data-active={shown === card.id ? "" : undefined}
              draggable
              className={cn("flex cursor-grab flex-col rounded-md", shown === card.id ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-lowest")}
              onDragStart={(e) => {
                dragged.current = card.id;
                e.dataTransfer.setData("text/plain", card.text);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragged.current !== null) move(dragged.current, l, card.id);
                dragged.current = null;
              }}
            >
              <Tap
                aria-pressed={shown === card.id}
                className="text-body-medium rounded-md p-2 text-left"
                onClick={() => {
                  if (shown !== card.id) host.emit("open", { row: card.row, lane: l });
                  setPicked(shown === card.id ? null : card.id);
                }}
              >
                {card.text}
              </Tap>
              {/* moving without dragging: what a touch screen and a keyboard have */}
              {shown === card.id && (
                <div className="flex justify-between px-1 pb-1">
                  <Button variant="text" size="icon-xs" className="text-inherit" aria-label="Move left" disabled={l === 0} onClick={() => move(card.id, l - 1)}>
                    <WidgetIcon name="arrow_back" />
                  </Button>
                  <Button variant="text" size="icon-xs" className="text-inherit" aria-label="Move right" disabled={l === lanes.length - 1} onClick={() => move(card.id, l + 1)}>
                    <WidgetIcon name="arrow_forward" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {add &&
            (adding === l ? (
              <Input
                size="sm"
                autoFocus
                value={draft}
                aria-label={add}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commit(l)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit(l);
                  if (e.key === "Escape") {
                    setDraft("");
                    setAdding(-1);
                  }
                }}
              />
            ) : (
              <Button variant="text" size="xs" className="self-start" onClick={() => setAdding(l)}>
                <WidgetIcon name="add" />
                {add}
              </Button>
            ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- a month with things in it ---------- */

const pad = (n: number) => String(n).padStart(2, "0");
const weekdayName = (d: Date) => new Intl.DateTimeFormat(pageLocale(), { weekday: "narrow" }).format(d);
const monthName = (d: Date) => new Intl.DateTimeFormat(pageLocale(), { year: "numeric", month: "long" }).format(d);

/* The month on show and the day picked are the visitor's browsing, a draft that starts at `year`, `month` and `day`
 * and starts over when they change; each turn of the month and each day picked is sent (`month`, `day`), so a data
 * source can follow it. */
export function Agenda({ year = 2026, month = 1, day = 1, rows = [], weekStart = "sunday", empty = "", width = 360, demo, onValueChange, onEvent, wired, className, style }: { year?: number; month?: number; day?: number; rows?: string[][]; weekStart?: string; empty?: string; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [view, setView] = useSeeded({ year, month });
  const [on, setOn] = useSeeded(day);
  const first = new Date(view.year, view.month - 1, 1);
  const days = new Date(view.year, view.month, 0).getDate();
  const shift = weekStart === "monday" ? 1 : 0;
  const lead = (first.getDay() - shift + 7) % 7;
  const prefix = `${view.year}-${pad(view.month)}-`;
  const dayOf = (cell: string) => (cell.startsWith(prefix) ? Number(cell.slice(prefix.length)) : 0);
  const busy = new Set(rows.map((r) => dayOf(r[0] ?? "")));
  const today = Math.min(on, days);
  const events = rows.map((r, i) => ({ r, i })).filter(({ r }) => dayOf(r[0] ?? "") === today);
  const turn = (by: number) => {
    const next = new Date(view.year, view.month - 1 + by, 1);
    const to = { year: next.getFullYear(), month: next.getMonth() + 1 };
    setView(to);
    host.emit("month", to);
  };
  const pick = (d: number) => {
    setOn(d);
    host.emit("day", { year: view.year, month: view.month, day: d, date: `${prefix}${pad(d)}` });
  };
  /* 2023-01-01 was a Sunday: any week would do */
  const names = Array.from({ length: 7 }, (_, i) => weekdayName(new Date(2023, 0, 1 + i + shift)));
  return (
    <div data-slot="agenda" data-month={`${view.year}-${pad(view.month)}`} data-day={today} data-events={events.length} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-2 rounded-xl p-3", className)} style={{ width, ...style }}>
      <div data-slot="agenda-header" className="flex items-center gap-1" onClick={stop}>
        <span data-slot="agenda-title" className="text-title-medium flex-1 pl-1">{monthName(first)}</span>
        <Button variant="text" size="icon-sm" aria-label="Previous month" onClick={() => turn(-1)}>
          <WidgetIcon name="chevron_left" />
        </Button>
        <Button variant="text" size="icon-sm" aria-label="Next month" onClick={() => turn(1)}>
          <WidgetIcon name="chevron_right" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center" onClick={stop}>
        {names.map((n, i) => (
          <span key={i} className={`text-label-small py-1 ${Soft}`}>
            {n}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          return (
            <Tap key={d} data-slot="agenda-day" aria-pressed={d === today} aria-label={`${prefix}${pad(d)}`} className={cn("text-body-medium flex aspect-square flex-col items-center justify-center rounded-full", d === today && "bg-primary text-on-primary")} onClick={() => pick(d)}>
              {d}
              <span className={cn("size-1 rounded-full", busy.has(d) ? (d === today ? "bg-on-primary" : "bg-primary") : "bg-transparent")} />
            </Tap>
          );
        })}
      </div>
      <div className="flex flex-col gap-1">
        {events.length === 0 && <div className={`text-body-small py-2 text-center ${Soft}`}>{empty}</div>}
        {events.map(({ r, i }) => (
          <Tap key={i} data-tap={`tab:${i}`} data-slot="agenda-event" className="bg-surface-container flex w-full items-center gap-3 rounded-md p-2 text-left">
            <span className="text-label-medium shrink-0 tabular-nums">{r[1] ?? ""}</span>
            <span className="text-body-medium min-w-0 flex-1 truncate">{r[2] ?? ""}</span>
          </Tap>
        ))}
      </div>
    </div>
  );
}

/* ---------- lists to work through ---------- */

export function TodoList({ title = "", items = [], placeholder = "", width = 360, className, style }: { title?: string; items?: { label: string; done?: boolean }[]; placeholder?: string; width?: number } & Look) {
  const [tasks, setTasks] = useSeeded(items.map((it, id) => ({ id, label: it.label, done: !!it.done })));
  const [draft, setDraft] = useState("");
  const finished = tasks.filter((t) => t.done).length;
  const add = () => {
    const label = draft.trim();
    if (label) setTasks((all) => [...all, { id: all.length ? Math.max(...all.map((t) => t.id)) + 1 : 0, label, done: false }]);
    setDraft("");
  };
  const flip = (id: number) => setTasks((all) => all.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  return (
    <div data-slot="todo-list" data-done={finished} data-count={tasks.length} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-1 rounded-xl p-3", className)} style={{ width, ...style }} onClick={stop}>
      {title && (
        <div className="flex items-baseline justify-between gap-2 px-1">
          <span className="text-title-medium truncate">{title}</span>
          <span className={`text-label-medium shrink-0 tabular-nums ${Soft}`}>
            {finished} / {tasks.length}
          </span>
        </div>
      )}
      {tasks.map((t) => (
        <div key={t.id} data-task={t.id} className="flex items-center gap-3 pl-3">
          <Checkbox aria-label={t.label} checked={t.done} onCheckedChange={() => flip(t.id)} />
          <Tap className={cn("text-body-medium min-w-0 flex-1 rounded-sm py-2 pl-1 text-left break-words", t.done && "line-through opacity-60")} onClick={() => flip(t.id)}>
            {t.label}
          </Tap>
          <Button variant="text" size="icon-xs" aria-label="Remove" onClick={() => setTasks((all) => all.filter((x) => x.id !== t.id))}>
            <WidgetIcon name="close" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-1 pt-1">
        <Input
          size="sm"
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            add();
          }}
        />
        <Button variant="tonal" size="icon-sm" aria-label="Add" disabled={!draft.trim()} onClick={add}>
          <WidgetIcon name="add" />
        </Button>
      </div>
    </div>
  );
}

/** rows counted from 1 in words like "3,4" (or places from 0, as code may give them), as places from 0 */
const placesIn = (chosen: string | number[], count: number) => (Array.isArray(chosen) ? chosen : String(chosen).split(/[\s,，]+/).map((x) => Number(x) - 1)).filter((n, i, all) => Number.isInteger(n) && n >= 0 && n < count && all.indexOf(n) === i);

/* What is on the right is the value (`chosen`, the rows counted from 1), handed out on every move. Which rows are ticked
 * for moving is a draft of the list's own, kept by what the rows say, so a tick stays with its row when the rows move. */
export function TransferList({ items = [], chosen = "", from = "", to = "", width = 460, height = 220, demo, onValueChange, onEvent, wired, className, style }: { items?: string[]; chosen?: string | number[]; from?: string; to?: string; width?: number; height?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [value, setValue] = useValue(Array.isArray(chosen) ? chosen.map((n) => n + 1).join(",") : String(chosen), host);
  const right = placesIn(value, items.length);
  const keys = keysOf(items);
  const [marked, setMarked] = usePicked(keys);
  const isMarked = (i: number) => marked.includes(keys[i]);
  const left = items.map((_, i) => i).filter((i) => !right.includes(i));
  const send = (group: number[], toRight: boolean) => {
    const moving = group.filter(isMarked);
    const next = toRight ? [...right, ...moving] : right.filter((i) => !moving.includes(i));
    setValue(next.map((n) => n + 1).join(","));
    setMarked((all) => all.filter((k) => !moving.some((i) => keys[i] === k)));
  };
  const pane = (title: string, group: number[]) => (
    <div className="bg-surface-container flex min-w-0 flex-1 flex-col rounded-lg">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-title-small truncate">{title}</span>
        <span className={`text-label-small shrink-0 tabular-nums ${Soft}`}>
          {group.filter(isMarked).length} / {group.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1">
        {group.map((i) => {
          const on = isMarked(i);
          return (
            <Tap key={keys[i]} role="checkbox" aria-checked={on} data-row={i} className="text-body-medium flex w-full items-center gap-2 rounded-md p-2 text-left" onClick={() => setMarked((all) => (on ? all.filter((x) => x !== keys[i]) : [...all, keys[i]]))}>
              <Tick on={on} />
              <span className="min-w-0 flex-1 truncate">{items[i]}</span>
            </Tap>
          );
        })}
      </div>
    </div>
  );
  return (
    <div data-slot="transfer-list" data-right={right.join(",")} className={cn("bg-surface-container-low text-on-surface flex items-stretch gap-2 rounded-xl p-2", className)} style={{ width, height, ...style }} onClick={stop}>
      {pane(from, left)}
      <div className="flex shrink-0 flex-col justify-center gap-2">
        <Button variant="tonal" size="icon-sm" aria-label="Move right" disabled={!left.some(isMarked)} onClick={() => send(left, true)}>
          <WidgetIcon name="chevron_right" />
        </Button>
        <Button variant="tonal" size="icon-sm" aria-label="Move left" disabled={!right.some(isMarked)} onClick={() => send(right, false)}>
          <WidgetIcon name="chevron_left" />
        </Button>
      </div>
      {pane(to, right)}
    </div>
  );
}

/* ---------- forms ---------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthForm({ mode = "sign-in", title = "", subtitle = "", upTitle = "", nameLabel = "", emailLabel = "", passwordLabel = "", confirmLabel = "", remember = "", forgot = "", action = "", upAction = "", toUp = "", toIn = "", others = [], minLength = 8, badEmail = "", badPassword = "", badConfirm = "", success = "", width = 380, className, style }: { mode?: string; title?: string; subtitle?: string; upTitle?: string; nameLabel?: string; emailLabel?: string; passwordLabel?: string; confirmLabel?: string; remember?: string; forgot?: string; action?: string; upAction?: string; toUp?: string; toIn?: string; others?: string[]; minLength?: number; badEmail?: string; badPassword?: string; badConfirm?: string; success?: string; width?: number } & Look) {
  const [current, setCurrent] = useSeeded(mode);
  const up = current === "sign-up";
  const [values, setValues] = useState({ name: "", email: "", password: "", confirm: "" });
  const [tried, setTried] = useState(false);
  const [shown, setShown] = useState(false);
  const [kept, setKept] = useState(false);
  const [done, setDone] = useState(false);
  const wrong = { email: !EMAIL.test(values.email.trim()), password: values.password.length < minLength, confirm: up && values.confirm !== values.password };
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setDone(false);
  };
  const submit = (e: MouseEvent) => {
    /* a form that does not pass stays on its screen: the press never reaches the part's action */
    if (wrong.email || wrong.password || wrong.confirm) {
      e.stopPropagation();
      setTried(true);
      return;
    }
    setDone(true);
  };
  return (
    <div
      data-slot="auth-form"
      data-mode={current}
      data-done={done || undefined}
      data-invalid={(tried && (wrong.email || wrong.password || wrong.confirm)) || undefined}
      className={cn("bg-surface-container-low text-on-surface flex flex-col gap-3 rounded-xl p-5", className)}
      style={{ width, ...style }}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" && (e.target as Element).tagName === "INPUT") e.currentTarget.querySelector<HTMLElement>('[data-tap="submit"]')?.click();
      }}
    >
      <div>
        <div className="text-headline-small">{up ? upTitle : title}</div>
        {subtitle && !up && <div className={`text-body-medium ${Soft}`}>{subtitle}</div>}
      </div>
      {up && <TextField label={nameLabel} value={values.name} autoComplete="name" onChange={set("name")} />}
      <TextField label={emailLabel} type="email" value={values.email} autoComplete="email" error={tried && wrong.email} errorText={badEmail} onChange={set("email")} />
      <TextField
        label={passwordLabel}
        type={shown ? "text" : "password"}
        value={values.password}
        autoComplete={up ? "new-password" : "current-password"}
        error={tried && wrong.password}
        errorText={badPassword}
        onChange={set("password")}
        trailingIcon={
          <Button
            variant="text"
            size="icon-sm"
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            onClick={(e) => {
              stop(e);
              setShown((s) => !s);
            }}
          >
            <WidgetIcon name={shown ? "visibility_off" : "visibility"} />
          </Button>
        }
      />
      {up && <TextField label={confirmLabel} type={shown ? "text" : "password"} value={values.confirm} autoComplete="new-password" error={tried && wrong.confirm} errorText={badConfirm} onChange={set("confirm")} />}
      {!up && (remember || forgot) && (
        <div className="flex items-center justify-between gap-2">
          {remember ? (
            <span className="text-body-medium flex items-center gap-3 pl-1" onClick={stop}>
              <Checkbox aria-label={remember} checked={kept} onCheckedChange={(on: boolean) => setKept(on)} />
              {remember}
            </span>
          ) : (
            <span />
          )}
          {forgot && (
            <Button variant="text" size="xs" data-tap="forgot" className="shrink-0">
              {forgot}
            </Button>
          )}
        </div>
      )}
      {done && success && (
        <div role="status" className="bg-primary-container text-on-primary-container text-body-medium flex items-center gap-2 rounded-md p-2">
          <WidgetIcon name="check_circle" className="size-5 shrink-0" />
          {success}
        </div>
      )}
      <Button variant="filled" data-tap="submit" className="w-full" onClick={submit}>
        {up ? upAction : action}
      </Button>
      {others.map((o, i) => (
        <Button key={i} variant="outlined" data-tap={`other:${i}`} className="w-full">
          {o}
        </Button>
      ))}
      {(up ? toIn : toUp) && (
        <Button
          variant="text"
          size="xs"
          data-tap="switch"
          className="self-center"
          onClick={() => {
            setCurrent(up ? "sign-in" : "sign-up");
            setTried(false);
            setDone(false);
          }}
        >
          {up ? toIn : toUp}
        </Button>
      )}
    </div>
  );
}

/* ---------- pads ---------- */

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/* The pad is an input with a draft: what is typed is `value` while someone takes it, else a draft that starts at
 * `value` and starts over whenever `value` changes; it is handed out on every key, and confirming sends `submit` with it. Whether it went through (`sent`) is the other side's to
 * say: only a prototype's demo says so by itself, and a product shows `sent` as it is given. */
export function NumberPad({ mode = "amount", prefix = "", length = 6, action = "", done = "", value = "", sent = false, width = 320, demo, onValueChange, onEvent, wired, className, style }: { mode?: string; prefix?: string; length?: number; action?: string; done?: string; value?: string; sent?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [entry, setEntry] = useValue(value, host);
  const [sentHere, setSentHere] = useState(false);
  const shownSent = sent || (host.demo && sentHere);
  const money = mode === "amount";
  const next = (v: string, key: string) => {
    if (key === "back") return v.slice(0, -1);
    if (key === ".") return !money || v.includes(".") ? v : `${v || "0"}.`;
    if (money) {
      if (/\.\d\d$/.test(v) || (v.replace(".", "").length >= 12 && !v.includes("."))) return v;
      return v === "0" ? key : v + key;
    }
    return v.length >= length ? v : v + key;
  };
  const press = (key: string) => {
    setSentHere(false);
    const typed = next(entry, key);
    if (typed === entry) return;
    setEntry(typed);
  };
  const confirm = () => {
    host.emit("submit", { value: entry });
    if (host.demo) setSentHere(true);
  };
  const ready = money ? Number(entry) > 0 : mode === "pin" ? entry.length === length : entry.length > 0;
  return (
    <div
      data-slot="number-pad"
      data-entry={entry}
      data-ready={ready || undefined}
      data-sent={shownSent || undefined}
      tabIndex={0}
      className={cn("bg-surface-container-low text-on-surface flex flex-col gap-3 rounded-xl p-3 outline-none", className)}
      style={{ width, ...style }}
      onKeyDown={(e) => {
        if (/^\d$/.test(e.key) || e.key === ".") press(e.key);
        else if (e.key === "Backspace") press("back");
        else return;
        e.preventDefault();
      }}
    >
      <div className="flex min-h-14 items-center justify-center gap-3" aria-live="polite">
        {mode === "pin" ? (
          Array.from({ length }, (_, i) => <span key={i} className={cn("size-3.5 rounded-full border-2 border-current", i < entry.length && "bg-primary border-primary")} />)
        ) : (
          <span className="text-headline-large truncate tabular-nums">
            {money ? prefix : ""}
            {entry || (money ? "0" : prefix)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2" onClick={stop}>
        {KEYS.map((k) => (
          <Tap key={k} data-key={k} className="bg-surface-container-high text-headline-small h-14 rounded-lg" onClick={() => press(k)}>
            {k}
          </Tap>
        ))}
        {money ? (
          <Tap data-key="." className="bg-surface-container-high text-headline-small h-14 rounded-lg" onClick={() => press(".")}>
            .
          </Tap>
        ) : (
          <span />
        )}
        <Tap data-key="0" className="bg-surface-container-high text-headline-small h-14 rounded-lg" onClick={() => press("0")}>
          0
        </Tap>
        <Tap data-key="back" aria-label="Backspace" className="bg-surface-container-high flex h-14 items-center justify-center rounded-lg" onClick={() => press("back")}>
          <WidgetIcon name="backspace" className="size-6" />
        </Tap>
      </div>
      {action && (
        <Button variant={shownSent ? "tonal" : "filled"} data-tap="confirm" className="w-full" disabled={!ready} onClick={confirm}>
          {shownSent && done ? done : action}
        </Button>
      )}
    </div>
  );
}

/* An input of a drawing: the strokes are `value`, as the path an SVG draws ("M10 20 L30 40 ..."), handed out when a
 * stroke ends. Whether the signature is accepted (`signed`) is the other side's: the button only asks (the `done`
 * slot), and only a prototype's demo locks the pad itself. Clearing is the visitor's (the `clear` slot is the same
 * button, for an action of its own). */
export function SignaturePad({ hint = "", clear = "", action = "", done = "", value = "", signed: given = false, height = 180, width = 360, demo, onValueChange, onEvent, wired, className, style }: { hint?: string; clear?: string; action?: string; done?: string; value?: string; signed?: boolean; height?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [path, setPath] = useValue(value, host);
  /* the stroke under the pen, until it is lifted */
  const [stroke, setStroke] = useState("");
  const [mine, setMine] = useSeeded({ from: given, signed: false });
  const signed = given || (host.demo && mine.signed);
  const drawing = useRef(false);
  const at = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
    const box = e.currentTarget.getBoundingClientRect();
    /* a preview scaled to fit draws under the pointer all the same */
    const scale = box.width / (e.currentTarget.clientWidth || box.width || 1);
    return `${((e.clientX - box.left) / scale).toFixed(1)} ${((e.clientY - box.top) / scale).toFixed(1)}`;
  };
  const lift = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (stroke) setPath(`${path} ${stroke}`.trim());
    setStroke("");
  };
  const all = `${path} ${stroke}`.trim();
  const strokes = all ? all.split(/(?=M)/).length : 0;
  return (
    <div data-slot="signature-pad" data-strokes={strokes} data-signed={signed || undefined} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-2 rounded-xl p-3", className)} style={{ width, ...style }}>
      <div className="border-outline-variant bg-surface-container-lowest relative overflow-hidden rounded-md border" style={{ height }} onClick={stop}>
        {!all && <div className={`text-body-medium pointer-events-none absolute inset-0 flex items-center justify-center ${Soft}`}>{hint}</div>}
        <span className="border-outline-variant pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed" />
        <svg
          className={cn("absolute inset-0 size-full touch-none", signed ? "cursor-default" : "cursor-crosshair")}
          role="img"
          aria-label={hint || "Signature"}
          onPointerDown={(e) => {
            if (signed) return;
            drawing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const point = at(e);
            setStroke(`M${point} L${point}`);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const point = at(e);
            setStroke((s) => `${s} L${point}`);
          }}
          onPointerUp={lift}
          onPointerCancel={lift}
        >
          {all && <path d={all} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-current" />}
        </svg>
      </div>
      <div className="flex justify-end gap-2">
        {clear && (
          <Button
            variant="text"
            size="xs"
            data-tap="clear"
            disabled={!all || signed}
            onClick={host.own("clear", () => {
              setPath("");
              setStroke("");
            })}
          >
            {clear}
          </Button>
        )}
        {action && (
          <Button variant={signed ? "tonal" : "filled"} size="xs" data-tap="done" disabled={!all} onClick={() => host.demo && setMine((m) => ({ ...m, signed: true }))}>
            {signed && done ? done : action}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- writing ---------- */

const MARKS = [
  { label: "Bold", icon: "format_bold", command: "bold" },
  { label: "Italic", icon: "format_italic", command: "italic" },
  { label: "Underline", icon: "format_underlined", command: "underline" },
  { label: "Strikethrough", icon: "strikethrough_s", command: "strikeThrough" },
  { label: "Bulleted list", icon: "format_list_bulleted", command: "insertUnorderedList" },
  { label: "Numbered list", icon: "format_list_numbered", command: "insertOrderedList" },
  { label: "Quote", icon: "format_quote", command: "formatBlock", value: "blockquote" },
  { label: "Clear formatting", icon: "format_clear", command: "removeFormat" },
] as const;

/* An input of words: `text` is the value, handed out as the visitor writes. What is written stays put while it comes
 * back as the prop: the editable area is filled from the prop only when the prop says something else, so the caret and
 * the browser's undo stay whole. */
export function RichTextEditor({ text = "", placeholder = "", counter = true, height = 200, width = 420, demo, onValueChange, onEvent, wired, className, style }: { text?: string; placeholder?: string; counter?: boolean; height?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [value, setValue] = useValue(text, host);
  const area = useRef<HTMLDivElement>(null);
  const [first] = useState(value);
  const [active, setActive] = useState<string[]>([]);
  const count = value.trim().length;
  const read = () => {
    if (!area.current?.contains(document.getSelection()?.anchorNode ?? null)) return;
    setActive(MARKS.filter((m) => ("value" in m ? document.queryCommandValue(m.command).toLowerCase() === m.value : m.command !== "removeFormat" && document.queryCommandState(m.command))).map((m) => m.command));
  };
  useEffect(() => {
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, []);
  /* words from outside (a reset, another value) replace what the area holds; words the visitor typed are there already */
  useLayoutEffect(() => {
    const el = area.current;
    if (el && (el.textContent ?? "") !== value) el.textContent = value;
  }, [value]);
  const took = () => setValue(area.current?.textContent ?? "");
  /* the browser's own editing commands: the only ones that keep the caret and the undo stack whole */
  const apply = (mark: (typeof MARKS)[number]) => {
    area.current?.focus();
    if ("value" in mark) document.execCommand(mark.command, false, active.includes(mark.command) ? "p" : mark.value);
    else document.execCommand(mark.command);
    read();
    took();
  };
  return (
    <div data-slot="rich-text-editor" data-active={active.join(",")} data-count={count} className={cn("bg-surface-container-low text-on-surface flex flex-col overflow-hidden rounded-xl", className)} style={{ width, ...style }} onClick={stop}>
      <div role="toolbar" className="bg-surface-container flex flex-wrap items-center gap-0.5 p-1">
        {MARKS.map((m) => (
          <Button key={m.command} variant={active.includes(m.command) ? "tonal" : "text"} size="icon-sm" aria-label={m.label} aria-pressed={active.includes(m.command)} className={active.includes(m.command) ? undefined : "text-inherit"} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(m)}>
            <WidgetIcon name={m.icon} />
          </Button>
        ))}
      </div>
      <div className="relative" style={{ height }}>
        {count === 0 && <div className={`text-body-medium pointer-events-none absolute inset-x-3 top-3 ${Soft}`}>{placeholder}</div>}
        <div
          ref={area}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          contentEditable
          suppressContentEditableWarning
          className="text-body-medium [&_blockquote]:border-outline-variant size-full overflow-y-auto p-3 break-words whitespace-pre-wrap outline-none [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
          onInput={took}
        >
          {first}
        </div>
      </div>
      {counter && <div className={`text-label-small px-3 pb-2 text-right tabular-nums ${Soft}`}>{count}</div>}
    </div>
  );
}

export function ChatComposer({ placeholder = "", attach = true, emoji = true, width = 412, className, style }: { placeholder?: string; attach?: boolean; emoji?: boolean; width?: number } & Look) {
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const send = () => {
    if (!draft.trim()) return;
    setSent((n) => n + 1);
    setDraft("");
  };
  return (
    <div ref={box} data-slot="chat-composer" data-sent={sent} className={cn("bg-surface-container text-on-surface flex items-center gap-1 p-2", className)} style={{ width, ...style }}>
      {attach && (
        <Button variant="text" size="icon-sm" aria-label="Attach" data-tap="attach" data-slot="chat-composer-attach" className="shrink-0 text-inherit">
          <WidgetIcon name="add_circle" />
        </Button>
      )}
      <div data-slot="chat-composer-field" className="min-w-0 flex-1" onClick={stop}>
        <Input
          size="sm"
          variant="filled"
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          className="rounded-full border-0"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            box.current?.querySelector<HTMLElement>('[data-tap="send"]')?.click();
          }}
        />
      </div>
      {emoji && (
        <Button variant="text" size="icon-sm" aria-label="Emoji" data-tap="emoji" data-slot="chat-composer-emoji" className="shrink-0 text-inherit">
          <WidgetIcon name="mood" />
        </Button>
      )}
      <Button variant="filled" size="icon-sm" aria-label="Send" data-tap="send" data-slot="chat-composer-send" className="shrink-0" disabled={!draft.trim()} onClick={send}>
        <WidgetIcon name="send" />
      </Button>
    </div>
  );
}

/* ---------- the first run ---------- */

/* The page on show is `page`, an input (the visitor's own while nobody takes it), handed out and sent as `page` on
 * every turn: a swipe, a dot, the button (the `next` slot until the last page, `done` there). Skip (`skip`) jumps to
 * the last page only while nothing is wired to it; wired, it does what its action does. */
export function Onboarding({ rows = [], skip = "", next = "", done = "", page: given = 0, width = 360, height = 520, demo, onValueChange, onEvent, wired, className, style }: { rows?: string[][]; skip?: string; next?: string; done?: string; page?: number; width?: number; height?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [page, setPage] = useValue(given, host);
  const [turned, setTurned] = useState(false);
  const from = useRef<number | null>(null);
  const last = Math.max(0, rows.length - 1);
  const at = Math.min(Math.max(0, page), last);
  const r = rows[at] ?? [];
  const go = (to: number) => {
    const next = Math.min(last, Math.max(0, to));
    setTurned(true);
    if (next === at) return;
    setPage(next);
    host.emit("page", { page: next });
  };
  return (
    <div
      data-slot="onboarding"
      data-page={at}
      className={cn("bg-surface text-on-surface flex touch-pan-y flex-col rounded-xl p-4", className)}
      style={{ width, height, ...style }}
      onPointerDown={(e) => {
        from.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (from.current === null) return;
        const dx = e.clientX - from.current;
        from.current = null;
        if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="flex h-10 justify-end">
        {skip && at < last && (
          <Button variant="text" size="xs" data-tap="skip" onClick={() => !host.wired("skip") && go(last)}>
            {skip}
          </Button>
        )}
      </div>
      <div key={at} className={cn("flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center", turned && "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4")}>
        <span className="bg-primary-container text-on-primary-container flex size-32 shrink-0 items-center justify-center rounded-2xl">{r[0] && <WidgetIcon name={r[0]} className="size-16" />}</span>
        <div className="text-headline-small">{r[1] ?? ""}</div>
        <div className={`text-body-large ${Soft}`}>{r[2] ?? ""}</div>
      </div>
      <div className="flex items-center justify-center gap-1 py-3">
        {rows.map((_, i) => (
          <Tap key={i} aria-label={`${i + 1}`} aria-current={i === at || undefined} className="flex size-6 items-center justify-center rounded-full" onClick={() => go(i)}>
            <span className={cn("size-2 rounded-full", i === at ? "bg-primary" : "bg-outline-variant")} />
          </Tap>
        ))}
      </div>
      <Button variant="filled" data-tap={at === last ? "done" : "next"} className="w-full" onClick={() => go(at + 1)}>
        {at === last ? done : next}
      </Button>
    </div>
  );
}

/* ---------- QR code: byte mode, versions 1 to 10 (ISO/IEC 18004) ---------- */

/** per level, by version 1..10: error correction codewords per block, and blocks */
const QR_LEVELS: Record<string, { bits: number; ecc: number[]; blocks: number[] }> = {
  L: { bits: 1, ecc: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18], blocks: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4] },
  M: { bits: 0, ecc: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], blocks: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] },
  Q: { bits: 3, ecc: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24], blocks: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8] },
  H: { bits: 2, ecc: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28], blocks: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8] },
};

/** the modules of a version left for data and error correction, in bits */
const qrRawBits = (version: number) => {
  let bits = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const aligns = Math.floor(version / 7) + 2;
    bits -= (25 * aligns - 10) * aligns - 55;
    if (version >= 7) bits -= 36;
  }
  return bits;
};

/** multiplication in GF(2^8) over the polynomial QR uses */
const gfTimes = (x: number, y: number) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
};

/** the Reed-Solomon remainder of `data`: its `degree` error correction codewords */
export function qrRemainder(data: number[], degree: number): number[] {
  const divisor = Array.from({ length: degree }, () => 0);
  divisor[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      divisor[j] = gfTimes(divisor[j], root);
      if (j + 1 < degree) divisor[j] ^= divisor[j + 1];
    }
    root = gfTimes(root, 2);
  }
  const rest = Array.from({ length: degree }, () => 0);
  for (const byte of data) {
    const factor = byte ^ (rest.shift() as number);
    rest.push(0);
    divisor.forEach((c, i) => (rest[i] ^= gfTimes(c, factor)));
  }
  return rest;
}

const QR_MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** how much a finished symbol looks like something a scanner trips on (the standard's four rules) */
function qrPenalty(m: boolean[][]) {
  const size = m.length;
  let score = 0;
  let dark = 0;
  const lines = (read: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a++) {
      let run = 0;
      let last = false;
      let word = 0;
      for (let b = 0; b < size; b++) {
        const v = read(a, b);
        if (b > 0 && v === last) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
          last = v;
        }
        word = ((word << 1) | (v ? 1 : 0)) & 0x7ff;
        if (b >= 10 && (word === 0b10111010000 || word === 0b00001011101)) score += 40;
      }
    }
  };
  lines((y, x) => m[y][x]);
  lines((x, y) => m[y][x]);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (y + 1 < size && x + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    }
  return score + Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
}

/** the modules of a QR code for `text`, or null when it does not fit in version 10 */
export function qrMatrix(text: string, level = "M"): boolean[][] | null {
  const spec = QR_LEVELS[level] ?? QR_LEVELS.M;
  const bytes = [...new TextEncoder().encode(text)];
  let version = 0;
  let capacity = 0;
  for (let v = 1; v <= 10; v++) {
    capacity = Math.floor(qrRawBits(v) / 8) - spec.ecc[v - 1] * spec.blocks[v - 1];
    if (4 + (v <= 9 ? 8 : 16) + bytes.length * 8 <= capacity * 8) {
      version = v;
      break;
    }
  }
  if (!version) return null;

  /* the data: mode, length, bytes, terminator, then padding up to capacity */
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, capacity * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity * 8; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = Array.from({ length: capacity }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));

  /* split into blocks, add error correction, interleave */
  const eccLength = spec.ecc[version - 1];
  const count = spec.blocks[version - 1];
  const shortData = Math.floor(capacity / count);
  const longFrom = count - (capacity % count);
  const blocks: number[][] = [];
  for (let i = 0, at = 0; i < count; i++) {
    const length = shortData + (i < longFrom ? 0 : 1);
    blocks.push(data.slice(at, at + length));
    at += length;
  }
  const eccs = blocks.map((b) => qrRemainder(b, eccLength));
  const stream: number[] = [];
  for (let i = 0; i <= shortData; i++) blocks.forEach((b) => i < b.length && stream.push(b[i]));
  for (let i = 0; i < eccLength; i++) eccs.forEach((e) => stream.push(e[i]));

  /* the fixed patterns */
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const fixed = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const mark = (x: number, y: number, on: boolean) => {
    modules[y][x] = on;
    fixed[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    mark(6, i, i % 2 === 0);
    mark(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) mark(x, y, ring !== 2 && ring !== 4);
      }
  if (version >= 2) {
    const aligns = Math.floor(version / 7) + 2;
    const step = Math.ceil((version * 4 + 4) / (aligns * 2 - 2)) * 2;
    const spots = [6, ...Array.from({ length: aligns - 1 }, (_, i) => size - 7 - (aligns - 2 - i) * step)];
    spots.forEach((cy, j) =>
      spots.forEach((cx, i) => {
        if ((i === 0 && j === 0) || (i === 0 && j === aligns - 1) || (i === aligns - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
  }
  const format = (mask: number) => {
    const value = (spec.bits << 3) | mask;
    let rest = value;
    for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
    const word = ((value << 10) | rest) ^ 0x5412;
    const bit = (i: number) => ((word >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) mark(8, i, bit(i));
    mark(8, 7, bit(6));
    mark(8, 8, bit(7));
    mark(7, 8, bit(8));
    for (let i = 9; i < 15; i++) mark(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) mark(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) mark(8, size - 15 + i, bit(i));
    mark(8, size - 8, true);
  };
  format(0);
  if (version >= 7) {
    let rest = version;
    for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
    const word = (version << 12) | rest;
    for (let i = 0; i < 18; i++) {
      const on = ((word >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      mark(a, b, on);
      mark(b, a, on);
    }
  }

  /* the data, zigzagging up and down from the right edge */
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - step : step;
        if (fixed[y][x] || index >= stream.length * 8) continue;
        modules[y][x] = ((stream[index >>> 3] >>> (7 - (index & 7))) & 1) === 1;
        index++;
      }
  }

  /* the mask a scanner reads best */
  const masked = (mask: number) => {
    format(mask);
    return modules.map((row, y) => row.map((on, x) => (fixed[y][x] ? on : on !== QR_MASKS[mask](x, y))));
  };
  let best = masked(0);
  let bestScore = qrPenalty(best);
  for (let mask = 1; mask < 8; mask++) {
    const candidate = masked(mask);
    const score = qrPenalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function QrCode({ text = "", level = "M", caption = "", copy = "", copied = "", tooLong = "", size = 200, className, style }: { text?: string; level?: string; caption?: string; copy?: string; copied?: string; tooLong?: string; size?: number } & Look) {
  const matrix = useMemo(() => qrMatrix(text, level), [text, level]);
  const [done, setDone] = useState(false);
  const path = useMemo(() => (matrix ?? []).flatMap((row, y) => row.flatMap((on, x) => (on ? [`M${x + 4} ${y + 4}h1v1h-1z`] : []))).join(""), [matrix]);
  const take = async (e: MouseEvent) => {
    stop(e);
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* the browser refused: the button simply does not say it copied */
    }
  };
  const span = (matrix?.length ?? 0) + 8;
  return (
    <div data-slot="qr-code" data-modules={matrix?.length ?? 0} data-copied={done || undefined} className={cn("bg-surface text-on-surface inline-flex flex-col items-center gap-2 rounded-lg p-3", className)} style={{ width: size + 24, ...style }}>
      {matrix ? (
        <svg role="img" aria-label={text} viewBox={`0 0 ${span} ${span}`} width={size} height={size} shapeRendering="crispEdges">
          <path d={path} className="fill-current" />
        </svg>
      ) : (
        <div role="alert" className="text-error text-body-small flex items-center justify-center text-center" style={{ width: size, height: size }}>
          {tooLong}
        </div>
      )}
      {caption && <div className={`text-body-small w-full truncate text-center ${Soft}`}>{caption}</div>}
      {copy && matrix && (
        <Button variant="tonal" size="xs" onClick={take}>
          {done ? copied || copy : copy}
        </Button>
      )}
    </div>
  );
}
