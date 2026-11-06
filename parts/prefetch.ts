/* What the canvas is about to draw, fetched ahead of it. A part's components come the first time it is drawn
 * (parts/components.ts), and until then it holds its place: these keep that wait out of sight. The document the editor
 * opens with is fetched beside the editor itself (src/routes/index.tsx), and what its preview draws besides once the
 * editor is up; what the palette and the templates show, a little at a time while the page is idle; what a pointer
 * rests on, at once. */
import { useEffect, type RefObject } from "react";
import type { Group, Item } from "@/lib/tokens";
import { appearanceOf } from "./appearance";
import { loadModule, loadModules, modulesIn, modulesOf } from "./components";
import { partBySlug, viewOf } from "./registry";

/* what the boot screen asks before it fades (src/routes/index.tsx) */
export { modulesPending, modulesSettled } from "./components";

const NONE: readonly string[] = [];

/** The modules an item's drawing needs: on the canvas, or `live`, in the preview, where an overlay that opens itself is
 *  drawn with what opens it. */
export function modulesOfItem(it: Pick<Item, "id" | "component" | "props" | "fill" | "textColor" | "corners" | "look">, live = false): readonly string[] {
  const def = partBySlug(it.component);
  if (!def) return NONE;
  try {
    return modulesOf(viewOf(def, it.props, appearanceOf(it), undefined, live, it.id));
  } catch {
    /* a part that cannot be drawn says so when it is: nothing to fetch for it */
    return NONE;
  }
}

/** the modules a part fresh from the palette needs, with the values such a part starts with */
export function modulesOfPart(slug: string): readonly string[] {
  const def = partBySlug(slug);
  if (!def) return NONE;
  try {
    return modulesOf(viewOf(def, def.seed));
  } catch {
    return NONE;
  }
}

const unique = (lists: Iterable<readonly string[]>) => [...new Set([...lists].flat())].sort();

/** the modules the parts of these groups need */
export const modulesOfGroups = (groups: readonly Group[], live = false): string[] => unique(groups.flatMap((g) => g.items.map((it) => modulesOfItem(it, live))));

/** The modules a document needs: its screens' parts and its reusable components'. It is read as it comes from storage
 *  or a file, so anything not shaped as a document is passed over. */
export function modulesOfDoc(doc: unknown, live = false): string[] {
  const groupsIn = (v: unknown): Group[] => (Array.isArray(v) ? v.filter((g): g is Group => !!g && typeof g === "object" && Array.isArray((g as Group).items)) : []);
  if (!doc || typeof doc !== "object") return [];
  const d = doc as { groups?: unknown; components?: unknown };
  const own = groupsIn(d.groups);
  const reused = Array.isArray(d.components) ? d.components.flatMap((c: unknown) => groupsIn((c as { groups?: unknown } | null)?.groups)) : [];
  const items = [...own, ...reused].flatMap((g) => g.items.filter((it): it is Item => !!it && typeof it === "object" && typeof it.component === "string"));
  return unique(items.map((it) => modulesOfItem(it, live)));
}

/** where an earlier version kept the document it had open (lib/core/persist.ts `DOC_KEY`) */
const EDITOR_DOC_KEY = "m3e:doc";

/** The parts a new document starts with (src/editor/seed.ts `seed` and `mobileSeed`). Only a head start: whatever the starter
 *  holds that this misses is fetched when it is drawn, and the boot screen waits for it. */
export const STARTER_PARTS = ["app-bar", "button-group", "item", "fab", "navigation-bar", "button"];

/** The modules of the document the editor is about to open: `opening` (the project the tab opens,
 *  lib/projects/opening.ts), or without it the one an earlier version kept in localStorage; the starter when there is
 *  none. They are fetched beside the editor's own code, so its first frame draws the real parts; what only its preview
 *  draws waits for idle time. */
export async function loadOpeningModules(opening?: Promise<unknown>): Promise<void> {
  let keys: readonly string[] = [];
  try {
    let doc: unknown;
    if (opening) doc = await opening;
    else {
      const kept = localStorage.getItem(EDITOR_DOC_KEY);
      doc = kept ? JSON.parse(kept) : null;
    }
    keys = doc ? modulesOfDoc(doc) : unique(STARTER_PARTS.map(modulesOfPart));
    if (doc) whenStarted(() => prefetchModules(modulesOfDoc(doc, true)));
  } catch {
    /* an unreadable document is the editor's to report; the starter's modules are no use to it */
  }
  return loadModules(keys);
}

/* ---------- in idle time, once the editor is up ---------- */

/* Nothing here starts before the editor has drawn its document: the page is idle while it waits on the network at
 * start, and what is fetched then would only slow what it waits for. */
let started = false;
/** what waits for the editor to be up, and then for idle time */
const later: (() => void)[] = [];
const queue: string[] = [];
let waiting = false;
/** how many modules one idle slice starts: evaluating a chunk is the work that could get in the way of a gesture */
const PER_SLICE = 3;
/** how long after the page loaded the idle fetching starts anyway, if no editor says it is up (the gallery) */
const START_ANYWAY_MS = 8000;

type IdleWindow = { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };

const idle = (run: () => void) => {
  const ask = (window as IdleWindow).requestIdleCallback;
  if (ask) ask(run, { timeout: 3000 });
  else setTimeout(run, 200);
};

function schedule() {
  if (!started || waiting || typeof window === "undefined") return;
  if (later.length) {
    waiting = true;
    idle(() => {
      waiting = false;
      later.shift()?.();
      schedule();
    });
    return;
  }
  if (!queue.length) return;
  waiting = true;
  idle(() => {
    waiting = false;
    const batch = queue.splice(0, PER_SLICE).filter((k) => !modulesIn([k]));
    void loadModules(batch).then(schedule);
  });
}

/** The editor has drawn its document: what waits for idle time may go (src/routes/index.tsx, as the boot screen fades). */
export function startIdleFetching() {
  started = true;
  schedule();
}
if (typeof window !== "undefined") setTimeout(startIdleFetching, START_ANYWAY_MS);

/** run this in idle time once the editor is up: fetching what is likely to be wanted soon */
export function whenStarted(run: () => void) {
  if (typeof window === "undefined") return;
  later.push(run);
  schedule();
}

/** fetch these modules in idle time once the editor is up, a few at a time */
export function prefetchModules(keys: Iterable<string>) {
  for (const k of keys) if (!modulesIn([k]) && !queue.includes(k)) queue.push(k);
  schedule();
}

/** fetch these now, ahead of the queue: a pointer is on the tile, a drag may begin */
export function fetchNow(keys: Iterable<string>) {
  for (const k of keys) void loadModule(k);
}

/** What the elements matching `selector` inside a scrolled list stand for is fetched in idle time once each has come
 *  into view (a section opened, a search typed: what comes later is watched too). `keysOf` says what an element needs;
 *  it is asked in idle time too, since finding out may mean composing a kit or a template. */
export function usePrefetchInView(scroller: RefObject<HTMLElement | null>, selector: string, keysOf: (el: Element) => readonly string[]) {
  useEffect(() => {
    const root = scroller.current;
    if (!root || typeof IntersectionObserver === "undefined" || typeof MutationObserver === "undefined") return;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target;
          whenStarted(() => prefetchModules(keysOf(el)));
          io.unobserve(el);
        }
      },
      { root },
    );
    const watch = () =>
      root.querySelectorAll(selector).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        io.observe(el);
      });
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [scroller, selector, keysOf]);
}
