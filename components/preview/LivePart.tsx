/* One part of a screen in the preview, working: a real M3E component (PartView, live), with a press landing where it
 * was aimed, an input saying what it now holds, an overlay's own dismiss button closing it, a widget's events handed
 * on. What an input shows is the preview's: the value in the preview's state is drawn into the part's prop
 * (lib/interact.ts `liveItem`), and what the visitor does to it comes back through `onField`, so the state is the one
 * place its value lives. Every input is controlled: a widget takes its value as that prop and hands it out through the
 * part host, and a base-ui control (a text field, a switch, a select…) is drawn controlled by parts/render.tsx with the
 * same prop and the same host. */

import { useEffect, useMemo, useRef } from "react";
import type { Item } from "@/lib/tokens";
import { sizeOf } from "@/lib/tokens";
import type { TransportFile } from "@/lib/api/transport";
import { INPUT_PROP, fieldValueOf, type FieldValue } from "@/lib/interact";
import { slotAction } from "@/lib/partContract";
import { PartHostContext, type PartHost } from "@/parts/widgets/host";
import { PartView } from "../PartView";

/** the buttons inside an overlay that dismiss it, whichever overlay it is */
const CLOSERS = '[data-slot$="-close"], [data-slot="alert-dialog-cancel"], [data-slot="alert-dialog-action"]';

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
export function LivePart({ item, widths, screen, onTap, onSlot, onHover, easeWidth, onField, onFiles, onClose, onEvent, demo = false, held, focus, focusSlots }: { /** what a keyboard's or a gamepad's focus knows it by (lib/focus/dom.ts): its id, "off" for never */ focus?: string; /** each of its places takes the focus */ focusSlots?: boolean; item: Item; widths: Record<string, number>; screen?: { w: number; h: number }; onTap?: () => void; onSlot?: (slot: string) => void; /** the pointer came over it: an interaction that starts so */ onHover?: () => void; easeWidth?: boolean; onField?: (value: FieldValue) => void; /** a file input took files */ onFiles?: (files: TransportFile[]) => void; onClose?: () => void; /** the part sent one of its named events */ onEvent?: (name: string, payload?: Record<string, unknown>) => void; /** its prototype demo runs (lib/partContract.ts demoRuns) */ demo?: boolean; held?: boolean }) {
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
  /* What a part is handed (parts/widgets/host.ts): the preview is an explicit prototype, so a demo runs where nothing
     takes it over; an input, a widget or a base-ui control drawn controlled, says what it holds; an event goes to the
     part's on:<name> action. */
  const host = useMemo<PartHost>(
    () => ({
      demo,
      /* each opening of the preview is a first visit: nothing the visitor does here is kept on the device */
      remember: false,
      input: input
        ? (raw) => {
            const v = fieldValueOf(live.current.item, raw);
            if (v !== undefined) live.current.onField?.(v);
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
  return (
    <div
      ref={box}
      data-live-part
      data-part={item.id}
      data-focus={focus}
      data-focus-slots={focusSlots ? "" : undefined}
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
        <PartView key={held ? "held" : "free"} item={item} live screen={screen} held={held} />
      </PartHostContext.Provider>
    </div>
  );
}
