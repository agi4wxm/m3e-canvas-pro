/* Instances spawned on events drawn on a web page (lib/spawn.ts): every copy of a template's pool is laid out once,
 * hidden, by whoever draws the page (the preview's screens, an exported web app's screens), each element of it marked
 * `data-spawn-of` (the template's group id) and `data-spawn-slot` (its place in the pool). This file shows, fills and
 * moves those elements as instances come and go, frame by frame on the app's clock, writing to the elements themselves:
 * nothing goes through React state, so spawning a damage number at every hit commits nothing. The words of a copy hold
 * the template's expressions marked (`⟦event.amount⟧`, lib/spawn.ts `markSpawnWords`); an instance's own fill them.
 * A copy React draws again keeps what this wrote unless its words changed, and is filled again the frame after if
 * they did. */

import type { EvalContext } from "./bindings/expr";
import { fillSpawnWords, hasSpawnMarks, spawnLook, spawnProgress, type SpawnMotion, type SpawnPlace, type Spawned, type Spawns } from "./spawn";

/** the marks a laid out copy of a template carries */
export const SPAWN_OF = "data-spawn-of";
export const SPAWN_SLOT = "data-spawn-slot";
/** set on a copy while an instance is drawn in it: the instance's serial, and the entity it stands over */
const SPAWN_SERIAL = "data-spawn-serial";
const SPAWN_AT = "data-spawn-at";

export type SpawnDriverOptions = {
  /** the app's clock, ms (the domain clock: the preview's mocks', an app's transport) */
  now: () => number;
  /** how a template's instances move, by its group id */
  motion: (group: string) => SpawnMotion | undefined;
  /** where an instance anchored to an entity goes (nothing yet places one: it stays at its template's place) */
  place?: SpawnPlace;
  ctx?: () => EvalContext | undefined;
};

type Frame = { request(run: () => void): unknown; cancel(id: unknown): void };
const frames = (): Frame => {
  const g = globalThis as { requestAnimationFrame?: (f: () => void) => number; cancelAnimationFrame?: (id: number) => void };
  if (typeof g.requestAnimationFrame === "function" && typeof g.cancelAnimationFrame === "function") return { request: (f) => g.requestAnimationFrame!(f), cancel: (id) => g.cancelAnimationFrame!(id as number) };
  return { request: (f) => setTimeout(f, 16), cancel: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };
};

/** the words a copy's text was drawn with, before an instance filled them */
const drawnWords = new WeakMap<Text, string>();

/** fills the marked words under an element as an instance has them */
function fillWords(el: Element, s: Spawned, ctx: EvalContext | undefined) {
  const doc = el.ownerDocument;
  if (!doc) return;
  const walk = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    const now = n.nodeValue ?? "";
    /* words still marked are as the copy was drawn (React may have drawn them again): they are what is filled */
    if (hasSpawnMarks(now)) drawnWords.set(n, now);
    const drawn = drawnWords.get(n);
    if (drawn !== undefined) n.nodeValue = fillSpawnWords(drawn, s, ctx);
  }
}

/** whether what a copy shows is still what this wrote: its words were drawn again with their marks when not */
function marked(el: Element): boolean {
  const doc = el.ownerDocument;
  if (!doc) return false;
  const walk = doc.createTreeWalker(el, 4);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (hasSpawnMarks(n.nodeValue ?? "")) return true;
  return false;
}

function hide(el: HTMLElement) {
  if (!el.hasAttribute(SPAWN_SERIAL)) return;
  el.removeAttribute(SPAWN_SERIAL);
  el.removeAttribute(SPAWN_AT);
  el.style.visibility = "hidden";
  el.style.opacity = "";
  el.style.translate = "";
}

/** Draws the instances of `spawns` in the copies laid out under `root`, from now until what it gives back is called.
 *  It runs a frame loop only while an instance is alive (a paused clock keeps it running, the instances standing
 *  still), and wakes on a spawn. */
export function driveSpawns(root: () => ParentNode | null, spawns: Spawns, o: SpawnDriverOptions): () => void {
  const f = frames();
  let loop: unknown;
  let stopped = false;
  const step = () => {
    loop = undefined;
    if (stopped) return;
    const at = root();
    if (!at) return;
    const now = o.now();
    const ctx = o.ctx?.();
    let any = false;
    for (const el of Array.from(at.querySelectorAll<HTMLElement>(`[${SPAWN_OF}]`))) {
      const group = el.getAttribute(SPAWN_OF) ?? "";
      const slot = Number(el.getAttribute(SPAWN_SLOT));
      const s = spawns.live(group, now).find((x) => x.slot === slot);
      if (!s) {
        hide(el);
        continue;
      }
      any = true;
      if (el.getAttribute(SPAWN_SERIAL) !== String(s.serial) || marked(el)) {
        fillWords(el, s, ctx);
        el.setAttribute(SPAWN_SERIAL, String(s.serial));
        if (s.at) el.setAttribute(SPAWN_AT, s.at);
        else el.removeAttribute(SPAWN_AT);
        el.style.visibility = "visible";
      }
      const look = spawnLook(o.motion(group), spawnProgress(s, now));
      const placed = s.at ? o.place?.(s.at, s) : undefined;
      el.style.opacity = look.opacity === 1 ? "" : String(look.opacity);
      el.style.translate = placed || look.rise ? `${placed?.x ?? 0}px ${(placed?.y ?? 0) - look.rise}px` : "";
    }
    if (any) loop = f.request(step);
  };
  const wake = () => {
    if (loop === undefined && !stopped) loop = f.request(step);
  };
  const off = spawns.subscribe(wake);
  wake();
  return () => {
    stopped = true;
    off();
    if (loop !== undefined) f.cancel(loop);
  };
}
