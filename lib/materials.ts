/* The document's library of materials (`Doc.materials`, docs/m3e-material.md): what comes in from a material pack, how
 * the library is kept, which looks use which material, and how a material is told to a model.
 *
 * The format itself (reading a file, cleaning a material and a layer) is lib/material.ts, copied unchanged from Material
 * Pro; the CSS a layer paints is lib/materialCss.ts. Plain data: no DOM here. */

import { cleanLook } from "./look";
import { cleanMaterial, cleanMaterialLayer, openMaterialFile, uniqueId, type MaterialDef, type MaterialLayer } from "./material";
import { layerOpacity } from "./materialCss";

/** how many materials a document keeps: what a file may hold */
export const MAX_DOC_MATERIALS = 200;

/** One material as a document keeps it: the format's cleaning, and its fallback look through the look's own, so a
 *  renderer without pictures can wear it as any look. */
export function cleanDocMaterial(v: unknown): MaterialDef | undefined {
  const m = cleanMaterial(v);
  if (!m) return undefined;
  if (m.fallbackLook) {
    const look = cleanLook(m.fallbackLook);
    if (look) m.fallbackLook = look as Record<string, unknown>;
    else delete m.fallbackLook;
  }
  return m;
}

/** The library as a document may keep it: each material whole and cleaned, an id that comes again dropped (the first
 *  one named so is the one its layers have drawn), at most MAX_DOC_MATERIALS. Nothing when none is left. */
export function cleanDocMaterials(v: unknown): MaterialDef[] | undefined {
  if (!Array.isArray(v)) return undefined;
  /* a library this cleaned already is not read again: its pictures are megabytes, and an undo brings it back often */
  if (CLEAN.has(v)) return v as MaterialDef[];
  const seen = new Set<string>();
  const out: MaterialDef[] = [];
  for (const raw of v) {
    if (out.length >= MAX_DOC_MATERIALS) break;
    const m = cleanDocMaterial(raw);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  if (!out.length) return undefined;
  CLEAN.add(out);
  return out;
}

/** the libraries cleanDocMaterials gave: not changed since, as the store never changes what it holds */
const CLEAN = new WeakSet<readonly unknown[]>();

/** What importing a material file does to a library: the file's materials added after the ones there, each id made
 *  unique against them (`bricks-2`), never replacing one. `added` are the new materials as they are now named; null
 *  when the file is no material pack, or nothing in it is whole. */
export function importMaterials(library: readonly MaterialDef[] | undefined, file: unknown): { materials: MaterialDef[]; added: MaterialDef[]; skipped: number } | null {
  const opened = openMaterialFile(file);
  if (!opened) return null;
  const have = library ?? [];
  const taken = new Set(have.map((m) => m.id));
  const added: MaterialDef[] = [];
  let skipped = 0;
  for (const raw of opened) {
    const m = cleanDocMaterial(raw);
    if (!m || have.length + added.length >= MAX_DOC_MATERIALS) {
      skipped++;
      continue;
    }
    m.id = uniqueId(m.id, taken);
    taken.add(m.id);
    added.push(m);
  }
  if (!added.length) return null;
  const materials = [...have, ...added];
  CLEAN.add(materials);
  return { materials, added, skipped };
}

/** the library without one material, still known to be clean */
export function withoutMaterial(library: readonly MaterialDef[], id: string): MaterialDef[] | undefined {
  const rest = library.filter((m) => m.id !== id);
  if (!rest.length) return undefined;
  CLEAN.add(rest);
  return rest;
}

/* ---------- where materials are used ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** every material layer anywhere in `value` (looks of parts on the screens and in the definitions, a look a style or
 *  a preset carries), as it is cleaned */
export function materialLayersIn(value: unknown, out: MaterialLayer[] = [], depth = 0): MaterialLayer[] {
  if (depth > 64) return out;
  if (Array.isArray(value)) for (const v of value) materialLayersIn(v, out, depth + 1);
  else if (isRecord(value)) {
    if (value.type === "material") {
      const l = cleanMaterialLayer(value, () => true);
      if (l) out.push(l);
      return out;
    }
    for (const [k, v] of Object.entries(value)) if (k !== "materials" && typeof v === "object") materialLayersIn(v, out, depth + 1);
  }
  return out;
}

/** the opacities each material is drawn at below 100%: what the page's sheet makes faded copies of the pictures for */
export function materialOpacities(doc: unknown): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const l of materialLayersIn(doc)) {
    const o = layerOpacity(l);
    if (o >= 100) continue;
    let set = out.get(l.material);
    if (!set) out.set(l.material, (set = new Set()));
    set.add(o);
  }
  return out;
}

/** how many layers name each material */
export function materialUseCounts(doc: unknown): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of materialLayersIn(doc)) out.set(l.material, (out.get(l.material) ?? 0) + 1);
  return out;
}

/** the materials the document's looks name, in the library's order: what an export carries */
export function usedMaterials(doc: { materials?: readonly MaterialDef[] } & Record<string, unknown>): MaterialDef[] {
  const used = new Set(materialLayersIn({ ...doc, materials: undefined }).map((l) => l.material));
  return (doc.materials ?? []).filter((m) => used.has(m.id));
}

/* ---------- what a model is told ---------- */

/** a material in a few words: its name and its main colours */
export const materialWords = (m: MaterialDef) => `${m.name} (${m.swatch.palette.join(", ")}${m.description ? `; ${m.description.slice(0, 120)}` : ""})`;

/** a material layer as a model reads it: "material Bricks (#601d16, #797878), tinted primary" */
export function describeMaterialLayer(layer: MaterialLayer, materials: readonly MaterialDef[] | undefined): string {
  const m = materials?.find((d) => d.id === layer.material);
  const what = m ? `material ${materialWords(m)}` : `material ${layer.material} (not in the document's library: draws nothing)`;
  return layer.mode === "tint" ? `${what}, tinted ${layer.tint ?? m?.swatch.average ?? "its own average colour"}` : what;
}

/** the library as a model may name it: ids, names, main colours and lightness, never the pictures */
export const materialsForModel = (materials: readonly MaterialDef[] | undefined) =>
  (materials ?? []).map((m) => ({ id: m.id, name: m.name, palette: m.swatch.palette, lightness: Math.round(m.swatch.lightness), ...(m.tags ? { tags: m.tags } : {}) }));

/* ---------- where pictures are not drawn ---------- */

/**
 * A look for a renderer that lays no picture as a fill (the phone kit, the mini-program kit): each material layer stands
 * as a solid layer of the colour it would mostly show, its tint or its material's average colour, at its opacity
 * (docs/m3e-material.md §4 "不支持图片的场合"). A layer whose material the library lacks draws nothing, as it would. The
 * look itself when it has no material layer.
 */
export function lookAsColours<L extends { fills?: readonly unknown[] }>(look: L, materials: readonly MaterialDef[] | undefined): { look: L; replaced: number } {
  if (!look.fills?.some((f) => isRecord(f) && f.type === "material")) return { look, replaced: 0 };
  let replaced = 0;
  const fills = look.fills.flatMap((f) => {
    if (!isRecord(f) || f.type !== "material") return [f];
    replaced++;
    const l = cleanMaterialLayer(f, (c) => typeof c === "string");
    const m = l && materials?.find((d) => d.id === l.material);
    if (!l || !m) return [];
    const base = l.mode === "tint" && l.tint ? l.tint : m.swatch.average;
    const opacity = layerOpacity(l);
    const color = opacity >= 100 ? base : withShare(base, opacity);
    return [{ type: "solid", color, ...(l.hidden ? { hidden: true } : {}) }];
  });
  return { look: { ...look, fills }, replaced };
}

/** a colour reference shown at a share of itself: a role at that share, a hex with that alpha */
function withShare(ref: string, share: number): string {
  const role = /^([a-z]+(?:-[a-z]+)*)(?:\/(\d{1,3}))?$/.exec(ref);
  if (role) return `${role[1]}/${Math.round(((role[2] === undefined ? 100 : Number(role[2])) * share) / 100)}`;
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(ref);
  if (!hex) return ref;
  const alpha = ((hex[2] ? parseInt(hex[2], 16) : 255) * share) / 100;
  return `#${hex[1]}${Math.round(alpha).toString(16).padStart(2, "0")}`;
}
