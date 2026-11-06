/* What a document loads from other sites when it is drawn, and whether the open project may. A picture, a video, a
 * sound or a web page at an outside address (http:, https:, or //host/…) is fetched by the browser the moment a part
 * shows it, which tells that site who opened the document and when: a design someone else made can carry such a
 * tracker as easily as a mail can. So, as mail clients do, a project that came from a file or a link with outside
 * addresses in it loads none of them until the author allows it (`setOutsideBlocked`, kept per project in its
 * listing, lib/projects; the choice itself is lib/outsidePolicy.ts): the parts draw their empty picture instead. The project's own pictures (data: URLs,
 * `m3e-asset:` ones) are never held back, and neither is a project the author made here; an exported project is
 * left alone (lib/exportProject.ts never reads this). */

import type { ListItem, PartDef, PropValues } from "../parts/types";
import { partBySlug } from "../parts/registry";
import type { Doc, Frame, Group } from "./tokens";

/** an address the browser would fetch from another site */
export const isOutside = (v: unknown): v is string => typeof v === "string" && /^\s*(https?:)?\/\//i.test(v);

/** the props of a part that fetch what they hold: pictures, rows' pictures, a video's or a sound's address */
const fetches = (d: PartDef["props"][number]) => d.kind === "image" || (d.kind === "list" && !!d.images) || (d.kind === "text" && d.key === "src");

/** a web page a part opens, when it is told to load one */
const loadsPage = (def: PartDef, values: PropValues) => def.slug === "web-view" && values.load === true && isOutside(values.address);

/** The outside addresses a part's values fetch when it is drawn. */
export function outsideOf(def: PartDef, values: PropValues | undefined): string[] {
  if (!values) return [];
  const out: string[] = [];
  for (const d of def.props) {
    if (!fetches(d)) continue;
    const v = values[d.key];
    if (d.kind === "list") {
      if (Array.isArray(v)) for (const row of v as ListItem[]) if (isOutside(row?.image)) out.push(row.image!);
    } else if (isOutside(v)) out.push(v);
  }
  if (loadsPage(def, values)) out.push(values.address as string);
  return out;
}

/** A part's values with nothing to fetch from outside: each such picture or address emptied (the part draws its
 *  placeholder), a web page not loaded. The same object when there was nothing. */
export function withoutOutside(def: PartDef, values: PropValues | undefined): PropValues | undefined {
  if (!values) return values;
  let out = values;
  const put = (key: string, v: unknown) => {
    if (out === values) out = { ...values };
    out[key] = v;
  };
  for (const d of def.props) {
    if (!fetches(d)) continue;
    const v = values[d.key];
    if (d.kind === "list") {
      if (Array.isArray(v) && v.some((row) => isOutside((row as ListItem | null)?.image))) put(d.key, (v as ListItem[]).map((row) => (isOutside(row?.image) ? { ...row, image: "" } : row)));
    } else if (isOutside(v)) put(d.key, "");
  }
  if (loadsPage(def, values)) put("load", false);
  return out;
}

/** every outside address a document would fetch: its parts, the parts inside its components, its screens' tracing
 *  pictures */
export function outsideInDoc(doc: Pick<Doc, "groups"> & Partial<Pick<Doc, "components" | "frames">>): string[] {
  const seen = new Set<string>();
  const parts = (groups: Group[]) => {
    for (const g of groups)
      for (const it of g.items) {
        const def = partBySlug(it.component);
        if (def) for (const url of outsideOf(def, it.props)) seen.add(url);
      }
  };
  parts(doc.groups ?? []);
  for (const c of doc.components ?? []) parts(c.groups ?? []);
  for (const f of (doc.frames ?? []) as Frame[]) if (isOutside(f.backgroundImage)) seen.add(f.backgroundImage);
  /* what an instance overrides of a picture is a value too */
  for (const g of doc.groups ?? []) for (const [k, v] of Object.entries(g.overrides ?? {})) if (/\/(src|image|cover|avatar)$/.test(k) && isOutside(v)) seen.add(v);
  return [...seen];
}
