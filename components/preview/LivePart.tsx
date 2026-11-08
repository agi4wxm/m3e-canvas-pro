/* One part of a screen in the preview, working: a real M3E component (PartView, live), with a press landing where it
 * was aimed, an input saying what it now holds, an overlay's own dismiss button closing it, a widget's events handed
 * on. What an input shows is the preview's: the value in the preview's state is drawn into the part's prop
 * (lib/interact.ts `liveItem`), and what the visitor does to it comes back through `onField`, so the state is the one
 * place its value lives (a widget hands its value out through the part host, a base-ui control is read off the page). */

import { useEffect, useMemo, useRef } from "react";
import type { Item, VarValue } from "@/lib/tokens";
import { sizeOf } from "@/lib/tokens";
import type { TransportFile } from "@/lib/api/transport";
import { INPUT_PROP, fieldValueOf, type FieldValue } from "@/lib/interact";
import { slotAction } from "@/lib/partContract";
import { partBySlug, reader } from "@/parts/registry";
import { PartHostContext, type PartHost } from "@/parts/widgets/host";
import { PartView } from "../PartView";

/** the buttons inside an overlay that dismiss it, whichever overlay it is */
const CLOSERS = '[data-slot$="-close"], [data-slot="alert-dialog-cancel"], [data-slot="alert-dialog-action"]';

/** what an input part holds right now, read off the page: a base-ui control keeps its value to itself,
 *  so the page is the one place every kind of input can be asked the same way */
function readInput(root: HTMLElement, it: Item): VarValue | undefined {
  const def = partBySlug(it.component);
  switch (it.component) {
    case "input":
    case "text-field":
    case "textarea":
      return root.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")?.value;
    case "switch":
      return root.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "true";
    case "checkbox":
      return root.querySelector('[role="checkbox"]')?.getAttribute("aria-checked") === "true";
    case "slider": {
      const v = Number(root.querySelector<HTMLInputElement>('input[type="range"]')?.value);
      return Number.isFinite(v) ? v : undefined;
    }
    case "radio-group":
      return [...root.querySelectorAll('[role="radio"]')].findIndex((r) => r.getAttribute("aria-checked") === "true");
    case "select": {
      const text = root.querySelector('[data-slot="select-value"]')?.textContent?.trim();
      return def ? reader(def, it.props).list("items").findIndex((row) => row.label === text) : undefined;
    }
    default:
      return undefined;
  }
}

/** the files a file input holds, as the transport carries them: their bytes as data URLs, at most 25 MB each */
async function readFiles(root: HTMLElement): Promise<TransportFile[]> {
  const files = [...(root.querySelector<HTMLInputElement>('input[type="file"]')?.files ?? [])].slice(0, 10);
  const out: TransportFile[] = [];
  for (const f of files) {
    if (f.size > 25 * 1024 * 1024) continue;
    const dataUrl = await new Promise<string>((ok) => {
      const r = new FileReader();
      r.onload = () => ok(typeof r.result === "string" ? r.result : "");
      r.onerror = () => ok("");
      r.readAsDataURL(f);
    });
    if (dataUrl) out.push({ name: f.name, type: f.type || "application/octet-stream", dataUrl, size: f.size });
  }
  return out;
}

/** A real shadcn M3E component in the preview: it works. A press lands where it was aimed --
 *  on a place the part marked `data-tap` (a destination, a menu item) it fires that slot's
 *  action; anywhere else it is the part's own tap. An input says what it now holds, a button
 *  inside an overlay that dismisses it closes it. */
export function LivePart({ item, widths, screen, onTap, onSlot, onHover, easeWidth, onField, onFiles, onClose, onEvent, demo = false, held }: { item: Item; widths: Record<string, number>; screen?: { w: number; h: number }; onTap?: () => void; onSlot?: (slot: string) => void; /** the pointer came over it: an interaction that starts so */ onHover?: () => void; easeWidth?: boolean; onField?: (value: FieldValue) => void; /** a file input took files */ onFiles?: (files: TransportFile[]) => void; onClose?: () => void; /** the part sent one of its named events */ onEvent?: (name: string, payload?: Record<string, unknown>) => void; /** its prototype demo runs (lib/partContract.ts demoRuns) */ demo?: boolean; held?: boolean }) {
  const size = sizeOf(item, widths);
  const input = !!INPUT_PROP[item.component ?? ""];
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const slot = target.closest?.("[data-tap]")?.getAttribute("data-tap");
    /* a place that works by itself (the arrow that opens a split button's menu) is no press on the part */
    if (slot === "self") return;
    /* a place that answers to nothing of its own (a row of a list item with one action on the whole part) is still a press on the part */
    if (slot != null && onSlot) onSlot(slot);
    else onTap?.();
    /* a menu an effect holds open has no way to close itself: any press on it ends it */
    if (held || target.closest?.(CLOSERS)) onClose?.();
    /* a press on a labelled input is how it changes: stopping it would freeze the control */
    if ((onTap || onSlot) && !input) e.preventDefault();
  };
  const box = useRef<HTMLDivElement>(null);
  const live = useRef({ item, onField, onEvent });
  live.current = { item, onField, onEvent };
  /* the value this input last reported, told apart from one a button put in its variable: an input
   * is uncontrolled, so that one only reaches it by drawing it afresh */
  const key = INPUT_PROP[item.component ?? ""];
  const value = key ? item.props?.[key] : undefined;
  const own = useRef(value);
  const seen = useRef(value);
  const redraw = useRef(0);
  /* a list input's rows are drawn afresh each time from what holds them: the same rows are the same value */
  const same = (a: unknown, b: unknown) => a === b || (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b));
  if (!same(value, seen.current)) {
    seen.current = value;
    if (!same(value, own.current)) {
      own.current = value;
      redraw.current++;
    }
  }
  /* What a widget is handed (parts/widgets/host.ts): the preview is an explicit prototype, so a demo runs where nothing
     takes it over; an input says what it holds, an event goes to the part's on:<name> action. */
  const host = useMemo<PartHost>(
    () => ({
      demo,
      /* each opening of the preview is a first visit: nothing the visitor does here is kept on the device */
      remember: false,
      input: input
        ? (raw) => {
            const v = fieldValueOf(live.current.item, raw);
            if (v === undefined) return;
            own.current = v;
            live.current.onField?.(v);
          }
        : undefined,
      emit: (name, payload) => live.current.onEvent?.(name, payload),
      /* a control of the part's own reaches the slot's action, or its family's */
      wired: (slot) => !!slotAction(live.current.item, slot),
    }),
    [demo, input],
  );
  const slug = item.component;
  const files = useRef(onFiles);
  files.current = onFiles;
  useEffect(() => {
    const root = box.current;
    if (!root || slug !== "file-upload") return;
    const took = () => void readFiles(root).then((list) => files.current?.(list));
    root.addEventListener("change", took);
    return () => root.removeEventListener("change", took);
  }, [slug]);
  useEffect(() => {
    const root = box.current;
    if (!root || !input) return;
    const sync = () => {
      const now = readInput(root, live.current.item);
      if (now === undefined) return;
      own.current = now;
      live.current.onField?.(now);
    };
    /* typing is an event; a slider's thumb, a switch and a chosen row show only on the page */
    const watch = new MutationObserver(sync);
    watch.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-checked", "aria-valuenow"] });
    root.addEventListener("input", sync);
    root.addEventListener("change", sync);
    return () => {
      watch.disconnect();
      root.removeEventListener("input", sync);
      root.removeEventListener("change", sync);
    };
  }, [input, slug]);
  return (
    <div
      ref={box}
      data-live-part
      data-part={item.id}
      onClick={onTap || onSlot || onClose ? click : undefined}
      onPointerEnter={onHover ? () => onHover() : undefined}
      /* a tap on the whole part is a button for the keyboard too; what is focusable inside it answers for itself, its click reaching `click` */
      role={onTap ? "button" : undefined}
      tabIndex={onTap ? 0 : undefined}
      onKeyDown={
        onTap
          ? (e) => {
              if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
              e.preventDefault();
              onTap();
            }
          : undefined
      }
      style={{ position: "relative", display: "flex", flex: "0 0 auto", width: easeWidth ? "max-content" : size.w, height: size.h }}>
      <PartHostContext.Provider value={host}>
        <PartView key={`${redraw.current}:${held ? 1 : 0}`} item={item} live screen={screen} held={held} />
      </PartHostContext.Provider>
    </div>
  );
}
