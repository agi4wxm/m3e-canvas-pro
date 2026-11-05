
import { useEffect, useSyncExternalStore } from "react";
import { setIconFamily, type IconFamily } from "@/components/m3e/icon";
import { familyIds } from "@/components/m3e/icon-family";
import { registerIcons } from "@/components/m3e/icon-registry";
import { isNode, isRaw, type PNode, type PValue } from "./node";

/* The M3E components draw icons from bundled data (only the glyphs their own code uses). A
 * sketch may use any Material Symbol, so the ones the parts name are fetched from Iconify
 * once, registered, and the parts drawn again. The code the canvas prints is unchanged:
 * `bun run gen:icons` bundles them in the project that uses it. A family other than Rounded
 * is fetched the same way, and the Rounded drawing stands in until it arrives. */

const API = "https://api.iconify.design";
const asked = new Set<string>();
/** the icons Iconify has sent so far */
const arrived = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
const pending = new Set<string>();
let family: IconFamily = "rounded";
/** every name asked for so far: a newly chosen family has to fetch them too */
const named = new Set<string>();

const ids = (name: string) => {
  const base = name.replaceAll("_", "-");
  return [`material-symbols:${base}-outline-rounded`, `material-symbols:${base}-rounded`, ...familyIds(family, name)];
};

async function fetchChunk(prefix: string, chunk: string[]) {
  try {
    const res = await fetch(`${API}/${prefix}.json?icons=${chunk.join(",")}`);
    if (!res.ok) return;
    const data = await res.json();
    registerIcons(data);
    for (const id of [...Object.keys(data.icons ?? {}), ...Object.keys(data.aliases ?? {})]) arrived.add(`${prefix}:${id}`);
    version++;
    listeners.forEach((l) => l());
  } catch {
    // offline: the parts keep drawing the icons that are bundled
  }
}

async function flush() {
  const byPrefix = new Map<string, string[]>();
  for (const id of pending) {
    const [prefix, name] = id.split(":");
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
  }
  pending.clear();
  for (const [prefix, names] of byPrefix) for (let i = 0; i < names.length; i += 60) await fetchChunk(prefix, names.slice(i, i + 60));
}

/** ask for the icons a part uses; the ones already asked for are skipped */
export function ensureIcons(names: Iterable<string>) {
  if (typeof window === "undefined") return;
  for (const name of names) {
    if (!name) continue;
    named.add(name);
    for (const id of ids(name)) {
      if (asked.has(id)) continue;
      asked.add(id);
      pending.add(id);
    }
  }
  if (pending.size && timer === undefined) {
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, 30);
  }
}

/** The document's icons take this drawing: whatever has been asked for so far is fetched in it, and drawn again. */
export function useIconFamily(next: IconFamily) {
  useEffect(() => {
    if (next === family) return;
    family = next;
    setIconFamily(next);
    ensureIcons(named);
    version++;
    listeners.forEach((l) => l());
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

/** Fetch the icons of a tree, and say how many of them have arrived. PartView draws afresh when this
 *  changes, which is only for this tree's own icons: another part's arriving must not reset this one's
 *  state, and a widget's run-time icons are drawn by WidgetIcon, which sees to itself. */
export function useIcons(node: PNode) {
  const names = [...iconNamesIn(node)].join(",");
  useEffect(() => ensureIcons(names ? names.split(",") : []), [names]);
  /* how much of this tree's icons has been sent, under the family's name: changing family draws the tree again even if nothing is left to
   * fetch. Every drawing counts, the family's own and the one that stands in for it: the solid family's own ids end like the stand-in's */
  const count = () => `${family}:${names ? names.split(",").reduce((sent, name) => sent + ids(name).filter((id) => arrived.has(id)).length, 0) : 0}`;
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    count,
    () => "rounded:0",
  );
}
