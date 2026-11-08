import { useEffect, useSyncExternalStore } from "react";
import { familyGlyph, setIconFamily, type IconFamily } from "@/components/m3e/icon";
import core from "@/components/m3e/icon-data";
import { isKnownIcon, registerIcons } from "@/components/m3e/icon-registry";
import { loadIcons } from "@/components/m3e/icon-sets/load";
import type { IconifyJSON } from "@iconify/react/offline";
import { isNode, isRaw, type PNode, type PValue } from "./node";

/* The M3E components draw icons from bundled data. A sketch may use any Material Symbol, so the ones the
 * parts name are loaded from the bundled sets (components/m3e/icon-sets): the Rounded glyph, and the
 * chosen family's own drawing of it, each set in shards fetched the first time a name in them is drawn.
 * Rounded stands in until the family's glyph arrives, and for a name the family lacks. Only a name no set
 * bundles (one an author typed) is fetched from Iconify, as a last resort that needs the network. The code
 * the canvas prints is unchanged: an exported project carries its own glyphs. */

const API = "https://api.iconify.design";
let version = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
const pending = new Set<string>();
let family: IconFamily = "rounded";
/** every name asked for so far: a newly chosen family has to load them too */
const named = new Set<string>();
/** `family:name` once loaded, so a name is asked for once per family */
const asked = new Set<string>();
/** names asked of Iconify */
const fetched = new Set<string>();

/* ---------- the document's own icons ---------- */

/* A part names one of the document's own icons `svg:<id>` (lib/docIcons.ts); they are registered with the document
 * (src/editor/docIcons.ts turns its drawings into an Iconify collection), never fetched. Kept apart from lib/docIcons
 * here: this file goes into exported projects, which register theirs from src/doc-icons.ts. */
const DOC_ICON_PREFIX = "svg:";

/** the drawings registered for the document's own icons, by id, as they were kept: what tells one that changed */
let docDrawn: Readonly<Record<string, string>> = {};
const docListeners = new Set<() => void>();

/** The document's own icons, drawn from now on: `set` holds those that are new or changed as Iconify icons, and
 *  every tree that names one whose drawing changed is drawn again. */
export function registerDocIcons(drawings: Readonly<Record<string, string>>, set: IconifyJSON | null) {
  const changedSome = Object.keys(set?.icons ?? {}).length > 0 || Object.keys(docDrawn).some((id) => !(id in drawings));
  docDrawn = drawings;
  if (set && Object.keys(set.icons).length) registerIcons(set);
  if (changedSome) {
    changed();
    docListeners.forEach((l) => l());
  }
}

/** the document's own icons as they are drawn now, id → drawing */
export const docIcons = (): Readonly<Record<string, string>> => docDrawn;

/** the document's own icons, kept up to date (the icon picker lists them) */
export function useDocIcons(): Readonly<Record<string, string>> {
  return useSyncExternalStore(
    (l) => {
      docListeners.add(l);
      return () => docListeners.delete(l);
    },
    docIcons,
    docIcons,
  );
}

const isDoc = (name: string) => name.startsWith(DOC_ICON_PREFIX);

const base = (name: string) => name.replaceAll("_", "-");
const rounded = (name: string) => [`material-symbols:${base(name)}-outline-rounded`, `material-symbols:${base(name)}-rounded`];
/* Both glyphs, outlined and filled: a part draws either, and the components' own icons (icon-data.ts) carry only
 * some names' filled glyph -- a name with one of the two is still to be fetched, from its shard or Iconify. */
const whole = (name: string) => rounded(name).every(isKnownIcon);
/** the glyphs a name is drawn with now, outlined and filled: the family's once they are here, else Rounded's once they are, else none */
const drawnWith = (name: string) => (isDoc(name) ? `doc:${hashOf(docDrawn[name.slice(DOC_ICON_PREFIX.length)] ?? "")}` : [false, true].map((filled) => familyGlyph(name, filled) ?? (isKnownIcon(rounded(name)[filled ? 1 : 0]) ? "r" : "")).join("|"));
/** a short hash of a drawing, so a tree draws again when one of its document icons is drawn anew */
function hashOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* the names the components draw inside themselves (a dialog's close button, a menu's chevron): they are in
 * no part's tree, and a family brings its drawing of them too */
const INNER = [...new Set([...Object.keys(core.icons), ...Object.keys(core.aliases ?? {})].map((n) => n.replace(/(-outline)?-rounded$/, "")))];

function changed() {
  version++;
  listeners.forEach((l) => l());
}

/** the names no bundled set draws, from Iconify; offline they stay blank, as before */
async function fromIconify(names: string[]) {
  const glyphs = names.flatMap((n) => rounded(n).map((id) => id.split(":")[1]));
  for (let i = 0; i < glyphs.length; i += 60) {
    try {
      const res = await fetch(`${API}/material-symbols.json?icons=${glyphs.slice(i, i + 60).join(",")}`);
      if (!res.ok) return;
      registerIcons(await res.json());
      changed();
    } catch {
      return;
    }
  }
}

/* A name still not drawn once its shard was asked for (the chunk did not come: offline, or a new deploy replaced the
 * chunks) is asked for again: by the next draw that names it, and on its own a few times, further apart each time, and
 * when the browser is back online. A shard that came is never fetched twice (components/m3e/icon-sets/load.ts). */
const RETRY_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000];
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retrying = new Set<string>();

function retryNow() {
  if (retryTimer !== undefined) clearTimeout(retryTimer);
  retryTimer = undefined;
  const again = retrying;
  retrying = new Set();
  ensureIcons(again);
}

function retryLater(names: string[], drawn: IconFamily) {
  for (const n of names) {
    asked.delete(`${drawn}:${base(n)}`);
    retrying.add(n);
  }
  if (retryTimer !== undefined || retries >= RETRY_MS.length) return;
  retryTimer = setTimeout(retryNow, RETRY_MS[retries++]);
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function")
  window.addEventListener("online", () => {
    retries = 0;
    if (retrying.size) retryNow();
  });

async function flush() {
  const names = [...pending];
  pending.clear();
  const drawn = family;
  if (await loadIcons(drawn, names)) changed();
  const missing = names.filter((n) => !fetched.has(n) && !whole(n));
  missing.forEach((n) => fetched.add(n));
  if (missing.length) await fromIconify(missing);
  const undrawn = names.filter((n) => !whole(n));
  if (undrawn.length) retryLater(undrawn, drawn);
  else retries = 0;
}

/** load the icons a part uses, in the current family; the ones already loaded are skipped */
export function ensureIcons(names: Iterable<string>) {
  if (typeof window === "undefined") return;
  for (const name of names) {
    /* the document's own are registered with the document, never fetched */
    if (!name || isDoc(name)) continue;
    named.add(name);
    const key = `${family}:${base(name)}`;
    if (asked.has(key)) continue;
    asked.add(key);
    pending.add(name);
  }
  if (pending.size && timer === undefined) {
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, 30);
  }
}

/** the family whose drawings of INNER have arrived: until they do, a part drawn in it is drawn again when they come */
let inner: IconFamily = "rounded";

/** The document's icons take this drawing: whatever has been asked for so far is loaded in it, and drawn again. */
export function useIconFamily(next: IconFamily) {
  useEffect(() => {
    if (next === family) return;
    family = next;
    setIconFamily(next);
    ensureIcons(named);
    void loadIcons(next, INNER).then(() => {
      if (family !== next) return;
      inner = next;
      changed();
    });
    changed();
  }, [next]);
}

/** the icon names a tree uses: `<Icon name>` and the `icon`-like string props */
function iconNamesIn(node: PNode, into = new Set<string>()): Set<string> {
  const visit = (v: PValue): void => {
    if (isRaw(v)) return;
    if (isNode(v)) iconNamesIn(v, into);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === "object" && v !== null) Object.values(v).forEach(visit);
  };
  if (node.type === "Icon" && typeof node.props?.name === "string") into.add(node.props.name);
  for (const [k, v] of Object.entries(node.props ?? {})) {
    if (typeof v === "string" && (k === "icon" || k === "leadingIcon" || k === "trailingIcon")) into.add(v);
    else visit(v);
  }
  for (const c of node.children ?? []) if (typeof c !== "string") iconNamesIn(c, into);
  return into;
}

/** draw again when icons have arrived */
export function useIconVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
}

/** Load the icons of a tree, and say how many of them have arrived. PartView draws afresh when this
 *  changes, which is only for this tree's own icons: another part's arriving must not reset this one's
 *  state, and a widget's run-time icons are drawn by WidgetIcon, which sees to itself. */
export function useIcons(node: PNode) {
  const names = [...iconNamesIn(node)].join(",");
  useEffect(() => ensureIcons(names ? names.split(",") : []), [names]);
  /* what this tree's icons are drawn with now, under the family's name: changing family draws the tree again even if nothing is left to
   * load, and so does a glyph taking another's place (Pixel's own arriving over the Sharp one that stood in for it) */
  const count = () => `${family}${inner === family ? "" : "~"}:${names ? names.split(",").map(drawnWith).join(",") : ""}`;
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    count,
    () => "rounded:0",
  );
}
